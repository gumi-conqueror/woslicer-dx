<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { errorMessage } from '../core/messages';
import { ElConfigProvider, ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { pinia, localization } from './runtime';
import { createCommands } from './commands';
import ApplicationMenu from './components/ApplicationMenu.vue';
import WindowTitlebar from './components/WindowTitlebar.vue';
import { getPlatform, getBuildIdentity } from '../platform';
import type { BuildIdentity } from '../platform/contracts';
import { useEditorStore } from '../slicing/editor-store';
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
import { editingControl, visibleDialog } from '../input/context';
import { canRecord } from './commands';
import { handleKeyDown } from '../input/keyboard';
import { routeGamepad, type InputContext, type WheelAction } from '../input/router';
import { useCommandWheel } from '../input/use-wheel';
import CommandWheel from './components/CommandWheel.vue';
import GamepadHints from './components/GamepadHints.vue';
import { openDataFolder } from '../platform/app-data';
import { useInputState } from '../input/state';
import YuanconDialog from './components/YuanconDialog.vue';
import WheelSettingsDialog from './components/WheelSettingsDialog.vue';
import { useYuanconRecording } from '../input/yuancon/use-recording';
import { audioFileFormat } from '../core/audio-formats';

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
const playback = createPlayback(editor);
provideWorkspace(workspace);
providePlayback(playback);
// Localized app state.
const { t } = useI18n({ useScope: 'global' });
const { elementLocale } = localization;
const calibrating = ref(false);
const aboutOpen = ref(false);
const helpOpen = ref(false);
const troubleshootOpen = ref(false);
const yuanconOpen = ref(false);
const wheelSettingsOpen = ref(false);
const applicationMenu = useTemplateRef<InstanceType<typeof ApplicationMenu>>('applicationMenu');
const closing = ref(false);
// Every app-owned dialog and the close lock: while one is open, app input does nothing.
const modalOpen = computed(
  () =>
    calibrating.value ||
    aboutOpen.value ||
    helpOpen.value ||
    troubleshootOpen.value ||
    yuanconOpen.value ||
    wheelSettingsOpen.value ||
    closing.value,
);
const dragActive = ref(false);
const panelGeneration = ref(0);
const identity = shallowRef<BuildIdentity | null>(null);
// Command dispatch for menu and toolbar events.
const commands = createCommands({
  editor,
  workspace,
  playback,
  hosts: {
    close: closeWorkspace,
    openProject,
    newProjectFromWos,
    calibrate,
    help: () => {
      helpOpen.value = true;
    },
    troubleshoot: () => {
      troubleshootOpen.value = true;
    },
    openDataFolder,
    about: () => {
      aboutOpen.value = true;
    },
    toggleRecording: () => {
      input.recording = !input.recording;
    },
    connectYuancon: () => {
      yuanconOpen.value = true;
    },
    wheelSettings: () => {
      wheelSettingsOpen.value = true;
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
    calibrating.value = false;
    await workspace.openProject();
  }
}
async function newProjectFromWos(): Promise<void> {
  if (await confirmProjectReplacement()) {
    calibrating.value = false;
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
function wheelAction(action: WheelAction, time: number): void {
  if (action === 'hold') wheel.holdFromController(time);
  else if (action === 'release') wheel.send({ type: 'release', time });
  else if (action === 'previous' || action === 'next') wheel.page(action === 'next' ? 1 : -1);
  else wheel.send({ type: action });
}
const yuancon = useYuanconRecording({
  active: recordingActive,
  onCommand: (command, recordingInput) => {
    void execute(command, recordingInput);
  },
});
useInputControls(({ events, pointing, time }) => {
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
  calibrating.value = true;
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
    calibrating.value = false;
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
// Drag and drop of project or audio files.
async function drop(event: DragEvent): Promise<void> {
  event.preventDefault();
  dragActive.value = false;
  const file = event.dataTransfer?.files[0];
  if (file && (audioFileFormat(file.name) || /\.wosdx$/i.test(file.name))) {
    if (/\.wosdx$/i.test(file.name) && !(await confirmProjectReplacement())) return;
    calibrating.value = false;
    await workspace.openDroppedFile(file);
  }
}
// Lifecycle.
onMounted(() => {
  stopAppearance = localization.syncAppearance(platform, report);
  window.addEventListener('keydown', keydown);
  void getBuildIdentity()
    .then((value) => {
      if (!disposed) identity.value = value;
    })
    .catch(report);
  void workspace.restoreSession().catch(report);
});
onUnmounted(() => {
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
    <main
      class="app-shell"
      @dragenter.prevent="dragActive = true"
      @dragover.prevent
      @dragleave.self="dragActive = false"
      @drop="drop"
    >
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
        :inert="calibrating"
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
      <GamepadHints v-if="input.device === 'gamepad'" />
      <!-- status bar -->
      <StatusBar
        :identity="identity"
        @about="aboutOpen = true"
      />
      <!-- dialogs -->
      <CalibrationDialog
        v-model="calibrating"
        :audio-context="playback.getAudioContext()"
        :offset-ms="editor.tapOffsetMs"
        :bpm="editor.doc.bpm"
        @apply="applyOffset"
      />
      <HelpDialog v-model="helpOpen" />
      <YuanconDialog
        v-model="yuanconOpen"
        :connection="yuancon"
      />
      <WheelSettingsDialog v-model="wheelSettingsOpen" />
      <TroubleshootDialog
        v-model="troubleshootOpen"
        :identity="identity"
      />
      <AboutDialog
        v-model="aboutOpen"
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
        {{ t('chrome.emptySub') }}
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
