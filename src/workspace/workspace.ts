import { inject, provide, readonly, shallowRef, type InjectionKey } from 'vue';
import { errorMessage } from '../core/messages';
import { audioFileFormat } from '../core/audio-formats';
import {
  createEmptyTrack,
  currentTrack,
  decodeProject,
  encodeProject,
  parseProject,
  projectFromWos,
} from '../project/codec';
import { FIELD_RANGES, inRange, PROJECT_MAX_TRACKS, type ProjectDocument } from '../project/schema';
import {
  identifyAudio,
  projectFileName,
  projectWithAudio,
  matchesProjectAudio,
  relinkMedia,
  setTrackAudio,
} from './project-media';
import { readWos } from '@gumi-conqueror/wos-file';
import { linkMarkersTo } from '../project/marker-links';
import { markerTickAllowed } from '../core/timebase';
import type { ChosenFile, Platform, OpenedFile } from '../platform/contracts';
import type { EditorStore } from '../slicing/editor-store';
import { createAudioEngine } from '../audio/audio-client';
import type { AudioEngine } from '../audio/audio-jobs';
import type { DecodeProgress } from '../audio/decode';
import { createSessionPersistence } from './persistence';
import { readEditorSession, restoreEditorSession, type SessionReadResult } from './session';

export type RecoveryBlock =
  | { kind: 'invalid' }
  | { kind: 'earlier' }
  | { kind: 'read-failed' }
  | { kind: 'future'; version: number };
