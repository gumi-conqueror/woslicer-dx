<script setup lang="ts">
import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue';
import { errorMessage } from '../core/messages';
import { ElConfigProvider, ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { pinia, localization } from './runtime';
import { createCommands, provideCommandRunner, type DialogId } from '../commands/commands';
import ApplicationMenu from './components/ApplicationMenu.vue';
import WindowTitlebar from './components/WindowTitlebar.vue';
import { getPlatform, getBuildIdentity } from '../platform';
import type { BuildIdentity, ChosenFile } from '../platform/contracts';
import { useEditorStore } from '../slicing/editor-store';
import { createEditorActions, provideEditorActions } from '../slicing/editor-actions';
import { useBmhelperStore } from '../bmhelper/store';
import { createWorkspace, provideWorkspace } from '../workspace/workspace';
import { createPlayback, providePlayback } from '../playback';
import TimelineEditor from '../timeline/TimelineEditor.vue';
import PlaybackControls from '../playback/PlaybackControls.vue';
import CalibrationDialog from '../calibration/CalibrationDialog.vue';
import EditorToolbar from './components/EditorToolbar.vue';
import WorkspacePanels from './components/WorkspacePanels.vue';
import StatusBar from './components/StatusBar.vue';
import HelpDialog from './components/HelpDialog.vue';
import AboutDialog from './components/AboutDialog.vue';
import TroubleshootDialog from './components/TroubleshootDialog.vue';
import { useInputControls, navigateDialog } from '../input/use-gamepad';
import { editingControl, visibleDialog } from '../ui/focus';
import { canRecord } from '../commands/commands';
import { handleKeyDown } from '../input/keyboard';
import { routeGamepad, type InputContext, type WheelAction } from '../input/router';
import { useCommandWheel } from '../input/use-wheel';
import CommandWheel from '../input/CommandWheel.vue';
import { openDataFolder } from '../platform/app-data';
import { useInputState } from '../input/state';
import YuanconDialog from '../input/YuanconDialog.vue';
import InputSettingsDialog from '../input/InputSettingsDialog.vue';
import ExportDialog from '../export/ExportDialog.vue';
import { createExporter, provideExporter } from '../export/exporter';
import { createDetection, provideDetection } from '../detection/detection';
import { createLegacyInterop, provideLegacyInterop } from '../interop/legacy';
import { reservedControl, useBindingOverrides } from '../input/binding-overrides';
import { useYuanconRecording } from '../input/yuancon/use-recording';

// Assembly: platform, stores, workspace and playback providers.
const platform = getPlatform();
const editor = useEditorStore(pinia);
const input = useInputState(pinia);
const bmhelper = useBmhelperStore(pinia);
bmhelper.bindEditor(editor);
const workspace = createWorkspace({
  platform,
  editor,
  confirmDiscardRecovery,
  confirmRelinkDifference,
});
const loading = workspace.loading;
const actions = createEditorActions(editor);
const exporter = createExporter(platform, editor, workspace.audio);
const interop = createLegacyInterop(platform, editor, workspace.audio);
const playback = createPlayback(editor);
provideWorkspace(workspace);
provideEditorActions(actions);
provideExporter(exporter);
provideDetection(createDetection(editor, workspace.audio));
provideLegacyInterop(interop);
providePlayback(playback);
// Localized app state.
const { t } = useI18n({ useScope: 'global' });
const { elementLocale } = localization;
// One switch for each app-owned dialog. A new dialog adds a key here and a tag in the template.
const dialogs = reactive<Record<DialogId | 'calibration' | 'export', boolean>>({
  about: false,
  help: false,
  troubleshoot: false,
  yuancon: false,
  inputSettings: false,
  calibration: false,
  export: false,
});
const applicationMenu = useTemplateRef<InstanceType<typeof ApplicationMenu>>('applicationMenu');
const closing = ref(false);
// While a dialog is open or the close lock is held, app input does nothing.
const modalOpen = computed(() => closing.value || Object.values(dialogs).some(Boolean));
const dragActive = ref(false);
const panelGeneration = ref(0);
const identity = shallowRef<BuildIdentity | null>(null);
// Command dispatch for menu and toolbar events.
const commands = createCommands({
  editor,
  actions,
  workspace,
  exporter,
  interop,
  playback,
  hosts: {
    close: closeWorkspace,
    openProject,
    newProjectFromWos,
    calibrate,
    openDialog: (id) => {
      dialogs[id] = true;
    },
    openDataFolder,
    toggleRecording: () => {
      input.recording = !input.recording;
    },
    exportSlices: () => {
      dialogs.export = true;
    },
    openWheel: () => {
      // Opened without a held control, the wheel stays open like after a tap.
      const time = performance.now();
      wheel.holdFromController(time);
      wheel.send({ type: 'release', time });
    },
    modalOpen: () => modalOpen.value,
    report,
  },
});
const wheel = useCommandWheel({
  state: editor,
  run: (command) => {
    void execute(command);
  },
});
watch(modalOpen, (open) => {
  if (open) wheel.cancel();
});
watch(
  () => editor.documentGeneration,
  () => {
    input.recording = false;
  },
  { flush: 'sync' },
);
watch(
  () => !canRecord(editor),
  (disabled) => {
    if (disabled) input.recording = false;
  },
  { flush: 'sync' },
);
// Unmount guard, status reporting and command execution.
let disposed = false;
let stopAppearance: (() => void) | undefined;
function report(error: unknown): void {
  if (!disposed) editor.setStatus('loadFailed', { message: errorMessage(error) }, true);
}
const execute = commands.run;
provideCommandRunner(execute);
// Confirmation dialogs; the shared closing lock rejects reentry.
// Shared boolean-confirmation protocol: one closing lock, one MessageBox call,
// cancellation filtered from error reporting. Callers pass pre-translated text.
async function confirmAction(options: {
  body: string;
  title: string;
  confirmButtonText: string;
  cancelButtonText: string;
}): Promise<boolean> {
  if (closing.value) return false;
  closing.value = true;
  try {
    await ElMessageBox.confirm(options.body, options.title, {
      confirmButtonText: options.confirmButtonText,
      cancelButtonText: options.cancelButtonText,
      type: 'warning',
    });
    return !disposed;
  } catch (error: unknown) {
    if (error !== 'cancel' && error !== 'close') report(error);
    return false;
  } finally {
    closing.value = false;
  }
}
async function confirmProjectReplacement(): Promise<boolean> {
  if (!editor.isDirty) return true;
  return confirmAction({
    body: t('chrome.replaceProjectBody'),
    title: t('chrome.replaceProjectTitle'),
    confirmButtonText: t('chrome.replaceProjectOk'),
    cancelButtonText: t('chrome.closeCancel'),
  });
}
async function beforeWindowClose(): Promise<boolean> {
  if (closing.value) return false;
  if (
    editor.isDirty &&
    !(await confirmAction({
      body: t('window.closeBody'),
      title: t('window.closeTitle'),
      confirmButtonText: t('window.close'),
      cancelButtonText: t('chrome.closeCancel'),
    }))
  )
    return false;
  playback.stop();
  await workspace.flushSession();
  return true;
}
async function confirmDiscardRecovery(): Promise<boolean> {
  return confirmAction({
    body: t('chrome.discardRecoveryBody'),
    title: t('chrome.discardRecoveryTitle'),
    confirmButtonText: t('chrome.discardRecoveryOk'),
    cancelButtonText: t('chrome.discardRecoveryCancel'),
  });
}
async function confirmRelinkDifference(difference: {
  current: string;
  selected: string;
}): Promise<boolean> {
  return confirmAction({
    body: t('chrome.relinkDifferenceBody', difference),
    title: t('chrome.relinkDifferenceTitle'),
    confirmButtonText: t('chrome.relinkDifferenceOk'),
    cancelButtonText: t('chrome.relinkDifferenceCancel'),
  });
}
// Project open and import commands that require confirmation.
async function openProject(): Promise<void> {
  if (await confirmProjectReplacement()) {
    dialogs.calibration = false;
    await workspace.openProject();
  }
}
async function newProjectFromWos(): Promise<void> {
  if (await confirmProjectReplacement()) {
    dialogs.calibration = false;
    await workspace.newProjectFromWos();
  }
}
// Input routing: keyboard, controller and YuanCon reach commands through one context.
function keydown(event: KeyboardEvent): void {
  if (modalOpen.value) return;
  handleKeyDown(event, input.recording ? 'recording' : 'edit', {
    run: execute,
    holdWheel: wheel.holdFromKey,
  });
}
function inputContext(): InputContext {
  if (visibleDialog()) return 'dialog';
  if (modalOpen.value) return 'modal';
  if (wheel.state.value.open) return 'wheel';
  if (applicationMenu.value?.isActive()) return 'menu';
  if (editingControl(document.activeElement)) return 'text';
  return input.recording && canRecord(editor) ? 'recording' : 'edit';
}
function recordingActive(): boolean {
  return inputContext() === 'recording';
}
const STEPS: Partial<Record<WheelAction, 'up' | 'right' | 'down' | 'left'>> = {
  'step-up': 'up',
  'step-right': 'right',
  'step-down': 'down',
  'step-left': 'left',
};
function wheelAction(action: WheelAction, time: number): void {
  if (action === 'hold') wheel.holdFromController(time);
  else if (action === 'release') wheel.send({ type: 'release', time });
  else if (action === 'previous' || action === 'next') wheel.page(action === 'next' ? 1 : -1);
  else if (action === 'confirm' || action === 'cancel') wheel.send({ type: action });
  else {
    const direction = STEPS[action];
    if (direction) wheel.step(direction);
  }
}
const yuancon = useYuanconRecording({
  active: recordingActive,
  onCommand: (command, recordingInput) => {
    void execute(command, recordingInput);
  },
});
const bindingOverrides = useBindingOverrides(pinia);
useInputControls(({ events, pointing, time }) => {
  // While a controller binding is recorded, its next press is the new binding; Menu cancels.
  const capture = bindingOverrides.capture;
  if (capture?.device === 'gamepad') {
    const press = events.find((event) => event.phase === 'press');
    if (press) {
      if (!reservedControl(press.control))
        bindingOverrides.assign(capture.row, 'gamepad', press.control);
      bindingOverrides.capture = null;
    }
    return;
  }
  const context = inputContext();
  if (context === 'wheel') wheel.pointController(pointing);
  for (const action of routeGamepad(events, context, time)) {
    if (action.kind === 'dialog') navigateDialog(action.action);
    else if (action.kind === 'menu') applicationMenu.value?.navigate(action.action);
    else if (action.kind === 'wheel') wheelAction(action.action, time);
    else void execute(action.command, action.args);
  }
}, recordingActive);
function calibrate(): void {
  if (!editor.source) {
    editor.setStatus('calibrationNeedsSource', true);
    return;
  }
  playback.stop();
  dialogs.calibration = true;
}
function applyOffset(offset: number): void {
  if (!Number.isFinite(offset)) return;
  editor.tapOffsetMs = offset;
  editor.setStatus('tapOffsetApplied', { offset });
}
// Workspace close keeps its own lock across confirm, playback stop and full reset.
async function closeWorkspace(): Promise<void> {
  if (closing.value) return;
  closing.value = true;
  try {
    await ElMessageBox.confirm(t('chrome.closeConfirmBody'), t('chrome.closeConfirmTitle'), {
      confirmButtonText: t('chrome.closeOk'),
      cancelButtonText: t('chrome.closeCancel'),
      distinguishCancelAndClose: true,
      type: 'warning',
    });
    if (disposed) return;
    dialogs.calibration = false;
    playback.stop();
    await workspace.reset();
    bmhelper.reset();
    panelGeneration.value++;
  } catch (error: unknown) {
    if (error !== 'cancel' && error !== 'close') report(error);
  } finally {
    closing.value = false;
  }
}
// Dropped audio files become tracks; a dropped project replaces the current one after confirmation.
async function dropFiles(files: ChosenFile[]): Promise<void> {
  if (files.some((file) => /\.wosdx$/i.test(file.name)) && !(await confirmProjectReplacement()))
    return;
  dialogs.calibration = false;
  await workspace.openChosenFiles(files);
}
let stopDrops: (() => void) | undefined;
// Lifecycle.
onMounted(() => {
  stopAppearance = localization.syncAppearance(platform, report);
  stopDrops = platform.watchDrops({
    active: (value) => (dragActive.value = value),
    dropped: (files) => void dropFiles(files).catch(report),
  });
  window.addEventListener('keydown', keydown);
  void getBuildIdentity()
    .then((value) => {
      if (!disposed) identity.value = value;
    })
    .catch(report);
  void workspace.restoreSession().catch(report);
});
onUnmounted(() => {
  stopDrops?.();
  disposed = true;
  input.recording = false;
  window.removeEventListener('keydown', keydown);
  stopAppearance?.();
  playback.dispose();
  void workspace.dispose().catch(console.error);
});
</script>

<template>
  <ElConfigProvider
    :locale="elementLocale"
    size="small"
  >
    <main class="app-shell">
      <!-- menu -->
      <WindowTitlebar
        :before-close="beforeWindowClose"
        @error="report"
      >
        <ApplicationMenu
          ref="applicationMenu"
          :disabled="modalOpen"
          :desktop="platform.kind === 'tauri'"
          @command="execute"
        />
      </WindowTitlebar>
      <EditorToolbar />
      <div
        class="playback-strip"
        :inert="dialogs.calibration"
      >
        <PlaybackControls @command="execute" />
      </div>
      <!-- The transport is global. The current editor owns one audio lane. -->
      <section class="workspace">
        <div class="editor-column">
          <TimelineEditor
            class="timeline"
            :loading="loading"
          />
        </div>
        <WorkspacePanels :key="panelGeneration" />
      </section>
      <!-- status bar -->
      <StatusBar
        :identity="identity"
        @about="dialogs.about = true"
      />
      <!-- dialogs -->
      <CalibrationDialog
        v-model="dialogs.calibration"
        :audio-context="playback.getAudioContext()"
        :offset-ms="editor.tapOffsetMs"
        :bpm="editor.doc.bpm"
        @apply="applyOffset"
      />
      <HelpDialog v-model="dialogs.help" />
      <YuanconDialog
        v-model="dialogs.yuancon"
        :connection="yuancon"
      />
      <InputSettingsDialog v-model="dialogs.inputSettings" />
      <ExportDialog
        v-model="dialogs.export"
        @export="(jobs) => void exporter.exportTracks(jobs)"
      />
      <TroubleshootDialog
        v-model="dialogs.troubleshoot"
        :identity="identity"
      />
      <AboutDialog
        v-model="dialogs.about"
        :identity="identity"
      />
      <CommandWheel
        :wheel="wheel"
        :state="editor"
      />
      <!-- drop overlay -->
      <div
        v-if="dragActive"
        class="drop-overlay"
      >
        {{ t('chrome.dropFiles') }}
      </div>
    </main>
  </ElConfigProvider>
</template>

<style>
@import 'element-plus/dist/index.css';
@import 'element-plus/theme-chalk/dark/css-vars.css';
@import './styles.css';

/* App shell: full-height column that hosts menu, toolbar, workspace and status bar. */
.app-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}

/* Workspace split: editor column (playback strip + timeline) beside the side panel. */
.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px;
  padding: 4px;
  flex: 1;
  min-height: 0;
  background: var(--wos-workspace);
}
.editor-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  overflow: hidden;
  background: var(--el-bg-color);
}
.playback-strip {
  flex-shrink: 0;
  padding: 8px 14px;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--wos-chrome);
}
.timeline {
  flex: 1;
  min-height: 0;
}

/* Drop overlay shown while dragging files onto the window. */
.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  border: 3px dashed var(--el-color-primary);
  background: color-mix(in srgb, var(--el-bg-color) 88%, transparent);
  color: var(--el-color-primary);
  font-size: 22px;
  pointer-events: none;
}

/* Very narrow window: workspace stacks vertically; .side-panel is owned by WorkspacePanels.vue. */
@media (max-width: 680px) {
  .app-shell {
    height: auto;
    min-height: 100%;
  }
  .workspace {
    display: flex;
    flex-direction: column;
  }
  .editor-column {
    min-height: 360px;
  }
  .workspace > .side-panel {
    min-height: 250px;
    width: 100%;
  }
  .workspace > .side-panel.is-collapsed {
    min-height: 48px;
  }
}
</style>
