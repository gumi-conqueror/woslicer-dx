import type { SourceAudio } from '../core/audio/pcm';
import { computed, markRaw, shallowRef, triggerRef } from 'vue';
import { defineStore } from 'pinia';
import { normalizeSelection } from '../core/markers';
import { remapMarkerKeys, type MarkerKeys } from '../project/marker-keys';
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
  /** The current track's tick-to-sample time base; `null` until its audio is loaded. */
  const timeBase = computed<Readonly<TimeBase> | null>(() =>
    source.value
      ? Object.freeze({
          bpm: document.value.timing.bpm,
          shift: document.value.timing.shiftTicks,
          sampleRate: source.value.sampleRate,
        })
      : null,
  );
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
  const trackPlayback = computed(() => {
    const { gainDb, muted, solo } = track.value;
    return { gainDb, muted, solo };
  });
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
  // Master route: master mute or track mute wins over solo; gains sum in dB.
  const masterAmp = computed(() => {
    const global = document.value.global;
    if (global.masterMuted || trackPlayback.value.muted) return 0;
    const gain = volumePreview.value === null ? global.masterGainDb : ampToDb(volumePreview.value);
    return dbToAmp(clampGainDb(gain + trackPlayback.value.gainDb));
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
  /** Slice rendering settings for preview and export. A disabled noise gate renders as 0 dB. */
  const sliceProcessing = computed(() =>
    Object.freeze({
      fadeoutMs: track.value.slicing.fadeoutMs,
      noisegateDb: noisegateEnabled.value ? track.value.slicing.noisegateDb : 0,
    }),
  );
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
  const canUndo = computed(() => project.value.canUndo);
  const canRedo = computed(() => project.value.canRedo);
  function publish(): void {
    triggerRef(project);
    selectedTicks.value = selectedTicks.value.filter((t) => ticks.value.includes(t));
  }
  function cancelDraft(): void {
    volumePreview.value = null;
    cueVolumePreview.value = null;
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
  /** One undoable edit of the current track. */
  function editTrack<T>(edit: (draft: ProjectTrack) => T) {
    return transact((draft) => edit(currentTrack(draft, currentTrackId.value)));
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
  function setTicks(value: readonly number[], keys: MarkerKeys = markerKeys.value): boolean {
    return transact((draft) => {
      const { slicing } = currentTrack(draft, currentTrackId.value);
      slicing.markers = normalizeSelection(value);
      const retained = new Set(slicing.markers);
      slicing.markerKeys = remapMarkerKeys(
        keys.filter((entry) => retained.has(entry.tick)),
        (tick) => tick,
      );
    }).changed;
  }
  function addTicks(value: readonly number[]): number {
    return editTrack(({ slicing }) => {
      const additions = normalizeSelection(value).filter((t) => !slicing.markers.includes(t));
      slicing.markers = normalizeSelection([...slicing.markers, ...additions]);
      return additions.length;
    }).value;
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
  function legalTick(tick: number): boolean {
    const audio = source.value,
      base = timeBase.value;
    return markerTickAllowed(tick, audio && base && { base, length: audio.length });
  }
  function setCursorTick(tick: number): void {
    if (Number.isFinite(tick))
      cursorTick.value = Math.max(0, Math.min(MAX_TICKS - 1, Math.round(tick)));
  }
  function setSelectedTicks(value: readonly number[]): void {
    selectedTicks.value = normalizeSelection(value).filter((t) => ticks.value.includes(t));
  }
  function setSelection(start: number | null, end: number | null): void {
    selectionStartTick.value = start;
    selectionEndTick.value = end;
  }
  function setScrollTick(value: number): void {
    if (Number.isFinite(value)) scrollTick.value = Math.max(0, value);
  }
  function snapTick(tick: number): number {
    return resolveBreakpointTick(tick, snap.value, gridStepTicks(grid.value), false);
  }
  function zoomAt(anchor: number, factor: number): void {
    const frames = timeBase.value ? samplesPerTick(timeBase.value) : 500;
    const next = zoomView({ scale: pxPerTick.value, scroll: scrollTick.value }, anchor, factor, {
      min: 0.02,
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
    canUndo,
    canRedo,
    transact,
    editTrack,
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
