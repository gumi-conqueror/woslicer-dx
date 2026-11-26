import { createPinia, disposePinia } from 'pinia';
import { createAudioProcessor, type AudioEngine } from '../../src/audio/audio-jobs';
import { useEditorStore } from '../../src/slicing/editor-store';
import { createWorkspace, type WorkspaceOptions } from '../../src/workspace/workspace';
import { wavFile } from './audio';
import type { Platform, OpenedFile, OutputFile } from '../../src/platform/contracts';
import { onTestFinished } from 'vitest';
import { readEditorSession } from '../../src/workspace/session';
import { createCommands } from '../../src/app/commands';
import { errorMessage } from '../../src/core/messages';
import type { Playback } from '../../src/playback';

/**
 * Business test driver: the real store, workspace, commands and DSP, with
 * doubles only at the platform, audio output and Worker transport boundaries.
 * The driver owns its lifetime within the current test.
 */
export function createTestApp(createEngine = processorEngine) {
  const app = fixture(createEngine);
  onTestFinished(() => app.dispose());
  const playback = silentPlayback();
  const commands = createCommands({
    editor: app.editor,
    workspace: app.workspace,
    playback,
    onClose() {},
    onAbout() {},
    onHelp() {},
    onCalibrate() {},
    onOpenProject: () => app.workspace.openProject(),
    onNewProjectFromWos: () => app.workspace.newProjectFromWos(),
    report: (error) => app.editor.setStatus('loadFailed', { message: errorMessage(error) }, true),
  });
  return Object.assign(app, {
    playback,
    commands,
    /** Runs a command as the menu, a shortcut or a controller would. */
    run: commands.execute,
  });
}

/** Playback for tests that do not listen: every transport call does nothing. */
export function silentPlayback(): Playback {
  return {
    play() {},
    pause() {},
    stop() {},
    togglePlayPause() {},
    seekSample() {},
    currentSample: () => 0,
    positionAt: () => ({ sample: 0, playing: false }),
    setRate() {},
    previewSlice() {},
    getAudioContext() {
      throw new Error('Audio output is not used in this test');
    },
    dispose() {},
  };
}

/** Tests use the real DSP dispatcher, replacing only the unavailable browser Worker transport. */
export function processorEngine(): AudioEngine {
  const process = createAudioProcessor();
  let id = 0;
  let disposed = false;
  function active(): void {
    if (disposed) throw new DOMException('Cancelled', 'AbortError');
  }
  return {
    async decode(name, bytes) {
      active();
      const reply = await process({ kind: 'decode', id: ++id, name, bytes });
      if (reply.kind !== 'decoded')
        throw new Error(reply.kind === 'error' ? reply.message : 'Unexpected reply');
      return reply;
    },
    async bands() {
      active();
      const reply = await process({ kind: 'bands', id: ++id });
      if (reply.kind !== 'bands') throw new Error('Unexpected reply');
      return reply.analysis;
    },
    async detect(params) {
      active();
      const reply = await process({ kind: 'detect', id: ++id, params });
      if (reply.kind !== 'detected') throw new Error('Unexpected reply');
      return reply.result;
    },
    async slice(params) {
      active();
      const reply = await process({ kind: 'slice', id: ++id, params });
      if (reply.kind !== 'slice') throw new Error('Unexpected reply');
      return reply.bytes;
    },
    async edges(base) {
      active();
      const reply = await process({ kind: 'edges', id: ++id, base });
      if (reply.kind !== 'edges') throw new Error('Unexpected reply');
      return reply.ticks;
    },
    dispose() {
      disposed = true;
    },
  };
}
export function audioFile(name = 'tone.wav', frames = 48000): OpenedFile {
  const pcm = Int16Array.from({ length: frames }, (_, i) => Math.round(Math.sin(i / 12) * 16000));
  return { name, reference: `/audio/${name}`, bytes: wavFile([pcm], 48000) };
}
export function fixture(createEngine = processorEngine) {
  const pinia = createPinia(),
    editor = useEditorStore(pinia);
  const saved: OutputFile[] = [],
    exported: OutputFile[] = [];
  let session: unknown = null;
  let opened: OpenedFile | null = null;
  let clipboard = '';
  const platform: Platform = {
    kind: 'browser',
    openProjectMedia() {
      return Promise.resolve(null);
    },
    openFile() {
      return Promise.resolve(opened);
    },
    reopenFile(reference) {
      if (opened?.reference === reference) return Promise.resolve(opened);
      return Promise.reject(new Error('Missing source'));
    },
    saveFile(_kind, name, bytes) {
      saved.push({ name, bytes });
      return Promise.resolve(true);
    },
    async exportFiles(files) {
      let count = 0;
      for await (const file of files) {
        exported.push(file);
        count++;
      }
      return count;
    },
    readClipboard() {
      return Promise.resolve(clipboard);
    },
    writeClipboard(value) {
      clipboard = value;
      return Promise.resolve();
    },
    readSession() {
      return Promise.resolve(session);
    },
    writeSession(value) {
      session = value;
      return Promise.resolve();
    },
    clearSession() {
      session = null;
      return Promise.resolve();
    },
    async setTheme() {},
  };
  const confirmOptions: {
    confirmDiscardRecovery?: WorkspaceOptions['confirmDiscardRecovery'];
    confirmRelinkDifference?: WorkspaceOptions['confirmRelinkDifference'];
  } = {};
  const workspace = createWorkspace({
    editor,
    platform,
    createEngine,
    confirmDiscardRecovery: (block) => confirmOptions.confirmDiscardRecovery?.(block) ?? false,
    confirmRelinkDifference: (difference) =>
      confirmOptions.confirmRelinkDifference?.(difference) ?? false,
  });
  return {
    pinia,
    editor,
    workspace,
    platform,
    saved,
    exported,
    confirmOptions,
    get session() {
      return session;
    },
    set session(value: unknown) {
      session = value;
    },
    set opened(value: OpenedFile | null) {
      opened = value;
    },
    async dispose() {
      await workspace.dispose();
      disposePinia(pinia);
    },
  };
}

/** The recovery record as the workspace reads it back, or null when it does not read back. */
export function restoredSession(raw: unknown) {
  const read = readEditorSession(raw);
  return read.kind === 'restored' ? read.session : null;
}
