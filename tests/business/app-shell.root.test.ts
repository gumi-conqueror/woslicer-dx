import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { nextTick, type ComponentPublicInstance } from 'vue';
import { ElMessageBox, type MessageBoxData } from 'element-plus';
import App from '../../src/app/App.vue';
import ApplicationMenu from '../../src/app/components/ApplicationMenu.vue';
import WindowTitlebar from '../../src/app/components/WindowTitlebar.vue';
import CalibrationDialog from '../../src/calibration/CalibrationDialog.vue';
import { pinia, localization } from '../../src/app/runtime';
import { useEditorStore } from '../../src/slicing/editor-store';

/**
 * What Element Plus resolves a confirmed box with: the action string. Its
 * declared result type also has the fields of a prompt box, which a
 * confirmation never carries, so the plain string needs this one assertion.
 */
const confirmed = 'confirm' as MessageBoxData;

const effects = vi.hoisted(() => ({
  stopAudio: vi.fn(),
  disposeAudio: vi.fn(),
  restore: vi.fn(async () => {}),
  reset: vi.fn(async () => {}),
  openProject: vi.fn(async () => {}),
  disposeWorkspace: vi.fn(async () => {}),
  flushSession: vi.fn(async () => {}),
  keydown: vi.fn(),
  execute: vi.fn(),
}));
vi.mock('../../src/platform', () => ({
  getPlatform: () => ({ kind: 'browser', setTheme: async () => {}, watchDrops: () => () => {} }),
  // Intentionally unresolved: mounting and interaction must not wait for build metadata.
  getBuildIdentity: () => new Promise(() => {}),
}));
vi.mock('../../src/workspace/workspace', () => ({
  createWorkspace: () => ({
    restoreSession: effects.restore,
    reset: effects.reset,
    openProject: effects.openProject,
    dispose: effects.disposeWorkspace,
    flushSession: effects.flushSession,
  }),
  provideWorkspace: () => {},
}));
vi.mock('../../src/playback', () => ({
  createPlayback: () => ({
    stop: effects.stopAudio,
    dispose: effects.disposeAudio,
    getAudioContext: () => null,
  }),
  providePlayback: () => {},
}));
vi.mock('../../src/commands/commands', async (original) => ({
  ...(await original<typeof import('../../src/commands/commands')>()),
  createCommands: ({
    hosts,
  }: {
    hosts: {
      close: () => Promise<void>;
      openProject: () => Promise<void>;
      openDialog: (id: 'help' | 'about') => void;
      calibrate: () => void;
      report: (error: unknown) => void;
    };
  }) => {
    async function execute(command: string) {
      effects.execute(command);
      if (command === 'close-project') await hosts.close();
      if (command === 'open-project') await hosts.openProject();
      if (command === 'calibrate') hosts.calibrate();
      if (command === 'help' || command === 'about') hosts.openDialog(command);
    }
    return { run: (command: string) => execute(command).catch(hosts.report) };
  },
}));
vi.mock('../../src/input/keyboard', () => ({ handleKeyDown: effects.keydown }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  useEditorStore(pinia).reset();
});
function render() {
  return mount(App, {
    global: {
      plugins: [pinia, localization.i18n],
      stubs: {
        EditorToolbar: true,
        WorkspacePanels: true,
        StatusBar: true,
        TimelineEditor: true,
        PlaybackControls: true,
        CalibrationDialog: true,
        AboutDialog: true,
        HelpDialog: true,
      },
    },
  });
}

