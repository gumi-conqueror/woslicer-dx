import type { SourceAudio } from '../core/audio/pcm';
import { computed, markRaw, shallowRef, triggerRef } from 'vue';
import { defineStore } from 'pinia';
import { normalizeSelection } from '../core/markers';
import type { MarkerKeys } from '../project/marker-keys';
import { applyMarkerEdit } from '../project/marker-links';
import { ProjectEditor } from '../project/editor';
import { createEmptyProject, currentTrack } from '../project/codec';
import type {
  ProjectDocument,
  ProjectFile,
  ProjectTrack,
  OutputRecipe,
  SlicingSettings,
} from '../project/schema';
import { clampGainDb, FIELD_RANGES, inRange, type CueMode } from '../project/schema';
import { gridStepTicks } from '../core/gridlines';
import {
  MAX_TICKS,
  markerTickAllowed,
  resolveBreakpointTick,
  samplesPerTick,
  sampleToTick,
  EMPTY_TIMELINE_TICKS,
  MEASURE_TICKS,
  tickToSampleExport,
  type TimeBase,
} from '../core/timebase';
import { zoomAt as zoomView } from '../timeline/waveform/zoom';
import { ampToDb, dbToAmp } from '../core/volume';
import type { PeakCache } from '../core/peaks';
import type { BandAnalysis } from '../core/bands';
import type { FormatParams, StatusKey } from '../core/messages';

export interface AudioSource extends SourceAudio {
  name: string;
  reference: string | null;
  floatData: Float32Array[];
}
export type EditorPhase =
  | { kind: 'empty' }
  | { kind: 'loading'; name: string }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };
/** The runtime state of one track's audio. It is not part of the project document. */
export interface TrackSession {
  source: AudioSource | null;
  peaks: PeakCache | null;
  phase: EditorPhase;
  /** Host binding of the last opened audio, independent of the decoded source's lifetime. */
  lastFile: { reference: string; name: string } | null;
  bandAnalysis: BandAnalysis | null;
  bandEstimate: number | null;
}
const EMPTY_SESSION: Readonly<TrackSession> = Object.freeze<TrackSession>({
  source: null,
  peaks: null,
  phase: { kind: 'empty' },
  lastFile: null,
  bandAnalysis: null,
  bandEstimate: null,
});
export interface StatusSegment {
  key: StatusKey;
  params?: FormatParams;
}
export interface DocumentOptions {
  bpm: number;
  shift: number;
  fadeoutMs: number;
  noisegateDb: number;
}

