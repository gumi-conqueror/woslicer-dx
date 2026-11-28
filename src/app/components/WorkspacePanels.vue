<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useEditorActions } from '../../slicing/editor-actions';
import MarkerList from '../../slicing/MarkerList.vue';
import DetectionPanel from '../../detection/DetectionPanel.vue';
import OutputPanel from '../../export/OutputPanel.vue';
import BMHelperPanel from '../../bmhelper/BMHelperPanel.vue';
import SourceInfo from './SourceInfo.vue';
import AppIcon from '../../ui/AppIcon.vue';

const actions = useEditorActions();
const { t } = useI18n();
const panels = [
  { id: 'source', title: 'chrome.tabSource', icon: 'wave' },
  { id: 'cuts', title: 'chrome.tabCuts', icon: 'cuts' },
  { id: 'detect', title: 'chrome.bandDetect', icon: 'detect' },
  { id: 'output', title: 'chrome.tabOutput', icon: 'output' },
  { id: 'bmhelper', title: 'chrome.tabBmhelper', icon: 'notes' },
] as const;
type PanelId = (typeof panels)[number]['id'];
// Oldest modules are on the left; new modules open beside the rail on the right.
// Keep visited modules mounted so reopening preserves unfinished form input.
const enabled = ref<PanelId[]>(['source']);
const visited = ref<PanelId[]>(['source']);
const dock = useTemplateRef<HTMLElement>('dock');
const container = computed(() => dock.value?.parentElement);
const renderedPanels = computed(() =>
  panels
    .filter((panel) => visited.value.includes(panel.id))
    .sort((a, b) => enabled.value.indexOf(a.id) - enabled.value.indexOf(b.id)),
);
// Use the workspace's full width, not the dock's current width. CSS owns module
// sizing; read its resolved width so the fit calculation follows the layout.
function fitPanels(): void {
  const host = container.value;
  const root = dock.value;
  const module = Array.from(root?.querySelectorAll<HTMLElement>('.workspace-module') ?? []).find(
    (element) => element.getBoundingClientRect().width > 0,
  );
  const rail = root?.querySelector<HTMLElement>('.panel-switches');
  if (!host || !root || !module || !rail || host.clientWidth <= 0) return;
  const hostStyle = getComputedStyle(host);
  const dockStyle = getComputedStyle(root);
  const moduleWidth = module.getBoundingClientRect().width;
  const gap = hostStyle.display === 'grid' ? parseFloat(hostStyle.columnGap) : 0;
  const available =
    host.clientWidth -
    parseFloat(hostStyle.paddingLeft) -
    parseFloat(hostStyle.paddingRight) -
    parseFloat(dockStyle.borderLeftWidth) -
    parseFloat(dockStyle.borderRightWidth) -
    rail.getBoundingClientRect().width -
    gap;
  const capacity = Math.max(1, Math.floor(available / moduleWidth));
  if (enabled.value.length > capacity) enabled.value = enabled.value.slice(-capacity);
}
useResizeObserver(container, fitPanels);
onMounted(fitPanels);
function toggle(id: PanelId): void {
  if (enabled.value.includes(id)) {
    close(id);
    return;
  }
  enabled.value.push(id);
  if (!visited.value.includes(id)) visited.value.push(id);
  fitPanels();
}
function close(id: PanelId): void {
  enabled.value = enabled.value.filter((panel) => panel !== id);
}
</script>

<template>
  <aside
    ref="dock"
    class="side-panel"
    :class="{ 'is-collapsed': !enabled.length }"
  >
    <div class="panel-modules">
      <section
        v-for="panel in renderedPanels"
        v-show="enabled.includes(panel.id)"
        :id="`panel-${panel.id}`"
        :key="panel.id"
        class="workspace-module"
        :aria-labelledby="`panel-title-${panel.id}`"
      >
        <header class="panel-heading">
          <h2
            :id="`panel-title-${panel.id}`"
            class="panel-title"
          >
            {{ t(panel.title) }}
          </h2>
          <button
            class="panel-close"
            type="button"
            :aria-label="`${t('chrome.close')}: ${t(panel.title)}`"
            :title="t('chrome.close')"
            @click="close(panel.id)"
          >
            <AppIcon name="close" />
          </button>
        </header>
        <div
          class="panel-content"
          :class="{ 'cuts-pane': panel.id === 'cuts' }"
        >
          <SourceInfo v-if="panel.id === 'source'" />
          <MarkerList v-else-if="panel.id === 'cuts'" />
          <DetectionPanel v-else-if="panel.id === 'detect'" />
          <OutputPanel v-else-if="panel.id === 'output'" />
          <BMHelperPanel
            v-else
            @apply-cuts="actions.applyBmhelperCuts($event.ticks)"
          />
        </div>
      </section>
    </div>
    <div class="panel-switches">
      <button
        v-for="panel in panels"
        :key="panel.id"
        class="panel-switch"
        type="button"
        :aria-label="t(panel.title)"
        :title="t(panel.title)"
        :aria-pressed="enabled.includes(panel.id)"
        :aria-controls="visited.includes(panel.id) ? `panel-${panel.id}` : undefined"
        @click="toggle(panel.id)"
      >
        <AppIcon :name="panel.icon" />
      </button>
    </div>
  </aside>
</template>

<style scoped>
.side-panel {
  display: flex;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  overflow: hidden;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: var(--el-bg-color);
}
.panel-modules {
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.workspace-module {
  display: flex;
  flex-direction: column;
  flex: 0 0 clamp(280px, 24vw, 360px);
  width: clamp(280px, 24vw, 360px);
  min-height: 0;
  border-right: 1px solid var(--el-border-color);
}
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 36px;
  gap: 8px;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--wos-panel-header);
}
.panel-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
}
.panel-close {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  color: var(--el-text-color-secondary);
  background: transparent;
}
.panel-close:hover {
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
}
.panel-content {
  flex: 1;
  min-height: 0;
  padding: 12px;
  overflow: auto;
}
.cuts-pane {
  overflow: hidden;
}
.panel-switches {
  flex: 0 0 46px;
  width: 46px;
  background: var(--wos-panel-header);
}
.panel-switch {
  display: grid;
  place-items: center;
  width: 46px;
  height: 48px;
  padding: 0;
  border: 0;
  border-right: 3px solid transparent;
  color: var(--el-text-color-secondary);
  background: transparent;
}
.panel-switch:hover {
  background: var(--el-fill-color);
}
.panel-switch[aria-pressed='true'] {
  border-right-color: var(--el-color-primary);
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
@media (max-width: 680px) {
  .side-panel {
    max-width: 100%;
    max-height: 480px;
  }
  .panel-modules {
    margin-left: auto;
  }
}
</style>
