<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { getDesktopWindow } from '../../platform/desktop-window';
import { useEditorStore } from '../../slicing/editor-store';
import AppIcon from '../../ui/AppIcon.vue';

const props = defineProps<{ beforeClose: () => Promise<boolean> }>();
const emit = defineEmits<{ error: [error: unknown] }>();
const { t } = useI18n();
const editor = useEditorStore();
const desktop = getDesktopWindow();
const maximized = shallowRef(false);
const ready = shallowRef(false);
// The project name; a project without any audio is still untitled.
const title = computed(() =>
  editor.document.tracks.some((track) => track.media) ? editor.document.name : t('window.untitled'),
);
const cleanups: (() => void)[] = [];
let disposed = false;
let closing = false;

async function run(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error: unknown) {
    emit('error', error);
  }
}
async function requestClose(): Promise<void> {
  if (!desktop || closing) return;
  closing = true;
  try {
    if (await props.beforeClose()) await desktop.destroy();
  } finally {
    closing = false;
  }
}
function drag(event: MouseEvent): void {
  if (!desktop || event.button !== 0) return;
  void run(() => (event.detail === 2 ? desktop.toggleMaximize() : desktop.startDragging()));
}
onMounted(() => {
  if (!desktop) return;
  void run(async () => {
    const updateMaximized = async () => {
      maximized.value = await desktop.isMaximized();
    };
    const listeners = await Promise.all([
      desktop.onResized(() => {
        void run(updateMaximized);
      }),
      desktop.onCloseRequested(() => {
        void run(requestClose);
      }),
    ]);
    if (disposed) {
      for (const cleanup of listeners) cleanup();
      return;
    }
    cleanups.push(...listeners);
    await updateMaximized();
    ready.value = true;
  });
});
onUnmounted(() => {
  disposed = true;
  for (const cleanup of cleanups) cleanup();
});
</script>

<template>
  <header class="window-titlebar">
    <div
      class="app-brand"
      @mousedown="drag"
    >
      <AppIcon name="wave" /><span>woslicer<span class="brand-dx">DX</span></span>
    </div>
    <slot />
    <div
      class="window-drag-region"
      @mousedown="drag"
    >
      <span
        class="document-title"
        :title="title"
        >{{ title }}</span
      >
      <span
        v-if="editor.isDirty"
        class="dirty-dot"
        role="img"
        :aria-label="t('chrome.projectUnsaved')"
        :title="t('chrome.projectUnsaved')"
      />
    </div>
    <div
      v-if="desktop"
      class="window-controls"
    >
      <button
        type="button"
        :disabled="!ready"
        :aria-label="t('window.minimize')"
        :title="t('window.minimize')"
        @click="run(desktop.minimize)"
      >
        <AppIcon name="minimize" />
      </button>
      <button
        type="button"
        :disabled="!ready"
        :aria-label="t(maximized ? 'window.restore' : 'window.maximize')"
        :title="t(maximized ? 'window.restore' : 'window.maximize')"
        @click="run(desktop.toggleMaximize)"
      >
        <AppIcon :name="maximized ? 'restore' : 'maximize'" />
      </button>
      <button
        type="button"
        class="window-close"
        :disabled="!ready"
        :aria-label="t('window.close')"
        :title="t('window.close')"
        @click="run(desktop.close)"
      >
        <AppIcon name="close" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.window-titlebar {
  display: flex;
  align-items: center;
  flex: none;
  height: 40px;
  min-width: 0;
  background: var(--wos-chrome);
  border-bottom: 1px solid var(--el-border-color);
  user-select: none;
}
.app-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: 100%;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.2px;
}
.app-brand > .app-icon {
  color: var(--el-color-primary);
}
.brand-dx {
  color: var(--el-color-primary);
  margin-left: 4px;
  font-size: 10px;
  letter-spacing: 1px;
}
.window-drag-region {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  align-self: stretch;
  flex: 1;
  min-width: 32px;
  padding: 0 12px;
}
.document-title {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  pointer-events: none;
}
.dirty-dot {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 50%;
  background: var(--el-color-primary);
  pointer-events: none;
}
.window-controls {
  display: flex;
  align-self: stretch;
}
.window-controls button {
  display: grid;
  place-items: center;
  width: 44px;
  padding: 0;
  border: 0;
  color: var(--el-text-color-primary);
  background: transparent;
}
.window-controls button:hover {
  background: var(--el-fill-color);
}
.window-controls .window-close:hover {
  background: #c94646;
  color: white;
}
.window-controls .app-icon {
  width: 15px;
  height: 15px;
}
@media (max-width: 680px) {
  .app-brand {
    padding: 0 8px;
  }
  .app-brand > span {
    display: none;
  }
}
</style>