it('mounts without Suspense or build metadata and releases owned subscriptions on unmount', async () => {
  const wrapper = render();
  expect(wrapper.find('main').exists()).toBe(true);
  await flushPromises();
  expect(effects.restore).toHaveBeenCalledOnce();
  expect(wrapper.find('[role="menubar"]').exists()).toBe(true);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
  expect(effects.keydown).toHaveBeenCalledOnce();
  wrapper.unmount();
  await flushPromises();
  expect(effects.disposeAudio).toHaveBeenCalledOnce();
  expect(effects.disposeWorkspace).toHaveBeenCalledOnce();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
  expect(effects.keydown).toHaveBeenCalledOnce();
});
it('cancels native exit with dirty work and flushes recovery after approval', async () => {
  const editor = useEditorStore(pinia);
  editor.setDocumentOptions({ bpm: 175 });
  const confirm = vi
    .spyOn(ElMessageBox, 'confirm')
    .mockRejectedValueOnce('cancel')
    .mockResolvedValueOnce(confirmed);
  const wrapper = render();
  try {
    const beforeClose = wrapper
      .findComponent<ComponentPublicInstance<{ beforeClose: () => Promise<boolean> }>>(
        WindowTitlebar,
      )
      .props('beforeClose');
    expect(await beforeClose()).toBe(false);
    expect(effects.flushSession).not.toHaveBeenCalled();
    expect(await beforeClose()).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(effects.flushSession).toHaveBeenCalledOnce();
    expect(effects.stopAudio).toHaveBeenCalledOnce();
  } finally {
    wrapper.unmount();
  }
});
it('does not approve native exit when the recovery flush fails', async () => {
  const failure = new Error('Recovery unavailable');
  effects.flushSession.mockRejectedValueOnce(failure);
  const wrapper = render();
  try {
    await expect(
      wrapper
        .findComponent<ComponentPublicInstance<{ beforeClose: () => Promise<boolean> }>>(
          WindowTitlebar,
        )
        .props('beforeClose')(),
    ).rejects.toThrow(failure);
  } finally {
    wrapper.unmount();
  }
});
it('opens calibration from toolbar, isolates keyboard dispatch, and applies its offset', async () => {
  const editor = useEditorStore(pinia);
  editor.setSource({
    name: 'sample',
    reference: null,
    sampleRate: 48000,
    channels: 1,
    length: 1,
    data: [new Int16Array(1)],
    sourceFormat: { kind: 'pcm' as const, bits: 16 },
    floatData: [new Float32Array(1)],
  });
  const wrapper = render();
  try {
    wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'calibrate');
    await nextTick();
    expect(effects.stopAudio).toHaveBeenCalledOnce();
    expect(wrapper.findComponent(CalibrationDialog).props('modelValue')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(effects.keydown).not.toHaveBeenCalled();
    wrapper.findComponent(CalibrationDialog).vm.$emit('apply', 32);
    await nextTick();
    expect(editor.tapOffsetMs).toBe(32);
  } finally {
    wrapper.unmount();
  }
});
it('resets the workspace through the command dispatcher after the close is confirmed', async () => {
  vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(confirmed);
  const wrapper = render();
  try {
    wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'close-project');
    await flushPromises();
    expect(effects.execute).toHaveBeenCalledWith('close-project');
    expect(effects.reset).toHaveBeenCalledOnce();
  } finally {
    wrapper.unmount();
  }
});

// Confirmation protocol behavior: every case pins CURRENT behavior of the
// four boolean confirmations and the independent close lock so the R4
// protocol extraction can be compared against it.
function makeDirty(): void {
  const editor = useEditorStore(pinia);
  // The default document already has the gate enabled; a same-value write is a
  // no-op transaction, so flip the current value to make the edit count.
  editor.setNoisegateEnabled(!editor.document.tracks[0].slicing.noisegateEnabled);
}

function deferredConfirm(): {
  resolve: (value: MessageBoxData) => void;
  reject: (reason: unknown) => void;
} {
  // The executor assigns later, so return a mutable container instead of the
  // (still undefined) closure bindings captured at return time.
  const deferred: {
    resolve: (value: MessageBoxData) => void;
    reject: (reason: unknown) => void;
  } = {
    resolve: () => {},
    reject: () => {},
  };
  vi.spyOn(ElMessageBox, 'confirm').mockImplementation(
    () =>
      new Promise<MessageBoxData>((innerResolve, innerReject) => {
        deferred.resolve = innerResolve;
        deferred.reject = innerReject;
      }),
  );
  return deferred;
}

it('opens the project without a dialog while the document is clean', async () => {
  const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(confirmed);
  const wrapper = render();
  try {
    await flushPromises();
    expect(useEditorStore(pinia).isDirty).toBe(false);
    wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'open-project');
    await flushPromises();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(effects.openProject).toHaveBeenCalledOnce();
  } finally {
    wrapper.unmount();
  }
});

it('runs the confirmed project replacement and releases the lock afterwards', async () => {
  const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(confirmed);
  const wrapper = render();
  try {
    await flushPromises();
    makeDirty();
    wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'open-project');
    await flushPromises();
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(effects.openProject).toHaveBeenCalledOnce();
    wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'open-project');
    await flushPromises();
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(effects.openProject).toHaveBeenCalledTimes(2);
  } finally {
    wrapper.unmount();
  }
});