export const useEditorStore = defineStore('editor', () => {
  const project = shallowRef(markRaw(new ProjectEditor(createEmptyProject())));
  const document = computed(() => project.value.document);
  const docRevision = computed(() => project.value.revision);
  // Unlike docRevision, this changes only when the whole document is replaced,
  // including reopening the same project ID. Feature sessions use it for cleanup.
  const documentGeneration = shallowRef(0);
  const isDirty = computed(() => project.value.isDirty);
  // Read-only projections for consumers of the existing slicing time base.
  // Markers, processing and output settings belong to the track being edited.
  /** The track that the editor, panels and commands work on. */
  const currentTrackId = shallowRef<string | null>(null);
  const track = computed(() => currentTrack(document.value, currentTrackId.value));
  const sessions = shallowRef<ReadonlyMap<string, Readonly<TrackSession>>>(new Map());
  const session = computed(() => sessions.value.get(track.value.trackId) ?? EMPTY_SESSION);
  /** Updates one track's session; the current track by default. */
  function updateSession(patch: Partial<TrackSession>, trackId = track.value.trackId): void {
    const next = new Map(sessions.value);
    next.set(trackId, Object.freeze({ ...(next.get(trackId) ?? EMPTY_SESSION), ...patch }));
    sessions.value = next;
  }
  const source = computed(() => session.value.source);
  const peaks = computed(() => session.value.peaks);
  const phase = computed(() => session.value.phase);
  const lastFile = computed(() => session.value.lastFile);
  const bandAnalysis = computed(() => session.value.bandAnalysis);
  const bandEstimate = computed({
    get: () => session.value.bandEstimate,
    set: (value: number | null) => updateSession({ bandEstimate: value }),
  });
  const doc = computed(() =>
    Object.freeze({
      bpm: document.value.timing.bpm,
      shift: document.value.timing.shiftTicks,
      fadeoutMs: track.value.slicing.fadeoutMs,
      noisegateDb: track.value.slicing.noisegateDb,
    }),
  );
  const previewTicks = shallowRef<readonly number[] | null>(null);
  /** A track's tick-to-sample time base; `null` until its audio is loaded. */
  function timeBaseOf(trackId: string): Readonly<TimeBase> | null {
    const audio = sessions.value.get(trackId)?.source;
    return audio
      ? Object.freeze({
          bpm: document.value.timing.bpm,
          shift: document.value.timing.shiftTicks,
          sampleRate: audio.sampleRate,
        })
      : null;
  }
  /** The current track's time base. */
  const timeBase = computed(() => timeBaseOf(track.value.trackId));
  let cancelActiveDraft: (() => void) | null = null;
  const status = shallowRef<{ segments: StatusSegment[] }>({ segments: [{ key: 'statusEmpty' }] });
  const isError = shallowRef(false);
  const grid = shallowRef(8),
    snap = shallowRef(true),
    cursorTick = shallowRef(0);
  const selectedTicks = shallowRef<number[]>([]);
  const selectionStartTick = shallowRef<number | null>(null),
    selectionEndTick = shallowRef<number | null>(null);
  const pxPerTick = shallowRef(6),
    scrollTick = shallowRef(0);
  const playing = shallowRef(false),
    playheadSample = shallowRef(0);
  // Project global/track playback state is the single truth; these writable
  // projections keep the UI and command entry points stable. One user intent is
  // one transaction, so playback properties participate in undo and dirty.
  const applyGlobal = (edit: (draft: ProjectFile) => void): void => void transact(edit);
  /**
   * Linear gain of each track. Mute wins over solo; when any unmuted track is
   * soloed, only unmuted solo tracks are audible.
   */
  const trackAmps = computed<ReadonlyMap<string, number>>(() => {
    const tracks = document.value.tracks;
    const soloing = tracks.some((item) => item.solo && !item.muted);
    const preview = trackGainPreview.value;
    return new Map(
      tracks.map((item) => {
        const gain = preview?.trackId === item.trackId ? preview.db : item.gainDb;
        return [
          item.trackId,
          item.muted || (soloing && !item.solo) ? 0 : dbToAmp(clampGainDb(gain)),
        ];
      }),
    );
  });
  /** A track gain while its slider is dragged; monitoring follows it without an undo entry. */
  const trackGainPreview = shallowRef<{ trackId: string; db: number } | null>(null);
  function setTrackGainPreview(value: { trackId: string; db: number } | null): void {
    trackGainPreview.value = value && Number.isFinite(value.db) ? value : null;
  }
  /** Mute, solo and gain of a track, as one undoable edit. */
  function setTrackMix(
    trackId: string,
    value: Partial<Pick<ProjectTrack, 'muted' | 'solo' | 'gainDb'>>,
  ): void {
    editTrack((draft) => {
      if (value.muted !== undefined) draft.muted = value.muted;
      if (value.solo !== undefined) draft.solo = value.solo;
      if (value.gainDb !== undefined && Number.isFinite(value.gainDb))
        draft.gainDb = clampGainDb(value.gainDb);
    }, trackId);
  }
  // Fader previews affect monitoring immediately, without adding undo entries.
  const volumePreview = shallowRef<number | null>(null);
  const cueVolumePreview = shallowRef<number | null>(null);
  function setVolumePreview(value: number | null): void {
    if (value === null || Number.isFinite(value))
      volumePreview.value = value === null ? null : Math.max(0, Math.min(1, value));
  }
  function setCueVolumePreview(value: number | null): void {
    if (value === null || Number.isFinite(value))
      cueVolumePreview.value = value === null ? null : Math.max(0, Math.min(1, value));
  }
  /** The master bus after its mute; track gains apply before it. */
  const masterAmp = computed(() => {
    const global = document.value.global;
    if (global.masterMuted) return 0;
    const gain = volumePreview.value === null ? global.masterGainDb : ampToDb(volumePreview.value);
    return dbToAmp(clampGainDb(gain));
  });
  const volume = computed({
    get: () => dbToAmp(document.value.global.masterGainDb),
    set: (value) => {
      if (!Number.isFinite(value)) return;
      applyGlobal((draft) => {
        draft.global.masterGainDb = clampGainDb(ampToDb(Math.max(0, Math.min(1, value))));
      });
    },
  });
  const cueVolume = computed({
    get: () => dbToAmp(document.value.global.cueGainDb),
    set: (value) => {
      if (!Number.isFinite(value)) return;
      applyGlobal((draft) => {
        draft.global.cueGainDb = clampGainDb(ampToDb(Math.max(0, Math.min(1, value))));
      });
    },
  });
  const cueAmp = computed(() => cueVolumePreview.value ?? cueVolume.value);
  const playbackRate = computed({
    get: () => document.value.global.playbackRate,
    set: (value) => {
      if (!inRange(value, FIELD_RANGES.playbackRate)) return;
      applyGlobal((draft) => {
        draft.global.playbackRate = value;
      });
    },
  });
  const cueMode = computed<CueMode>({
    get: () => document.value.global.cueMode,
    set: (value) =>
      applyGlobal((draft) => {
        draft.global.cueMode = value;
      }),
  });
  const followPlayhead = shallowRef(true);
  const effectiveViews = computed(() => ({
    rms: track.value.views.rms ?? document.value.global.views.rms,
    bands: track.value.views.bands ?? document.value.global.views.bands,
  }));
  const rmsVisible = computed({
    get: () => effectiveViews.value.rms,
    set: (value) =>
      applyGlobal((draft) => {
        draft.global.views.rms = value;
      }),
  });
  const bandsVisible = computed({
    get: () => effectiveViews.value.bands,
    set: (value) =>
      applyGlobal((draft) => {
        draft.global.views.bands = value;
      }),
  });
  const noisegateEnabled = computed(() => track.value.slicing.noisegateEnabled);
  /** Slice rendering settings of a track. A disabled noise gate renders as 0 dB. */
  function sliceProcessingOf(trackId: string) {
    const { slicing } = currentTrack(document.value, trackId);
    return Object.freeze({
      fadeoutMs: slicing.fadeoutMs,
      noisegateDb: slicing.noisegateEnabled ? slicing.noisegateDb : 0,
    });
  }
  /** Slice rendering settings of the current track, for preview and export. */
  const sliceProcessing = computed(() => sliceProcessingOf(track.value.trackId));
  const baseName = computed(() => track.value.output.baseName);
  const clipStartNumber = computed(() => track.value.output.clipStartNumber);
  const useFfNumbering = computed(() => track.value.output.useFfNumbering);
  const exportLock = shallowRef(false);
  // Detection settings belong to the track and are saved with the project.
  const bandDetection = computed(() => track.value.slicing.bandDetection);
  const tapOffsetMs = shallowRef(0);
  const bandBusy = shallowRef(false);
  const ticks = computed(() => track.value.slicing.markers);
  const markerKeys = computed(() => track.value.slicing.markerKeys ?? []);
  /** Ticks of the current track's linked markers. */
  const linkedTicks = computed<ReadonlySet<number>>(() => new Set(track.value.slicing.links ?? []));
  /** Marker edits follow links to other tracks, and new markers go to every track. */
  const sharedMarkers = computed({
    get: () => document.value.global.sharedMarkers,
    set: (value: boolean) =>
      applyGlobal((draft) => {
        draft.global.sharedMarkers = value;
      }),
  });
  const canUndo = computed(() => project.value.canUndo);
  const canRedo = computed(() => project.value.canRedo);
  function publish(): void {
    triggerRef(project);
    selectedTicks.value = selectedTicks.value.filter((t) => ticks.value.includes(t));
  }
  function cancelDraft(): void {
    volumePreview.value = null;
    cueVolumePreview.value = null;
    trackGainPreview.value = null;
    cancelActiveDraft?.();
    previewTicks.value = null;
  }
  function registerDraftCancellation(cancel: () => void): () => void {
    cancelDraft();
    cancelActiveDraft = cancel;
    return () => {
      if (cancelActiveDraft === cancel) {
        cancelDraft();
        cancelActiveDraft = null;
      }
    };
  }
  function setPreviewTicks(value: readonly number[] | null): void {
    previewTicks.value = value === null ? null : Object.freeze([...value]);
  }
  function transact<T>(edit: (draft: ProjectFile) => T) {
    cancelDraft();
    const result = project.value.transact(edit);
    if (result.changed) publish();
    return result;
  }
  /** One undoable edit of a track; the current track by default. */
  function editTrack<T>(edit: (draft: ProjectTrack) => T, trackId = track.value.trackId) {
    return transact((draft) => edit(currentTrack(draft, trackId)));
  }
  /** The track whose name field is open for editing. */
  const renamingTrackId = shallowRef<string | null>(null);
  /** Renames a track in one undoable edit; a blank name is ignored. */
  function renameTrack(trackId: string, name: string): void {
    const value = name.trim();
    if (value) editTrack((draft) => void (draft.name = value), trackId);
  }
  /** Makes another track current. Selection and drafts belong to the previous track. */
  function selectTrack(trackId: string): void {
    if (trackId === track.value.trackId) return;
    if (!document.value.tracks.some((item) => item.trackId === trackId)) return;
    cancelDraft();
    currentTrackId.value = trackId;
    selectedTicks.value = [];
    setSelection(null, null);
  }
  function replaceDocument(value: ProjectDocument, options: { saved?: boolean } = {}): void {
    cancelDraft();
    project.value.replace(value, options);
    if (!value.tracks.some((item) => item.trackId === currentTrackId.value))
      currentTrackId.value = value.tracks[0]?.trackId ?? null;
    // Sessions of tracks that the new document does not have are released.
    const kept = new Set(value.tracks.map((item) => item.trackId));
    sessions.value = new Map([...sessions.value].filter(([id]) => kept.has(id)));
    selectedTicks.value = [];
    setSelection(null, null);
    publish();
    documentGeneration.value++;
  }
  function markSaved(revision: number): boolean {
    const saved = project.value.markSaved(revision);
    if (saved) triggerRef(project);
    return saved;
  }
  function undo(): boolean {
    cancelDraft();
    const changed = project.value.undo();
    if (changed) publish();
    return changed;
  }
  function redo(): boolean {
    cancelDraft();
    const changed = project.value.redo();
    if (changed) publish();
    return changed;
  }
  function setLastFile(
    value: { reference: string; name: string } | null,
    trackId = track.value.trackId,
  ): void {
    updateSession({ lastFile: value }, trackId);
  }
  /**
   * Replaces the current track's markers in one undoable edit. `target` tells
   * where the edit moved each previous marker, so linked markers on other
   * tracks can follow it.
   */
  function setTicks(
    value: readonly number[],
    keys: MarkerKeys = markerKeys.value,
    target: (tick: number) => number = (tick) => tick,
  ): boolean {
    return transact((draft) =>
      applyMarkerEdit(
        draft.tracks,
        currentTrack(draft, currentTrackId.value).trackId,
        { markers: value, keys, target },
        draft.global.sharedMarkers,
        markerAllowed,
      ),
    ).changed;
  }
  function addTicks(value: readonly number[]): number {
    const additions = normalizeSelection(value).filter((t) => !ticks.value.includes(t));
    setTicks([...ticks.value, ...additions]);
    return additions.length;
  }
  function setOutputOptions(value: Partial<OutputRecipe>): void {
    editTrack((draft) => {
      Object.assign(draft.output, value);
    });
  }
  function setBandDetection(value: Partial<SlicingSettings['bandDetection']>): void {
    editTrack((draft) => {
      Object.assign(draft.slicing.bandDetection, value);
    });
  }
  function setNoisegateEnabled(value: boolean): void {
    editTrack((draft) => {
      draft.slicing.noisegateEnabled = value;
    });
  }
  function setStatus(
    message: StatusKey | StatusSegment | StatusSegment[],
    paramsOrError?: FormatParams | boolean,
    error = false,
  ): void {
    const params = typeof paramsOrError === 'object' ? paramsOrError : undefined;
    status.value = {
      segments: Array.isArray(message)
        ? message
        : typeof message === 'string'
          ? [{ key: message, params }]
          : [message],
    };
    isError.value = typeof paramsOrError === 'boolean' ? paramsOrError : error;
  }
  function tickBeyondEnd(tick: number): boolean {
    return (
      source.value !== null &&
      timeBase.value !== null &&
      tickToSampleExport(tick, timeBase.value) > source.value.length
    );
  }
  /** Whether a track can hold a marker at a tick: within the timeline and, with audio, its audio. */
  function markerAllowed(trackId: string, tick: number): boolean {
    const audio = sessions.value.get(trackId)?.source,
      base = timeBaseOf(trackId);
    return markerTickAllowed(tick, audio && base ? { base, length: audio.length } : null);
  }
  function legalTick(tick: number): boolean {
    return markerAllowed(track.value.trackId, tick);
  }
  /** The cursor stays on the timeline, so held keys and sticks stop at its end. */
  function setCursorTick(tick: number): void {
    if (Number.isFinite(tick))
      cursorTick.value = Math.max(0, Math.min(timelineTicks.value, Math.round(tick)));
  }
  /**
   * Moves the cursor from a key, a controller or a seek, and keeps it in the
   * middle of the view. Pointer clicks use `setCursorTick` and do not scroll.
   */
  function moveCursorTo(tick: number): void {
    setCursorTick(tick);
    if (viewportWidth.value > 0)
      glideScrollTo(cursorTick.value - viewportWidth.value / pxPerTick.value / 2);
  }
  function setSelectedTicks(value: readonly number[]): void {
    selectedTicks.value = normalizeSelection(value).filter((t) => ticks.value.includes(t));
  }
  function setSelection(start: number | null, end: number | null): void {
    selectionStartTick.value = start;
    selectionEndTick.value = end;
  }
  /** Scrolls within the timeline: the view never starts after its last viewport width. */
  function setScrollTick(value: number): void {
    stopGlide();
    if (Number.isFinite(value)) scrollTick.value = scrollLimit(value);
  }
  function scrollLimit(value: number): number {
    const span = viewportWidth.value > 0 ? viewportWidth.value / pxPerTick.value : 0;
    return Math.max(0, Math.min(value, timelineTicks.value - span));
  }
  /** A glide approaches its target by 63 % in this time, so it slows down as it arrives. */
  const GLIDE_MS = 70;
  let glideFrame = 0,
    glideTarget = 0;
  function stopGlide(): void {
    if (glideFrame) cancelAnimationFrame(glideFrame);
    glideFrame = 0;
  }
  /**
   * Scrolls smoothly toward a scroll position. A later target redirects the
   * glide; any direct scroll stops it. Without animation frames, or when the
   * user prefers reduced motion, the view jumps.
   */
  function glideScrollTo(value: number): void {
    if (!Number.isFinite(value)) return;
    glideTarget = scrollLimit(value);
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof requestAnimationFrame !== 'function' || reduced) {
      setScrollTick(glideTarget);
      return;
    }
    if (glideFrame) return;
    let last = performance.now();
    const step = (now: number): void => {
      const share = 1 - Math.exp(-Math.max(0, now - last) / GLIDE_MS);
      last = now;
      const next = scrollTick.value + (glideTarget - scrollTick.value) * share;
      // Within half a pixel, the glide lands on its target.
      const done = Math.abs(glideTarget - next) * pxPerTick.value < 0.5;
      scrollTick.value = done ? glideTarget : next;
      glideFrame = done ? 0 : requestAnimationFrame(step);
    };
    glideFrame = requestAnimationFrame(step);
  }
  /** Shows the whole timeline. */
  function zoomToFit(): void {
    pxPerTick.value = fitScale.value;
    scrollTick.value = 0;
  }
  function snapTick(tick: number): number {
    return resolveBreakpointTick(tick, snap.value, gridStepTicks(grid.value), false);
  }
  /**
   * The timeline length in ticks: to the end of the longest track's audio or
   * the last marker of any track, plus one measure. Without audio it is at
   * least `EMPTY_TIMELINE_TICKS` long. Scrolling, zooming out and the cursor
   * stop there. `loading` gives the audio length of a track that is still
   * loading, for the length the timeline will have.
   */
  function timelineLength(loading?: { trackId: string; ticks: number }): number {
    let end = 0,
      audible = false;
    for (const item of document.value.tracks) {
      const audio = sessions.value.get(item.trackId)?.source;
      const base = timeBaseOf(item.trackId);
      if (loading?.trackId === item.trackId) {
        audible = true;
        end = Math.max(end, Math.ceil(loading.ticks));
      } else if (audio && base) {
        audible = true;
        end = Math.max(end, Math.ceil(sampleToTick(audio.length, base)));
      }
      end = Math.max(end, item.slicing.markers.at(-1) ?? 0);
    }
    // A new track is not in the document while it loads.
    if (loading && !document.value.tracks.some((item) => item.trackId === loading.trackId)) {
      audible = true;
      end = Math.max(end, Math.ceil(loading.ticks));
    }
    const length = Math.min(MAX_TICKS, end + MEASURE_TICKS);
    return audible ? length : Math.max(EMPTY_TIMELINE_TICKS, length);
  }
  const timelineTicks = computed(() => timelineLength());
  /** The visible width of the timeline in CSS pixels; the timeline view reports it. */
  const viewportWidth = shallowRef(0);
  /** The zoom that shows the whole timeline in the viewport. */
  const fitScale = computed(() =>
    viewportWidth.value > 0 ? viewportWidth.value / timelineTicks.value : 0.02,
  );
  function zoomAt(anchor: number, factor: number): void {
    const frames = timeBase.value ? samplesPerTick(timeBase.value) : 500;
    const next = zoomView({ scale: pxPerTick.value, scroll: scrollTick.value }, anchor, factor, {
      min: Math.min(fitScale.value, 600),
      max: Math.max(600, 4 * frames),
    });
    pxPerTick.value = next.scale;
    setScrollTick(next.scroll);
  }
  function setPlaybackRate(value: number): void {
    playbackRate.value = value;
  }
  function setVolume(value: number): void {
    volume.value = value;
  }
  function setCueVolume(value: number): void {
    cueVolume.value = value;
  }
  function setPlaying(value: boolean): void {
    playing.value = value;
  }
  function setPlayheadSample(value: number): void {
    if (Number.isFinite(value))
      playheadSample.value = Math.max(0, Math.min(source.value?.length ?? 0, value));
  }
  function setSource(
    value: AudioSource | null,
    cache: PeakCache | null = null,
    trackId = track.value.trackId,
  ): void {
    cancelDraft();
    updateSession(
      {
        source: value ? markRaw(value) : null,
        peaks: cache ? markRaw(cache) : null,
        bandAnalysis: null,
        bandEstimate: null,
      },
      trackId,
    );
    playing.value = false;
    playheadSample.value = 0;
  }
  function setPhase(value: EditorPhase, trackId = track.value.trackId): void {
    updateSession({ phase: value }, trackId);
  }
  function setBandAnalysis(value: BandAnalysis | null): void {
    updateSession({ bandAnalysis: value ? markRaw(value) : null });
  }
  function setDocumentOptions(values: Partial<DocumentOptions>): void {
    transact((draft) => {
      // Out-of-range values are ignored; the inputs already clamp what users type.
      const { bpm, shift, fadeoutMs, noisegateDb } = values;
      if (bpm !== undefined && inRange(bpm, FIELD_RANGES.bpm)) draft.timing.bpm = bpm;
      if (shift !== undefined && inRange(shift, FIELD_RANGES.shiftTicks))
        draft.timing.shiftTicks = shift;
      if (
        fadeoutMs !== undefined &&
        Number.isInteger(fadeoutMs) &&
        inRange(fadeoutMs, FIELD_RANGES.fadeoutMs)
      )
        currentTrack(draft, currentTrackId.value).slicing.fadeoutMs = fadeoutMs;
      if (noisegateDb !== undefined && inRange(noisegateDb, FIELD_RANGES.noisegateDb))
        currentTrack(draft, currentTrackId.value).slicing.noisegateDb = noisegateDb;
    });
  }
  function reset(): void {
    sessions.value = new Map();
    replaceDocument(createEmptyProject());
    setSource(null);
    setStatus('statusEmpty');
    grid.value = 8;
    snap.value = true;
    cursorTick.value = 0;
    setSelection(null, null);
    pxPerTick.value = 6;
    stopGlide();
    scrollTick.value = 0;
    followPlayhead.value = true;
    exportLock.value = false;
    tapOffsetMs.value = 0;
    bandBusy.value = false;
  }
  return {
    document,
    doc,
    track,
    currentTrackId,
    sessions,
    timeBase,
    timeBaseOf,
    timelineTicks,
    timelineLength,
    viewportWidth,
    zoomToFit,
    docRevision,
    documentGeneration,
    isDirty,
    lastFile,
    markSaved,
    previewTicks,
    source,
    peaks,
    phase,
    status,
    isError,
    grid,
    snap,
    cursorTick,
    selectedTicks,
    selectionStartTick,
    selectionEndTick,
    pxPerTick,
    scrollTick,
    playing,
    playheadSample,
    masterAmp,
    trackAmps,
    setTrackMix,
    setTrackGainPreview,
    cueAmp,
    setVolumePreview,
    setCueVolumePreview,
    volume,
    cueVolume,
    playbackRate,
    followPlayhead,
    cueMode,
    noisegateEnabled,
    sliceProcessing,
    sliceProcessingOf,
    baseName,
    clipStartNumber,
    useFfNumbering,
    exportLock,
    bandsVisible,
    rmsVisible,
    bandAnalysis,
    bandDetection,
    tapOffsetMs,
    bandEstimate,
    bandBusy,
    ticks,
    markerKeys,
    linkedTicks,
    sharedMarkers,
    markerAllowed,
    canUndo,
    canRedo,
    transact,
    editTrack,
    selectTrack,
    renameTrack,
    renamingTrackId,
    replaceDocument,
    undo,
    redo,
    setLastFile,
    setTicks,
    addTicks,
    setOutputOptions,
    setNoisegateEnabled,
    setBandDetection,
    cancelDraft,
    registerDraftCancellation,
    setPreviewTicks,
    setStatus,
    tickBeyondEnd,
    legalTick,
    setCursorTick,
    moveCursorTo,
    setSelectedTicks,
    setSelection,
    setScrollTick,
    snapTick,
    zoomAt,
    setPlaybackRate,
    setVolume,
    setCueVolume,
    setPlaying,
    setPlayheadSample,
    setSource,
    setPhase,
    setBandAnalysis,
    setDocumentOptions,
    reset,
  };
});
export type EditorStore = ReturnType<typeof useEditorStore>;
