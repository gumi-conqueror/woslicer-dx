import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useEditorStore } from '../../src/slicing/editor-store';
import type { CueMode } from '../../src/project/schema';
import { createPlayback, type Playback } from '../../src/playback';
import { renderSlice } from '../../src/core/audio/slice';
import { handleKeyDown } from '../../src/input/keyboard';
import { createTestApp, audioFile, processorEngine } from '../support/app';

class AudioNodeDouble {
  connect = vi.fn();
  disconnect = vi.fn();
  gain = { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  playbackRate = { value: 1 };
  frequency = { value: 0 };
  Q = { value: 0 };
  type = '';
  buffer: BufferDouble | null = null;
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}
class BufferDouble {
  readonly channels: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(index: number): Float32Array {
    const channel = this.channels[index];
    if (!channel) throw new RangeError('Invalid channel');
    return channel;
  }
}
const contexts: AudioContextDouble[] = [];
class AudioContextDouble {
  currentTime = 0;
  sampleRate = 48000;
  destination = new AudioNodeDouble();
  gains: AudioNodeDouble[] = [];
  sources: AudioNodeDouble[] = [];
  oscillators: AudioNodeDouble[] = [];
  filters: AudioNodeDouble[] = [];
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  constructor() {
    contexts.push(this);
  }
  createGain() {
    const node = new AudioNodeDouble();
    this.gains.push(node);
    return node;
  }
  createBufferSource() {
    const node = new AudioNodeDouble();
    this.sources.push(node);
    return node;
  }
  createOscillator() {
    const node = new AudioNodeDouble();
    this.oscillators.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = new AudioNodeDouble();
    this.filters.push(node);
    return node;
  }
  createBuffer(channels: number, length: number, rate: number) {
    return new BufferDouble(channels, length, rate);
  }
}
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();
const owners: Playback[] = [];
function frame(): void {
  const callbacks = [...frames.values()];
  frames.clear();
  for (const callback of callbacks) callback(0);
}
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Missing test fixture');
  return value;
}
beforeEach(() => {
  setActivePinia(createPinia());
  contexts.length = 0;
  frames.clear();
  vi.stubGlobal('AudioContext', AudioContextDouble);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
});
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  vi.unstubAllGlobals();
});
/** The real playback on the audio doubles; the test releases it when it ends. */
function listening(editor: ReturnType<typeof useEditorStore>): Playback {
  const playback = createPlayback(editor);
  owners.push(playback);
  return playback;
}
function fixture(length = 480000) {
  const editor = useEditorStore();
  const data = Int16Array.from({ length }, (_, index) => Math.round(Math.sin(index / 8) * 16000));
  editor.setSource({
    name: 'local.wav',
    reference: null,
    channels: 1,
    sampleRate: 48000,
    length,
    data: [data],
    sourceFormat: { kind: 'pcm' as const, bits: 16 },
    floatData: [Float32Array.from(data, (sample) => sample / 32768)],
  });
  const playback = listening(editor);
  return { editor, playback, context: required(contexts.at(-1)) };
}

