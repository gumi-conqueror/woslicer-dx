import { effectScope, inject, provide, watch, type InjectionKey } from 'vue';
import type { EditorStore } from '../slicing/editor-store';
import { renderSlice } from '../core/audio/slice';
import { sliceRanges } from '../core/slices';
import { FULL_SCALE } from '../core/audio/pcm';
import { sliceIndexAtOrBefore } from '../core/markers';
import { sampleToTick } from '../core/timebase';
import { DEFAULT_PLAYBACK_RATE, PLAYBACK_RATES, advanceSamples } from '../core/rate';
import { findCueCrossing } from '../core/cuecursor';
import { createCueSynth } from './cue';
import { createInputTimeline } from './input-timeline';

export interface Playback {
  play(): void;
  pause(): void;
  stop(): void;
  togglePlayPause(): void;
  seekSample(sample: number): void;
  currentSample(): number;
  positionAt(time: number): { sample: number; playing: boolean } | null;
  setRate(rate: number): void;
  previewSlice(previous?: boolean): void;
  getAudioContext(): AudioContext;
  dispose(): void;
}

/** One owner per editor. All reactive effects and audio nodes share this lifetime. */
export function createPlayback(editor: EditorStore): Playback {
  const context = new AudioContext();
  const master = context.createGain();
  master.connect(context.destination);
  const cue = createCueSynth(context);
  const scope = effectScope(true);
  const inputTimeline = createInputTimeline();
  let buffer: AudioBuffer | null = null;
  let track: AudioBufferSourceNode | null = null;
  let preview: AudioBufferSourceNode | null = null;
  let frame = 0;
  let disposed = false;
  let anchorSample = 0;
  let anchorTime = 0;
  let activeRate = editor.playbackRate;
  let lastCueTick = 0;

  function tickAtSample(sample: number): number {
    return editor.timeBase ? sampleToTick(sample, editor.timeBase) : 0;
  }
  function release(node: AudioBufferSourceNode | null): void {
    if (!node) return;
    node.onended = null;
    try {
      node.stop();
    } catch {
      /* Already stopped by the audio clock. */
    }
    node.disconnect();
  }
  function elapsedSample(): number {
    if (!track || !editor.source) return editor.playheadSample;
    return advanceSamples(
      anchorSample,
      context.currentTime - anchorTime,
      activeRate,
      editor.source.sampleRate,
    );
  }
  function currentSample(): number {
    return Math.min(editor.source?.length ?? 0, elapsedSample());
  }
  function remember(previousSample: number): void {
    inputTimeline.record(
      performance.now(),
      previousSample,
      currentSample(),
      track && context.state !== 'suspended'
        ? (activeRate * (editor.source?.sampleRate ?? 0)) / 1000
        : 0,
    );
  }
  function stop(): void {
    const previous = elapsedSample();
    const sample = currentSample();
    cancelAnimationFrame(frame);
    frame = 0;
    release(track);
    track = null;
    release(preview);
    preview = null;
    cue.silence();
    editor.setPlayheadSample(sample);
    editor.setPlaying(false);
    remember(previous);
  }
  function tick(): void {
    if (disposed || !track || !editor.source) return;
    const sample = currentSample();
    const tickPosition = tickAtSample(sample);
    const index = findCueCrossing(editor.ticks, lastCueTick, tickPosition);
    lastCueTick = tickPosition;
    if (index >= 0) {
      cue.trigger(editor.cueMode);
    }
    editor.setPlayheadSample(sample);
    frame = requestAnimationFrame(tick);
  }
  function resume(node: AudioBufferSourceNode): void {
    void context
      .resume()
      .then(() => {
        if (!disposed && track === node) remember(currentSample());
      })
      .catch(() => {
        if (!disposed && (track === node || preview === node)) stop();
      });
  }
  function play(): void {
    if (disposed || track || !buffer || !editor.source || buffer.length === 0) return;
    release(preview);
    preview = null;
    if (editor.playheadSample >= editor.source.length) editor.setPlayheadSample(0);
    const node = context.createBufferSource();
    node.buffer = buffer;
    activeRate = editor.playbackRate;
    node.playbackRate.value = activeRate;
    node.connect(master);
    anchorSample = editor.playheadSample;
    anchorTime = context.currentTime;
    lastCueTick = tickAtSample(anchorSample);
    track = node;
    node.onended = () => {
      if (track !== node) return;
      editor.setPlayheadSample(editor.source?.length ?? 0);
      stop();
    };
    resume(node);
    node.start(0, anchorSample / buffer.sampleRate);
    editor.setPlaying(true);
    remember(anchorSample);
    tick();
  }
  function pause(): void {
    if (track) stop();
  }
  function seekSample(sample: number): void {
    if (disposed || !editor.source || !Number.isFinite(sample)) return;
    const playing = track !== null;
    stop();
    const previous = editor.playheadSample;
    editor.setPlayheadSample(Math.floor(sample));
    remember(previous);
    if (playing && editor.playheadSample < editor.source.length) play();
  }
  function setRate(rate: number): void {
    if (!disposed)
      editor.setPlaybackRate(PLAYBACK_RATES.includes(rate) ? rate : DEFAULT_PLAYBACK_RATE);
  }
  function previewSlice(previous = false): void {
    const source = editor.source,
      base = editor.timeBase;
    if (disposed || !source || !base) return;
    const { ranges } = sliceRanges(editor.ticks, base, source.length);
    if (!ranges.length) {
      editor.setStatus('noMarkersToPreview');
      return;
    }
    let index = Math.max(
      0,
      sliceIndexAtOrBefore(
        ranges.map((range) => range.tick),
        editor.cursorTick,
      ),
    );
    if (previous) index = Math.max(0, index - 1);
    const range = ranges[index];
    if (range === undefined) return;
    const rendered = renderSlice(source, {
      start: range.start,
      end: range.end,
      ...editor.sliceProcessing,
    });
    if (!rendered.length) {
      editor.setStatus('emptySlice');
      return;
    }
    stop();
    const previewBuffer = context.createBuffer(
      rendered.channels.length,
      rendered.length,
      rendered.sampleRate,
    );
    rendered.channels.forEach((channel, index) => {
      const output = previewBuffer.getChannelData(index);
      channel.forEach((sample, frame) => {
        output[frame] = sample / FULL_SCALE;
      });
    });
    const node = context.createBufferSource();
    node.buffer = previewBuffer;
    node.connect(master);
    preview = node;
    node.onended = () => {
      if (preview === node) {
        preview = null;
        node.disconnect();
      }
    };
    resume(node);
    node.start();
    editor.setStatus('previewSlice', {
      slice: String(range.index).padStart(3, '0'),
      tick: range.tick,
    });
  }
  scope.run(() => {
    watch(
      () => editor.source,
      (source) => {
        stop();
        buffer = null;
        if (source && source.length > 0 && source.floatData.length > 0) {
          buffer = context.createBuffer(source.floatData.length, source.length, source.sampleRate);
          source.floatData.forEach((channel, index) => {
            buffer?.getChannelData(index).set(channel);
          });
        }
        editor.setPlayheadSample(0);
        inputTimeline.reset();
        remember(0);
      },
      { immediate: true, flush: 'sync' },
    );
    watch(
      () => editor.masterAmp,
      (value) => {
        master.gain.value = value;
      },
      { immediate: true, flush: 'sync' },
    );
    watch(
      () => editor.cueAmp,
      (value) => cue.setVolume(value),
      { immediate: true, flush: 'sync' },
    );
    watch(
      () => editor.playbackRate,
      (value) => {
        const previous = elapsedSample();
        anchorSample = currentSample();
        anchorTime = context.currentTime;
        activeRate = value;
        if (track) track.playbackRate.value = value;
        remember(previous);
      },
      { flush: 'sync' },
    );
    // Only marker and time base changes invalidate cue crossings; unrelated
    // document edits must not drop or re-fire cues around the playhead.
    watch(
      () => `${editor.doc.bpm}|${editor.doc.shift}|${editor.ticks.join(',')}`,
      () => {
        lastCueTick = tickAtSample(currentSample());
      },
    );
  });
  return {
    play,
    pause,
    stop,
    seekSample,
    currentSample,
    positionAt(time) {
      if (!editor.source) return null;
      const position = inputTimeline.at(time, { time: performance.now(), sample: elapsedSample() });
      return (
        position && {
          sample: Math.floor(Math.min(editor.source.length, Math.max(0, position.sample))),
          playing: position.playing,
        }
      );
    },
    setRate,
    previewSlice,
    togglePlayPause(): void {
      if (track) pause();
      else play();
    },
    getAudioContext: () => context,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      scope.stop();
      stop();
      cue.dispose();
      master.disconnect();
      buffer = null;
      void context.close().catch(() => {
        /* Disposal is idempotent even after host context shutdown. */
      });
    },
  };
}

const playbackKey: InjectionKey<Playback> = Symbol('playback');
export function providePlayback(playback: Playback): void {
  provide(playbackKey, playback);
}
export function usePlayback(): Playback {
  const playback = inject(playbackKey);
  if (!playback) throw new Error('usePlayback requires providePlayback in an owning ancestor');
  return playback;
}
