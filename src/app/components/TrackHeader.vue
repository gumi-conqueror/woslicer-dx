<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEditorStore } from '../../slicing/editor-store';
import AppIcon from '../../ui/AppIcon.vue';
import TrackOverview from '../../timeline/TrackOverview.vue';
import type { LoadingActivity } from '../../workspace/workspace';

const props = defineProps<{ viewportWidth: number; loading?: LoadingActivity | null }>();
const editor = useEditorStore();
const { t } = useI18n();
const sourceName = computed(
  () => props.loading?.name ?? editor.source?.name ?? t('chrome.emptyTitle'),
);
</script>

<template>
  <header class="track-header">
    <span class="track-number">01</span>
    <div class="track-body">
      <div class="track-info">
        <AppIcon name="wave" />
        <span
          class="track-name"
          :title="sourceName"
          >{{ sourceName }}</span
        >
        <span
          v-if="!loading"
          class="track-format"
          >{{
            editor.source
              ? `${editor.source.sampleRate / 1000} kHz · ${editor.source.channels} ch`
              : 'WAV / OGG'
          }}</span
        >
      </div>
      <TrackOverview
        :viewport-width="viewportWidth"
        :loading="loading"
      />
    </div>
  </header>
</template>

<style scoped>
.track-header {
  display: flex;
  flex: none;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--wos-panel-header);
  font-size: 12px;
}
.track-body {
  flex: 1;
  min-width: 0;
}
.track-info {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 28px;
  padding: 0 10px;
}
.track-number {
  display: grid;
  place-items: center;
  align-self: stretch;
  width: 34px;
  flex: none;
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
