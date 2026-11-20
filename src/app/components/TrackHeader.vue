<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEditorStore } from '../../slicing/editor-store';
import AppIcon from '../../ui/AppIcon.vue';

const editor = useEditorStore();
const { t } = useI18n();
const sourceName = computed(() => editor.source?.name ?? t('chrome.emptyTitle'));
</script>

<template>
  <header class="track-header">
    <span class="track-number">01</span>
    <AppIcon name="wave" />
    <span
      class="track-name"
      :title="sourceName"
      >{{ sourceName }}</span
    >
    <span class="track-format">{{
      editor.source
        ? `${editor.source.sampleRate / 1000} kHz · ${editor.source.channels} ch`
        : 'WAV / OGG'
    }}</span>
  </header>
</template>

<style scoped>
.track-header {
  display: flex;
  align-items: center;
  gap: 9px;
  flex: none;
  height: 36px;
  padding: 0 12px 0 0;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--wos-panel-header);
  font-size: 12px;
}
.track-number {
  display: grid;
  place-items: center;
  align-self: stretch;
  width: 34px;
  border-left: 3px solid var(--el-color-primary);
  color: var(--el-color-primary);
  font:
    11px 'Consolas',
    monospace;
}
.track-header .app-icon {
  width: 16px;
  color: var(--el-text-color-secondary);
}
.track-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track-format {
  color: var(--el-text-color-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