it('keeps the workspace and reports nothing when the replacement is cancelled', async () => {
  const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
  const editor = useEditorStore(pinia);
  const wrapper = render();
  try {
    await flushPromises();
    makeDirty();
    wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'open-project');
    await flushPromises();
    expect(effects.openProject).not.toHaveBeenCalled();
    expect(editor.isError).toBe(false);
    // The lock is released: a later confirmation still runs.
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(confirmed);
    wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'open-project');
    await flushPromises();
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(effects.openProject).toHaveBeenCalledOnce();
  } finally {
    wrapper.unmount();
  }
});

it('treats closing the replacement dialog like cancellation', async () => {
  vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('close');
  const editor = useEditorStore(pinia);
  const wrapper = render();
  try {
    await flushPromises();
    makeDirty();
    wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'open-project');
    await flushPromises();
    expect(effects.openProject).not.toHaveBeenCalled();
    expect(editor.isError).toBe(false);
  } finally {
    wrapper.unmount();
  }
});

it('surfaces confirmation errors through the status bar', async () => {
  vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(new Error('confirm boom'));
  const editor = useEditorStore(pinia);
  const wrapper = render();
  try {
    await flushPromises();
    makeDirty();
    wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'open-project');
    await flushPromises();
    expect(effects.openProject).not.toHaveBeenCalled();
    expect(editor.isError).toBe(true);
    expect(editor.status.segments[0]?.key).toBe('commandFailed');
    expect(editor.status.segments[0]?.params).toEqual({ message: 'confirm boom' });
  } finally {
    wrapper.unmount();
  }
});

it('rejects reentry while a confirmation is pending and keeps one dialog', async () => {
  const deferred = deferredConfirm();
  const wrapper = render();
  try {
    await flushPromises();
    makeDirty();
    wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'open-project');
    wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'open-project');
    await flushPromises();
    expect(ElMessageBox.confirm).toHaveBeenCalledOnce();
    expect(effects.openProject).not.toHaveBeenCalled();
    deferred.resolve(confirmed);
    await flushPromises();
    expect(effects.openProject).toHaveBeenCalledOnce();
  } finally {
    wrapper.unmount();
  }
});

it('ignores a confirmation that resolves after unmount', async () => {
  const deferred = deferredConfirm();
  const wrapper = render();
  await flushPromises();
  makeDirty();
  wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'open-project');
  wrapper.unmount();
  deferred.resolve(confirmed);
  await flushPromises();
  expect(effects.openProject).not.toHaveBeenCalled();
});

it('blocks repeated close commands and keyboard dispatch while a reset is pending', async () => {
  const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(confirmed);
  let resolveReset!: () => void;
  effects.reset.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolveReset = resolve;
      }),
  );
  const wrapper = render();
  try {
    await flushPromises();
    wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'close-project');
    wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'close-project');
    await flushPromises();
    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(effects.reset).toHaveBeenCalledOnce();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    expect(effects.keydown).not.toHaveBeenCalled();
    resolveReset();
    await flushPromises();
    expect(effects.reset).toHaveBeenCalledOnce();
  } finally {
    wrapper.unmount();
  }
});

it('releases the close lock and surfaces the error when the reset fails', async () => {
  const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(confirmed);
  effects.reset.mockRejectedValueOnce(new Error('disk full'));
  const editor = useEditorStore(pinia);
  const wrapper = render();
  try {
    await flushPromises();
    wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'close-project');
    await flushPromises();
    expect(effects.reset).toHaveBeenCalledOnce();
    expect(editor.isError).toBe(true);
    expect(editor.status.segments[0]?.key).toBe('commandFailed');
    expect(editor.status.segments[0]?.params).toEqual({ message: 'disk full' });
    // The lock is released: a second close re-confirms and retries the reset.
    // (Workspace clearing after a successful reset is pinned by the dedicated
    // close test above; this file shares one pinia across tests.)
    wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'close-project');
    await flushPromises();
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(effects.reset).toHaveBeenCalledTimes(2);
    expect(effects.stopAudio).toHaveBeenCalledTimes(2);
  } finally {
    wrapper.unmount();
  }
});

it('keeps the workspace and releases the lock when the close dialog is cancelled', async () => {
  const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel');
  const wrapper = render();
  try {
    await flushPromises();
    wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'close-project');
    await flushPromises();
    expect(effects.reset).not.toHaveBeenCalled();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(confirmed);
    wrapper.findComponent(ApplicationMenu).vm.$emit('command', 'close-project');
    await flushPromises();
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(effects.reset).toHaveBeenCalledOnce();
  } finally {
    wrapper.unmount();
  }
});
