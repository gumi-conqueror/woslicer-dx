<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElTabPane, ElTabs } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { useWorkspace } from '../../workspace/workspace';
import MarkerList from '../../slicing/MarkerList.vue';
import DetectionPanel from '../../detection/DetectionPanel.vue';
import OutputPanel from '../../export/OutputPanel.vue';
import BMHelperPanel from '../../bmhelper/BMHelperPanel.vue';
import SourceInfo from './SourceInfo.vue';
import AppIcon from '../../ui/AppIcon.vue';
const workspace = useWorkspace();
const { t } = useI18n();
// Local tab state; inactive panes are unmounted through their v-if guards.
const activeTab = ref('source');
const collapsed = ref(false);
const panelTitle = computed(
  () =>
    ({
      source: 'chrome.tabSource',
      cuts: 'chrome.tabCuts',
      detect: 'chrome.bandDetect',
      output: 'chrome.tabOutput',
      bmhelper: 'chrome.tabBmhelper',
    })[activeTab.value] ?? 'chrome.tabSource',
);
function applyBmhelperCuts(payload: { ticks: number[] }): void {
  workspace.actions.applyBmhelperCuts(payload.ticks);
}
function activateTab(event: KeyboardEvent): void {
  if (
    (event.key === 'Enter' || event.key === ' ') &&
    event.target instanceof HTMLElement &&
    event.target.getAttribute('role') === 'tab'
  ) {
    event.preventDefault();
    collapsed.value = false;
  }
}
</script>
<template>
  <!-- side panel tabs: source info, cuts, detection, output, bmhelper -->
  <aside
    class="side-panel"
    :class="{ 'is-collapsed': collapsed }"
  >
    <h2
      v-if="!collapsed"
      class="panel-title"
    >
      {{ t(panelTitle) }}
    </h2>
    <button
      v-if="!collapsed"
      class="panel-collapse"
      type="button"
      :aria-label="t('window.collapsePanel')"
      :title="t('window.collapsePanel')"
      @click="collapsed = true"
    >
      <AppIcon name="collapse" />
    </button>
    <ElTabs
      v-model="activeTab"
      tab-position="right"
      @tab-click="collapsed = false"
      @tab-change="collapsed = false"
      @keydown="activateTab"
    >
      <ElTabPane
        name="source"
        :label="t('chrome.tabSource')"
        ><template #label
          ><span
            class="panel-tab"
            :title="t('chrome.tabSource')"
            ><AppIcon name="wave" /><span class="panel-tab-label">{{
              t('chrome.tabSource')
            }}</span></span
          ></template
        ><SourceInfo
      /></ElTabPane>
      <ElTabPane
        name="cuts"
        class="cuts-pane"
        :label="t('chrome.tabCuts')"
        ><template #label
          ><span
            class="panel-tab"
            :title="t('chrome.tabCuts')"
            ><AppIcon name="cuts" /><span class="panel-tab-label">{{
              t('chrome.tabCuts')
            }}</span></span
          ></template
        ><MarkerList v-if="activeTab === 'cuts'"
      /></ElTabPane>
      <ElTabPane
        name="detect"
        :label="t('chrome.bandDetect')"
        ><template #label
          ><span
            class="panel-tab"
            :title="t('chrome.bandDetect')"
            ><AppIcon name="detect" /><span class="panel-tab-label">{{
              t('chrome.bandDetect')
            }}</span></span
          ></template
        ><DetectionPanel v-if="activeTab === 'detect'"
      /></ElTabPane>
      <ElTabPane
        name="output"
        :label="t('chrome.tabOutput')"
        ><template #label
          ><span
            class="panel-tab"
            :title="t('chrome.tabOutput')"
            ><AppIcon name="output" /><span class="panel-tab-label">{{
              t('chrome.tabOutput')
            }}</span></span
          ></template
        ><OutputPanel v-if="activeTab === 'output'"
      /></ElTabPane>
      <ElTabPane
        name="bmhelper"
        :label="t('chrome.tabBmhelper')"
        ><template #label
          ><span
            class="panel-tab"
            :title="t('chrome.tabBmhelper')"
            ><AppIcon name="notes" /><span class="panel-tab-label">{{
              t('chrome.tabBmhelper')
            }}</span></span
          ></template
        ><BMHelperPanel
          v-if="activeTab === 'bmhelper'"
          @apply-cuts="applyBmhelperCuts"
      /></ElTabPane>
    </ElTabs>
  </aside>
</template>
<style scoped>
/* Panel frame: the pane fills the workspace column and scrolls internally. */
.side-panel {
  position: relative;
  width: clamp(340px, 30vw, 440px);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: var(--el-bg-color);
}
.side-panel.is-collapsed {
  width: 48px;
}
.panel-title {
  position: absolute;
  top: 0;
  left: 0;
  right: 46px;
  height: 36px;
  margin: 0;
  padding: 0 36px 0 12px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--wos-panel-header);
  font-size: 12px;
  font-weight: 600;
}
.panel-collapse {
  position: absolute;
  top: 6px;
  right: 55px;
  z-index: 2;
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
.panel-collapse:hover {
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
}
.side-panel > .el-tabs {
  height: 100%;
}
/* Tab chrome: content padding, header margin and item sizing. */
:deep(.el-tabs__content) {
  min-width: 0;
  padding: 38px 12px 12px;
  overflow: auto;
}
:deep(.cuts-pane) {
  height: 100%;
  min-height: 0;
}
.is-collapsed :deep(.el-tabs__content) {
  display: none;
}
:deep(.el-tabs__header) {
  margin: 0;
  width: 46px;
  flex-shrink: 0;
  background: var(--wos-panel-header);
}
:deep(.el-tabs__item) {
  width: 46px;
  height: 48px;
  padding: 0;
  justify-content: center;
  color: var(--el-text-color-secondary);
}
:deep(.el-tabs__item.is-active) {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.panel-tab {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
}
.panel-tab-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (max-width: 900px) {
  .side-panel {
    width: 310px;
  }
}
</style>
