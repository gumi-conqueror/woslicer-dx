<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEditorStore } from '../../slicing/editor-store';
import type { LoadingActivity } from '../../workspace/workspace';
import AppIcon from '../../ui/AppIcon.vue';
import TrackOverview from '../../timeline/TrackOverview.vue';

const props = defineProps<{
  trackId: string;
  index: number;
  viewportWidth: number;
  loading?: LoadingActivity | null;
}>();
const editor = useEditorStore();
const { t } = useI18n();
const track = computed(() => editor.document.tracks.find((item) => item.trackId === props.trackId));
const current = computed(() => editor.track.trackId === props.trackId);
const session = computed(() => editor.sessions.get(props.trackId));
// Loading without a target track belongs to the current track.
const loading = computed(() =>
  props.loading && (props.loading.trackId ?? editor.track.trackId) === props.trackId
    ? props.loading
    : null,
);
const name = computed(
  () => loading.value?.name ?? (track.value?.media ? track.value.name : t('chrome.emptyTitle')),
);
const renaming = ref(false);
const draft = ref('');
const input = useTemplateRef<HTMLInputElement>('input');
async function rename(): Promise<void> {
  if (!track.value?.media) return;
  draft.value = track.value.name;
  renaming.value = true;
  await nextTick();
  input.value?.select();
}
function commit(): void {
  if (!renaming.value) return;
  renaming.value = false;
  editor.renameTrack(props.trackId, draft.value);
}
</script>

<template>
  <header
    class="track-header"
    :class="{ current }"
    :aria-current="current ? 'true' : undefined"
    @pointerdown="editor.selectTrack(trackId)"
  >
    <span class="track-number">{{ String(index + 1).padStart(2, '0') }}</span>
    <div class="track-body">
      <div class="track-info">
        <AppIcon name="wave" />
        <input
          v-if="renaming"
          ref="input"
          v-model="draft"
          class="track-rename"
          :aria-label="t('chrome.trackName')"
          maxlength="512"
          @keydown.enter.prevent="commit"
          @keydown.esc.prevent="renaming = false"
          @blur="commit"
        />
        <span
          v-else
          class="track-name"
          :title="t('chrome.renameTrack')"
          @dblclick="rename"
          >{{ name }}</span
        >
        <span class="track-mix">
          <button
            type="button"
            class="track-toggle"
            :aria-pressed="track?.muted ?? false"
            :aria-label="t('chrome.muteTrack')"
            :title="t('chrome.muteTrack')"
            @pointerdown.stop
            @click="editor.setTrackMix(trackId, { muted: !track?.muted })"
          >
            M
          </button>
          <button
            type="button"
            class="track-toggle"
            :aria-pressed="track?.solo ?? false"
            :aria-label="t('chrome.soloTrack')"
            :title="t('chrome.soloTrack')"
            @pointerdown.stop
            @click="editor.setTrackMix(trackId, { solo: !track?.solo })"
          >
            S
          </button>
        </span>
        <span
          v-if="!loading && session?.source"
          class="track-format"
          >{{ `${session.source.sampleRate / 1000} kHz · ${session.source.channels} ch` }}</span
        >
      </div>
      <TrackOverview
        :track-id="trackId"
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
.track-header:not(.current) {
  cursor: pointer;
  opacity: 0.8;
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
  border-left: 3px solid transparent;
  color: var(--el-text-color-secondary);
  font:
    11px 'Consolas',
    monospace;
}
.current .track-number {
  border-left-color: var(--el-color-primary);
  color: var(--el-color-primary);
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
.track-rename {
  flex: 1;
  min-width: 0;
  height: 22px;
  padding: 0 6px;
  border: 1px solid var(--el-color-primary);
  border-radius: 3px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-primary);
}
.track-mix {
  display: inline-flex;
  gap: 2px;
}
.track-toggle {
  width: 20px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--el-border-color);
  border-radius: 3px;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
  font:
    600 10px 'Consolas',
    monospace;
}
.track-toggle[aria-pressed='true'] {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary);
  color: var(--el-bg-color);
}
.track-format {
  color: var(--el-text-color-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