export interface RelinkDifference {
  current: string;
  selected: string;
}
export interface WorkspaceOptions {
  platform: Platform;
  editor: EditorStore;
  createEngine?: () => AudioEngine;
  confirmDiscardRecovery?: (block: RecoveryBlock) => Promise<boolean>;
  confirmRelinkDifference?: (difference: RelinkDifference) => Promise<boolean>;
}
export interface LoadingActivity {
  stage: 'restoring' | 'opening' | 'reading' | 'decoding';
  name?: string;
  mediaId?: string;
  /** The track that receives the audio; absent before a target is known. */
  trackId?: string;
  /** The audio becomes a new track; the track list shows a placeholder row for it. */
  newTrack?: boolean;
  /** While decoding: the declared audio length and the frames decoded so far. */
  audio?: DecodeProgress;
}
/** The decoded audio of the tracks, for the features that process it. */
export interface WorkspaceAudio {
  /** The engine that holds a track's decoded audio; null while the track has none. */
  engine(trackId: string): AudioEngine | null;
  currentEngine(): AudioEngine | null;
  /** Changes when audio is released or replaced. A result of an older generation is stale. */
  generation(): number;
  /** The workspace is disposed: the application is closing, and late results are dropped. */
  closed(): boolean;
}
export function createWorkspace(options: WorkspaceOptions) {
  const { platform, editor, createEngine = createAudioEngine } = options;
  let generation = 0,
    disposed = false,
    sessionClosed = false;
  let recoveryBlock: RecoveryBlock | null = null;
  /** Decoded audio lives in one engine per track. */
  const engines = new Map<string, AudioEngine>();
  const currentEngine = () => engines.get(editor.track.trackId) ?? null;
  let pendingEngine: AudioEngine | null = null;
  let opening = 0;
  const loading = shallowRef<LoadingActivity | null>(null);
  let resetPending: Promise<void> | null = null;
  const persistence = createSessionPersistence(platform, editor, (error) => {
    editor.setStatus('sessionSaveFailed', { message: errorMessage(error) }, true);
  });
  const audio: WorkspaceAudio = {
    engine: (trackId) => engines.get(trackId) ?? null,
    currentEngine,
    generation: () => generation,
    closed: () => disposed,
  };
  function beginOpening(activity: LoadingActivity | null = null): number {
    opening++;
    loading.value = activity;
    pendingEngine?.dispose();
    pendingEngine = null;
    if (editor.phase.kind === 'loading')
      editor.setPhase({ kind: editor.source ? 'ready' : 'empty' });
    return opening;
  }
  function finishOpening(request: number): void {
    if (request === opening) loading.value = null;
  }
  /**
   * Ends pending work and releases decoded audio: of one track, or of every
   * track when the whole workspace changes.
   */
  function invalidate(trackId?: string): number {
    beginOpening();
    generation++;
    for (const [id, item] of engines)
      if (trackId === undefined || id === trackId) {
        item.dispose();
        engines.delete(id);
      }
    editor.setPlaying(false);
    editor.exportLock = false;
    editor.bandBusy = false;
    return generation;
  }
  /** The preserved record must not be overwritten before the user explicitly discards it. */
  async function releaseRecoveryBlock(): Promise<boolean> {
    if (!recoveryBlock) return true;
    const block: RecoveryBlock = { ...recoveryBlock };
    if (
      !options.confirmDiscardRecovery ||
      !(await options.confirmDiscardRecovery(block)) ||
      disposed
    )
      return false;
    recoveryBlock = null;
    persistence.resume();
    return true;
  }

  /**
   * Decodes audio for a track: the current track by default, a given track, or
   * a new track appended in one undoable edit once the audio is ready.
   */
  async function loadAudio(
    file: OpenedFile,
    preserveBaseName = false,
    target: { trackId: string } | { newTrack: true } = { trackId: editor.track.trackId },
  ): Promise<void> {
    if (resetPending) await resetPending;
    if (disposed) return;
    sessionClosed = false;
    persistence.resume();
    const newTrack = 'newTrack' in target;
    const trackId = newTrack
      ? `${editor.document.projectId}:track:${crypto.randomUUID()}`
      : target.trackId;
    const request = beginOpening({
        trackId,
        newTrack,
        stage: 'decoding',
        name: file.name,
        mediaId: preserveBaseName ? editor.track.media?.mediaId : undefined,
      }),
      documentGeneration = editor.documentGeneration;
    const previousPhase = editor.sessions.get(trackId)?.source
      ? { kind: 'ready' as const }
      : { kind: 'empty' as const };
    editor.setPhase({ kind: 'loading', name: file.name }, trackId);
    editor.setStatus('parsingSourceFile');
    let worker: AudioEngine | null = null;
    try {
      // Hashing and decoding run at the same time, so the audio length shows
      // early. Both read their own copy of the bytes.
      worker = createEngine();
      pendingEngine = worker;
      const [identity, result] = await Promise.all([
        identifyAudio(file),
        worker.decode(file.name, file.bytes, (audio) => {
          if (!disposed && request === opening)
            loading.value = { ...loading.value, stage: 'decoding', audio };
        }),
      ]);
      if (disposed || request !== opening) return;
      // Parameter and marker edits remain valid during decoding. Only replacing
      // the document invalidates this result; merge audio into the latest state.
      if (documentGeneration !== editor.documentGeneration)
        throw new Error('Project changed during audio loading; select the audio again');
      const expected =
        preserveBaseName && !newTrack ? currentTrack(editor.document, trackId).media : null;
      if (expected) {
        const different = !matchesProjectAudio(expected, identity, result);
        if (different) {
          const confirm = options.confirmRelinkDifference;
          if (!confirm || !(await confirm({ current: expected.name, selected: file.name })))
            throw new Error('Selected audio does not match the project media');
          if (disposed || request !== opening) return;
          if (documentGeneration !== editor.documentGeneration)
            throw new Error('Project changed during audio loading; select the audio again');
        }
        const pathChanged =
          file.absolutePath !== undefined &&
          (expected.originHint?.kind !== 'desktop' ||
            expected.originHint.pathHint !== file.absolutePath);
        if (different || pathChanged)
          editor.editTrack(
            (track) => relinkMedia(track, file, identity, result, different),
            trackId,
          );
      }
      // With one track, new audio starts a new project from it. With several
      // tracks, it is an undoable edit of its track that keeps the project.
      const single = !newTrack && editor.document.tracks.length === 1;
      const next =
        expected || !single
          ? null
          : projectWithAudio(editor.document, file, identity, result, preserveBaseName, trackId);
      // The first audio of a project without audio or markers presets the BPM.
      // Existing markers keep the BPM, because another BPM would move them in time.
      const fresh =
        next !== null &&
        !preserveBaseName &&
        editor.document.tracks.every((item) => !item.media && !item.slicing.markers.length);
      const bpm = fresh ? await worker.tempo() : null;
      if (disposed || request !== opening) return;
      if (documentGeneration !== editor.documentGeneration)
        throw new Error('Project changed during audio loading; select the audio again');
      if (next && bpm !== null && inRange(bpm, FIELD_RANGES.bpm)) next.timing.bpm = bpm;
      // Validate the replacement before releasing the current decoder or source.
      if (next) parseProject(next);
      pendingEngine = null;
      invalidate(trackId);
      engines.set(trackId, worker);
      worker = null;
      if (next) {
        editor.replaceDocument(next, { saved: preserveBaseName });
      } else if (newTrack) {
        const track = createEmptyTrack(trackId, file.name);
        setTrackAudio(track, file, identity, result);
        const base = {
          bpm: editor.document.timing.bpm,
          shift: editor.document.timing.shiftTicks,
          sampleRate: result.source.sampleRate,
        };
        const fits = (_: string, tick: number) =>
          markerTickAllowed(tick, { base, length: result.source.length });
        const from = editor.track.trackId;
        editor.transact((draft) => {
          draft.tracks.push(track);
          // With shared markers, a new track starts with linked copies of the current track's markers.
          if (draft.global.sharedMarkers)
            linkMarkersTo(
              draft.tracks,
              from,
              currentTrack(draft, from).slicing.markers,
              [trackId],
              fits,
            );
        });
        editor.selectTrack(trackId);
      } else if (!expected)
        editor.editTrack((track) => setTrackAudio(track, file, identity, result), trackId);
      const name = file.name.replace(/\.[^.]+$/, '');
      editor.setSource(
        { ...result.source, floatData: result.floatData, name, reference: file.reference },
        result.peaks,
        trackId,
      );
      // The binding survives failed reopens; only a real replacement writes or clears it.
      editor.setLastFile(file.reference ? { reference: file.reference, name } : null, trackId);
      editor.setPhase({ kind: 'ready' }, trackId);
      const ready = {
        key: 'readySource' as const,
        params: { name, rate: result.source.sampleRate, channels: result.source.channels },
      };
      editor.setStatus(
        next && bpm !== null ? [ready, { key: 'tempoDetected', params: { bpm } }] : [ready],
      );
    } catch (error) {
      if (disposed || request !== opening) return;
      editor.setPhase(previousPhase, trackId);
      editor.setStatus('loadFailed', { message: errorMessage(error) }, true);
    } finally {
      finishOpening(request);
      if (pendingEngine === worker) pendingEngine = null;
      worker?.dispose();
    }
  }
  /**
   * Adds tracks with audio that the user chooses; several files add several
   * tracks. An empty current track takes the first file.
   */
  async function addTrack(): Promise<void> {
    if (recoveryBlock && !(await releaseRecoveryBlock())) return;
    if (editor.document.tracks.length >= PROJECT_MAX_TRACKS) {
      editor.setStatus('trackLimit', { count: PROJECT_MAX_TRACKS }, true);
      return;
    }
    const documentGeneration = editor.documentGeneration,
      request = beginOpening({ stage: 'opening' });
    let files: ChosenFile[] = [];
    try {
      files = await platform.openFiles('audio');
    } catch (error) {
      if (!disposed && request === opening)
        editor.setStatus('loadFailed', { message: errorMessage(error) }, true);
    } finally {
      finishOpening(request);
    }
    if (!disposed && documentGeneration === editor.documentGeneration && request === opening)
      await openChosenFiles(files);
  }
  /** Removes the current track in one undoable edit; the last track stays. */
  function removeTrack(): void {
    const tracks = editor.document.tracks;
    if (tracks.length <= 1) {
      editor.setStatus('lastTrackKept', true);
      return;
    }
    const index = tracks.findIndex((item) => item.trackId === editor.track.trackId);
    const removed = editor.track;
    const neighbor = tracks[index + 1] ?? tracks[index - 1];
    if (!neighbor) return;
    editor.selectTrack(neighbor.trackId);
    // Decoded audio stays in its session, so undo restores the track with its audio.
    editor.transact((draft) => {
      draft.tracks = draft.tracks.filter((item) => item.trackId !== removed.trackId);
    });
    editor.setStatus('trackRemoved', { name: removed.name });
  }
  /** Moves the current track up or down the list in one undoable edit. */
  function moveTrack(direction: -1 | 1): void {
    const id = editor.track.trackId;
    editor.transact((draft) => {
      const index = draft.tracks.findIndex((item) => item.trackId === id);
      const target = index + direction;
      const moved = draft.tracks[index];
      const other = draft.tracks[target];
      if (!moved || !other) return;
      draft.tracks[target] = moved;
      draft.tracks[index] = other;
    });
  }
  /** Selects the previous or next track. */
  function stepTrack(direction: -1 | 1): void {
    const tracks = editor.document.tracks;
    const index = tracks.findIndex((item) => item.trackId === editor.track.trackId);
    const next = tracks[index + direction];
    if (next) editor.selectTrack(next.trackId);
  }
  async function openAudio(): Promise<void> {
    if (recoveryBlock && !(await releaseRecoveryBlock())) return;
    const version = generation,
      documentGeneration = editor.documentGeneration,
      request = beginOpening({ stage: 'opening' });
    try {
      const file = await platform.openFile('audio');
      if (
        file &&
        !disposed &&
        version === generation &&
        documentGeneration === editor.documentGeneration &&
        request === opening
      )
        await loadAudio(file);
    } catch (error) {
      if (!disposed && request === opening)
        editor.setStatus('loadFailed', { message: errorMessage(error) }, true);
    } finally {
      finishOpening(request);
    }
  }
  async function relinkAudio(): Promise<void> {
    if (!editor.track.media) return;
    const documentGeneration = editor.documentGeneration,
      request = beginOpening({ stage: 'opening', name: editor.track.media?.name });
    try {
      const file = await platform.openFile('audio');
      if (
        file &&
        !disposed &&
        documentGeneration === editor.documentGeneration &&
        request === opening
      )
        await loadAudio(file, true);
    } catch (error) {
      if (!disposed && request === opening)
        editor.setStatus('loadFailed', { message: errorMessage(error) }, true);
    } finally {
      finishOpening(request);
    }
  }
  /**
   * Replaces the whole workspace with another project: stale requests end, the
   * audio, history and editing state are cleared, and recovery data resumes.
   */
  function replaceWorkspace(project: ProjectDocument): void {
    invalidate();
    sessionClosed = false;
    persistence.resume();
    editor.setLastFile(null);
    editor.replaceDocument(project);
    editor.setSource(null);
    editor.setPhase({ kind: 'empty' });
  }
  async function acceptProject(file: OpenedFile): Promise<void> {
    const parsed = decodeProject(file.bytes);
    if (parsed.kind === 'unsupported-version')
      throw new Error(`Unsupported project version: ${parsed.version}`);
    replaceWorkspace(parsed.project);
    const media = editor.track.media;
    const projectReference = file.reference;
    if (parsed.unknownFields.length)
      editor.setStatus([
        {
          key: media ? 'projectMediaMissing' : 'projectOpened',
          params: { name: media?.name ?? file.name },
        },
        { key: 'projectUnknownFields', params: { count: parsed.unknownFields.length } },
      ]);
    else
      editor.setStatus(media ? 'projectMediaMissing' : 'projectOpened', {
        name: media?.name ?? file.name,
      });
    if (!projectReference) return;
    // The desktop app reopens each track's audio next to the project, one after another.
    for (const track of editor.document.tracks) {
      const asset = track.media;
      if (asset?.originHint?.kind !== 'desktop') continue;
      const request = beginOpening({
          stage: 'reading',
          name: asset.name,
          mediaId: asset.mediaId,
          trackId: track.trackId,
        }),
        documentGeneration = editor.documentGeneration;
      try {
        const audio = await platform.openProjectMedia(projectReference, asset.mediaId);
        if (disposed || request !== opening || documentGeneration !== editor.documentGeneration)
          return;
        if (audio) await loadAudio(audio, true, { trackId: track.trackId });
      } catch {
        if (!disposed && request === opening)
          editor.setStatus('projectMediaMissing', { name: asset.name }, true);
      } finally {
        finishOpening(request);
      }
    }
  }
  async function openProject(): Promise<void> {
    if (recoveryBlock && !(await releaseRecoveryBlock())) return;
    if (resetPending) await resetPending;
    if (disposed) return;
    const revision = editor.docRevision,
      request = beginOpening({ stage: 'opening' });
    try {
      const file = await platform.openFile('wosdx');
      if (file && !disposed && request === opening && revision === editor.docRevision)
        await acceptProject(file);
    } catch (error) {
      if (!disposed && request === opening)
        editor.setStatus('loadFailed', { message: errorMessage(error) }, true);
    } finally {
      finishOpening(request);
    }
  }
  async function saveProject(): Promise<void> {
    const version = generation;
    const revision = editor.docRevision,
      projectId = editor.document.projectId;
    try {
      const name = projectFileName(editor.document.name);
      const bytes = encodeProject(editor.document);
      if (
        (await platform.saveFile('wosdx', name, bytes)) &&
        !disposed &&
        version === generation &&
        projectId === editor.document.projectId
      ) {
        const current = editor.markSaved(revision);
        editor.setStatus(current ? 'projectSaved' : 'projectSnapshotSaved', { name });
      }
    } catch (error) {
      if (!disposed && version === generation)
        editor.setStatus('loadFailed', { message: errorMessage(error) }, true);
    }
  }
  /**
   * Opens dropped or picked files. A project replaces the current project, and the other
   * files are ignored. Audio files become tracks: the first one fills the
   * current track when it has no audio, and every further file adds a track.
   */
  async function openChosenFiles(files: readonly ChosenFile[]): Promise<void> {
    if (recoveryBlock && !(await releaseRecoveryBlock())) return;
    const project = files.find((file) => /\.wosdx$/i.test(file.name));
    if (project) {
      await openChosen(project, (opened) => acceptProject(opened), true);
      return;
    }
    // Filling an empty track starts a new project; another replacement stops the loop.
    let documentGeneration = editor.documentGeneration;
    for (const [index, file] of files.filter((item) => audioFileFormat(item.name)).entries()) {
      if (disposed || documentGeneration !== editor.documentGeneration) return;
      const fill = index === 0 && !editor.track.media && !editor.source;
      if (!fill && editor.document.tracks.length >= PROJECT_MAX_TRACKS) {
        editor.setStatus('trackLimit', { count: PROJECT_MAX_TRACKS }, true);
        return;
      }
      await openChosen(file, (opened) =>
        loadAudio(opened, false, fill ? { trackId: editor.track.trackId } : { newTrack: true }),
      );
      if (fill) documentGeneration = editor.documentGeneration;
    }
  }
  /** Reads one chosen file and opens it, unless the document changed meanwhile. */
  async function openChosen(
    file: ChosenFile,
    open: (opened: OpenedFile) => Promise<void>,
    project = false,
  ): Promise<void> {
    const request = beginOpening({ stage: 'reading', name: file.name }),
      revision = editor.docRevision,
      documentGeneration = editor.documentGeneration;
    try {
      const opened = await file.open();
      if (
        !disposed &&
        request === opening &&
        documentGeneration === editor.documentGeneration &&
        (!project || revision === editor.docRevision)
      )
        await open(opened);
    } catch (error) {
      if (!disposed && request === opening)
        editor.setStatus('dropFailed', { message: errorMessage(error) }, true);
    } finally {
      finishOpening(request);
    }
  }
  async function reopen(
    reference: string,
    preserveBaseName = false,
    trackId = editor.track.trackId,
  ): Promise<void> {
    const name =
      currentTrack(editor.document, trackId).media?.name ??
      editor.sessions.get(trackId)?.lastFile?.name;
    const request = beginOpening({ stage: 'reading', name, trackId }),
      documentGeneration = editor.documentGeneration;
    try {
      const file = await platform.reopenFile(reference);
      if (!disposed && request === opening && documentGeneration === editor.documentGeneration)
        await loadAudio(file, preserveBaseName, { trackId });
    } catch {
      if (!disposed && request === opening)
        editor.setStatus('lastFileMissing', { name: name ?? reference }, true);
    } finally {
      finishOpening(request);
    }
  }
  /** Replaces the whole workspace with a fresh project that only carries the WOS timing. */
  async function newProjectFromWos(): Promise<void> {
    if (recoveryBlock && !(await releaseRecoveryBlock())) return;
    if (resetPending) await resetPending;
    if (disposed) return;
    const revision = editor.docRevision,
      request = beginOpening();
    try {
      const file = await platform.openFile('wos');
      if (!file || disposed || request !== opening || revision !== editor.docRevision) return;
      const data = readWos(file.bytes);
      replaceWorkspace(projectFromWos(data, file.name));
      editor.setStatus('loadedWos', { file: file.name, bpm: data.bpm, shift: data.shift });
    } catch (error) {
      if (!disposed && request === opening)
        editor.setStatus('wosLoadFailed', { message: errorMessage(error) }, true);
    }
  }
  async function restoreSession(): Promise<void> {
    const version = generation,
      revision = editor.docRevision,
      request = beginOpening({ stage: 'restoring' });
    persistence.pause();
    try {
      let outcome: SessionReadResult;
      try {
        outcome = readEditorSession(await platform.readSession());
      } catch (error) {
        outcome = { kind: 'read-failed', error };
      }
      if (
        disposed ||
        version !== generation ||
        revision !== editor.docRevision ||
        request !== opening
      )
        return;
      if (outcome.kind === 'absent') return;
      if (outcome.kind === 'restored') {
        restoreEditorSession(editor, outcome.session);
        const restoredGeneration = editor.documentGeneration;
        for (const [trackId, file] of Object.entries(outcome.session.files)) {
          if (disposed || editor.documentGeneration !== restoredGeneration) return;
          await reopen(file.reference, true, trackId);
        }
        return;
      }
      // Earlier, damaged, future and unreadable records stay preserved; recovery writes stay paused.
      recoveryBlock =
        outcome.kind === 'future'
          ? { kind: 'future', version: outcome.version }
          : outcome.kind === 'invalid' || outcome.kind === 'earlier'
            ? { kind: outcome.kind }
            : { kind: 'read-failed' };
      if (outcome.kind === 'invalid') editor.setStatus('sessionRecoverInvalid', true);
      else if (outcome.kind === 'earlier') editor.setStatus('sessionRecoverEarlier', true);
      else if (outcome.kind === 'future')
        editor.setStatus('sessionRecoverFuture', { version: outcome.version }, true);
      else
        editor.setStatus(
          'sessionRecoverReadFailed',
          { message: errorMessage(outcome.error) },
          true,
        );
    } finally {
      finishOpening(request);
      if (!disposed && !sessionClosed && !recoveryBlock) persistence.resume();
    }
  }
  function reset(): Promise<void> {
    if (resetPending) return resetPending;
    sessionClosed = true;
    recoveryBlock = null;
    persistence.pause();
    invalidate();
    editor.reset();
    resetPending = persistence
      .clear()
      .catch((error) => {
        editor.setStatus('loadFailed', { message: errorMessage(error) }, true);
      })
      .finally(() => {
        resetPending = null;
        if (!disposed) persistence.resume();
      });
    // Only subsequent edits become dirty: closing alone must leave no archive.
    return resetPending;
  }
  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    invalidate();
    await persistence.dispose();
  }
  return {
    editor,
    loading: readonly(loading),
    platform,
    audio,
    openAudio,
    addTrack,
    removeTrack,
    stepTrack,
    moveTrack,
    openProject,
    saveProject,
    relinkAudio,
    openChosenFiles,
    loadAudio,
    reopen,
    newProjectFromWos,
    reset,
    restoreSession,
    dispose,
    flushSession: persistence.flush,
  };
}
export type Workspace = ReturnType<typeof createWorkspace>;
export const workspaceKey: InjectionKey<Workspace> = Symbol('workspace');
export function provideWorkspace(workspace: Workspace): void {
  provide(workspaceKey, workspace);
}
export function useWorkspace(): Workspace {
  const workspace = inject(workspaceKey);
  if (!workspace) throw new Error('Workspace provider is missing');
  return workspace;
}