describe('Pinia playback lifetime and audio clock', () => {
  it('places queued input before rate, pause and seek boundaries at its captured position', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { editor, workspace, playback, commands } = createTestApp(processorEngine, listening);
    await workspace.loadAudio(audioFile('queued.wav', 480000));
    const context = required(contexts.at(-1));
    editor.snap = false;
    editor.tapOffsetMs = 0;
    playback.play();
    await Promise.resolve();
    now = 2000;
    context.currentTime = 1;
    playback.setRate(0.5);
    now = 3000;
    context.currentTime = 2;
    playback.pause();
    now = 3100;
    context.currentTime = 2.1;
    playback.seekSample(240000);
    now = 3200;
    context.currentTime = 2.2;
    await commands.run('recording-tap', { time: 1500, keys: [1, 3] });
    await commands.run('recording-tap', { time: 2500, keys: [5] });
    await commands.run('recording-tap', { time: 3050, keys: [7] });
    expect(editor.ticks).toEqual([48, 120, 144]);
    expect(editor.markerKeys).toEqual([
      { tick: 48, keys: [1, 3] },
      { tick: 120, keys: [5] },
      { tick: 144, keys: [7] },
    ]);
    expect(playback.currentSample()).toBe(240000);
    expect(editor.playing).toBe(false);
    expect(playback.positionAt(3150)).toEqual({ sample: 240000, playing: false });
    editor.setSource(null);
    expect(playback.positionAt(1500)).toBeNull();
  });
  it('records at the playhead and seeks fixed seconds without changing playback state', async () => {
    const { editor, workspace, playback, commands } = createTestApp(processorEngine, listening);
    await workspace.loadAudio(audioFile('recording.wav', 480000));
    const context = required(contexts.at(-1));
    editor.snap = false;
    editor.tapOffsetMs = 100;
    editor.setCursorTick(900);
    playback.seekSample(60000);
    await commands.run('recording-tap');
    expect(editor.ticks).toEqual([120]);
    expect(playback.currentSample()).toBe(60000);
    expect(editor.playing).toBe(false);
    playback.play();
    context.currentTime = 0.25;
    await commands.run('seek-backward');
    expect(playback.currentSample()).toBe(48000);
    expect(editor.playing).toBe(true);
    context.currentTime = 0.75;
    handleKeyDown(new KeyboardEvent('keydown', { key: 'z' }), 'recording', commands);
    expect(editor.ticks).toEqual([120, 134]);
    context.currentTime = 0.9;
    handleKeyDown(new KeyboardEvent('keydown', { key: 'z', repeat: true }), 'recording', commands);
    expect(editor.ticks).toEqual([120, 134]);
    handleKeyDown(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }), 'recording', commands);
    expect(editor.ticks).toEqual([120]);
    playback.pause();
    playback.seekSample(0);
    await commands.run('seek-backward');
    expect(playback.currentSample()).toBe(0);
    await commands.run('seek-forward');
    expect(playback.currentSample()).toBe(24000);
    expect(editor.playing).toBe(false);
  });
  it('previews fader gain on live audio nodes and discards previews on undo or source replacement', () => {
    const { editor, playback, context } = fixture();
    playback.play();
    const revision = editor.docRevision;
    editor.setVolumePreview(0.25);
    editor.setCueVolumePreview(0.4);
    expect(required(context.gains[0]).gain.value).toBeCloseTo(0.25, 12);
    expect(required(context.gains[1]).gain.value).toBeCloseTo(0.4, 12);
    expect(editor.docRevision).toBe(revision);
    editor.setVolume(0.25);
    editor.undo();
    expect(required(context.gains[0]).gain.value).toBeCloseTo(editor.volume, 12);
    expect(required(context.gains[1]).gain.value).toBeCloseTo(editor.cueVolume, 12);
    editor.setVolumePreview(0.1);
    editor.setSource(null);
    expect(required(context.gains[0]).gain.value).toBeCloseTo(editor.volume, 12);
  });
  it('preserves a continuous source clock on rate changes without restarting the node', () => {
    const { editor, playback, context } = fixture();
    playback.play();
    const node = required(context.sources[0]);
    context.currentTime = 1;
    expect(playback.currentSample()).toBe(48000);
    playback.setRate(0.5);
    expect(playback.currentSample()).toBe(48000);
    expect(node.playbackRate.value).toBe(0.5);
    context.currentTime = 3;
    frame();
    expect(editor.playheadSample).toBe(96000);
    expect(context.sources).toHaveLength(1);
    playback.pause();
    expect(editor.playing).toBe(false);
    expect(editor.playheadSample).toBe(96000);
    context.currentTime = 8;
    expect(playback.currentSample()).toBe(96000);
    playback.play();
    expect(required(context.sources[1]).start).toHaveBeenCalledWith(0, 2);
    expect(required(context.sources[1]).playbackRate.value).toBe(0.5);
  });
  it('reacts to restored store preferences while running and routes monitor/cue gain separately', () => {
    const { editor, playback, context } = fixture();
    playback.play();
    context.currentTime = 2;
    editor.setPlaybackRate(1.5);
    expect(playback.currentSample()).toBe(96000);
    context.currentTime = 3;
    expect(playback.currentSample()).toBe(168000);
    editor.setVolume(0.2);
    editor.setCueVolume(0.4);
    expect(required(context.gains[0]).gain.value).toBeCloseTo(0.2, 12);
    expect(required(context.gains[1]).gain.value).toBeCloseTo(0.4, 12);
  });
  it('renders preview samples through export DSP at 1x and retriggers exclusively', () => {
    const { editor, playback, context } = fixture(4800);
    editor.setTicks([0, 4]);
    editor.setDocumentOptions({ fadeoutMs: 5, noisegateDb: -40 });
    editor.setCursorTick(0);
    playback.setRate(0.25);
    playback.play();
    const track = required(context.sources[0]);
    playback.previewSlice();
    expect(track.stop).toHaveBeenCalled();
    expect(editor.playing).toBe(false);
    const preview = required(context.sources[1]);
    expect(preview.playbackRate.value).toBe(1);
    const source = editor.source;
    if (!source) throw new Error('Missing source');
    const expected = renderSlice(source, { start: 0, end: 2000, fadeoutMs: 5, noisegateDb: -40 });
    expect(preview.buffer?.getChannelData(0)).toEqual(
      Float32Array.from(required(expected.channels[0]), (sample) => sample / 32768),
    );
    playback.previewSlice();
    expect(preview.stop).toHaveBeenCalled();
    expect(preview.disconnect).toHaveBeenCalled();
    const latest = required(context.sources[2]);
    playback.play();
    expect(latest.stop).toHaveBeenCalled();
  });
  it('seeks while playing, ignores stale onended callbacks, and clamps the source end', () => {
    const { editor, playback, context } = fixture();
    playback.play();
    const old = required(context.sources[0]),
      ended = old.onended;
    playback.seekSample(96000);
    expect(required(context.sources[1]).start).toHaveBeenCalledWith(0, 2);
    ended?.();
    expect(editor.playing).toBe(true);
    playback.seekSample(Infinity);
    expect(editor.playing).toBe(true);
    playback.seekSample(9999999);
    expect(editor.playheadSample).toBe(480000);
    expect(editor.playing).toBe(false);
  });
  it('advances cue cursor while disabled and cleans all synthesized voices on stop', () => {
    const { editor, playback, context } = fixture();
    editor.setTicks([24, 48, 72]);
    playback.play();
    context.currentTime = 0.3;
    frame();
    expect(context.oscillators).toHaveLength(0);
    editor.cueMode = 'cowbell';
    context.currentTime = 0.4;
    frame();
    expect(context.oscillators).toHaveLength(0);
    context.currentTime = 0.6;
    frame();
    expect(context.oscillators).toHaveLength(2);
    context.currentTime = 0.65;
    frame();
    expect(context.oscillators).toHaveLength(2);
    playback.stop();
    for (const node of [...context.oscillators, ...context.filters])
      expect(node.disconnect).toHaveBeenCalled();
  });
  it('routes master gain through project global state with mute winning and an independent cue route', () => {
    const { editor, context } = fixture();
    editor.transact((draft) => {
      const track = draft.tracks[0];
      if (!track) throw new Error('Missing track');
      track.media = {
        mediaId: 'm1',
        name: 'a.wav',
        format: 'wav',
        byteLength: 1000,
        sampleRateHz: 48000,
        channels: 1,
        framesPerChannel: 48000,
        integrity: null,
        originHint: null,
      };
      draft.global.masterGainDb = -20;
      draft.global.cueGainDb = -12;
    });
    const master = required(context.gains[0]);
    expect(master.gain.value).toBeCloseTo(Math.pow(10, -20 / 20), 12);
    editor.transact((draft) => {
      draft.global.masterMuted = true;
    });
    expect(editor.masterAmp).toBe(0);
    expect(master.gain.value).toBe(0);
    editor.transact((draft) => {
      draft.global.masterMuted = false;
    });
    expect(master.gain.value).toBeCloseTo(Math.pow(10, -20 / 20), 12);
    expect(required(context.gains[1]).gain.value).toBeCloseTo(Math.pow(10, -12 / 20), 12);
  });
  it('keeps cue crossings alive across unrelated document edits during playback', async () => {
    const { editor, playback, context } = fixture();
    editor.setTicks([24, 48]);
    editor.cueMode = 'cowbell';
    await Promise.resolve();
    await Promise.resolve(); // settle the crossing-state watcher before playing
    playback.play();
    context.currentTime = 0.3;
    frame();
    expect(context.oscillators).toHaveLength(2);
    // The clock passes cut 48 before the document edit settles: an unrelated
    // output/gate change must not swallow that crossing.
    editor.setOutputOptions({ baseName: 'renamed' });
    editor.setNoisegateEnabled(false);
    context.currentTime = 0.55;
    await Promise.resolve();
    await Promise.resolve();
    frame();
    expect(context.oscillators).toHaveLength(4);
    // A time base change re-anchors the crossing state exactly once.
    editor.setDocumentOptions({ bpm: 125 });
    context.currentTime = 0.65;
    await Promise.resolve();
    await Promise.resolve();
    frame();
    expect(context.oscillators).toHaveLength(4);
    playback.stop();
  });
  it('stops on source replacement, clears animation, and disposes watchers and context once', () => {
    const { editor, playback, context } = fixture();
    playback.play();
    expect(frames.size).toBe(1);
    const old = required(context.sources[0]);
    editor.setSource(null);
    expect(old.stop).toHaveBeenCalled();
    expect(frames.size).toBe(0);
    expect(editor.playheadSample).toBe(0);
    const gain = required(context.gains[0]);
    playback.dispose();
    playback.dispose();
    const previous = gain.gain.value;
    editor.setVolume(0.9);
    expect(gain.gain.value).toBe(previous);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(gain.disconnect).toHaveBeenCalledTimes(1);
    playback.play();
    expect(context.sources).toHaveLength(1);
  });
  it('does not let a rejected resume from an old node stop a newer seek', async () => {
    const { editor, playback, context } = fixture();
    context.resume.mockRejectedValueOnce(new Error('Old resume cancelled'));
    playback.play();
    playback.seekSample(96000);
    await Promise.resolve();
    await Promise.resolve();
    expect(editor.playing).toBe(true);
    expect(required(context.sources[1]).stop).not.toHaveBeenCalled();
  });
  const modes: CueMode[] = ['cowbell', 'triangle', 'metronome'];
  it.each(modes)('releases all %s voice nodes after their natural audio completion', (mode) => {
    const { editor, playback, context } = fixture();
    editor.addTicks([24]);
    editor.cueMode = mode;
    playback.play();
    context.currentTime = 0.3;
    frame();
    const expected =
      mode === 'cowbell' ? [560, 845] : mode === 'triangle' ? [2637, 3951, 5274] : [1568];
    expect(context.oscillators.map((node) => node.frequency.value)).toEqual(expected);
    const voiceSources = [...context.oscillators, ...context.sources.slice(1)];
    const callbacks = voiceSources.map((node) => node.onended);
    for (const callback of callbacks) callback?.();
    // Gains 0–2 are the master, the cue bus and the playing track; voice gains follow.
    for (const node of [...voiceSources, ...context.filters, ...context.gains.slice(3)])
      expect(node.disconnect).toHaveBeenCalledTimes(1);
    expect(editor.playing).toBe(true);
    playback.stop();
    for (const node of voiceSources) expect(node.disconnect).toHaveBeenCalledTimes(1);
  });
  it('reports no markers and an empty endpoint slice instead of allocating invalid buffers', () => {
    const { editor, playback, context } = fixture(4800);
    playback.previewSlice();
    expect(editor.status.segments[0]?.key).toBe('noMarkersToPreview');
    editor.setDocumentOptions({ bpm: 125 }); // 4800 frames = 10 ticks at 125 BPM.
    editor.addTicks([10]);
    editor.setCursorTick(10);
    playback.previewSlice();
    expect(editor.status.segments[0]?.key).toBe('emptySlice');
    expect(context.sources).toHaveLength(0);
  });
});

describe('multi-track playback', () => {
  it('plays every track with audio through its own gain and follows mute and solo', async () => {
    const app = createTestApp();
    await app.workspace.loadAudio(audioFile('kick.wav', 96000));
    const kick = app.editor.track.trackId;
    app.opened = audioFile('snare.wav', 48000);
    await app.run('add-track');
    const snare = app.editor.track.trackId;
    const playback = createPlayback(app.editor);
    owners.push(playback);
    const context = required(contexts.at(-1));
    playback.play();
    // The current track drives the playhead; the other track plays along from the same time.
    expect(context.sources).toHaveLength(2);
    expect(context.sources.map((node) => node.buffer?.length)).toEqual([48000, 96000]);
    // Gains 0 and 1 are the master and cue buses; then one gain per playing track.
    const [snareGain, kickGain] = context.gains.slice(2);
    expect([snareGain?.gain.value, kickGain?.gain.value]).toEqual([1, 1]);
    app.editor.setTrackMix(kick, { muted: true });
    expect(kickGain?.gain.value).toBe(0);
    app.editor.setTrackMix(kick, { muted: false });
    app.editor.setTrackMix(snare, { solo: true });
    expect([snareGain?.gain.value, kickGain?.gain.value]).toEqual([1, 0]);
    app.editor.setTrackMix(snare, { solo: false, gainDb: -6 });
    expect(snareGain?.gain.value).toBeCloseTo(Math.pow(10, -6 / 20), 12);
    expect(kickGain?.gain.value).toBe(1);
    playback.stop();
    for (const gain of [snareGain, kickGain]) expect(gain?.disconnect).toHaveBeenCalled();
  });
});

describe('track switching during playback', () => {
  it('keeps playing at the same time position on the newly selected track', async () => {
    const app = createTestApp();
    await app.workspace.loadAudio(audioFile('kick.wav', 96000));
    const kick = app.editor.track.trackId;
    app.opened = { ...audioFile('snare.wav', 96000) };
    await app.run('add-track');
    const playback = createPlayback(app.editor);
    owners.push(playback);
    const context = required(contexts.at(-1));
    app.editor.selectTrack(kick);
    playback.play();
    context.currentTime = 0.5;
    void app.run('next-track');
    // Both test files are 48 kHz, so 0.5 s is sample 24000 on the new track.
    expect(app.editor.playing).toBe(true);
    expect(app.editor.track.trackId).not.toBe(kick);
    expect(playback.currentSample()).toBe(24000);
    playback.stop();
    // A stopped playhead keeps its time as well.
    app.editor.selectTrack(kick);
    expect(app.editor.playheadSample).toBe(24000);
  });
});
