<script setup lang="ts">
import { computed } from 'vue';
import { ElButton } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { MEASURE_TICKS } from '../../core/timebase';
import type { BuildIdentity } from '../../platform/contracts';
import { useEditorStore } from '../../slicing/editor-store';
import { useInputState } from '../../input/state';
import AppIcon from '../../ui/AppIcon.vue';
import YuanconIcon from '../../ui/YuanconIcon.vue';
import StatusHints from './StatusHints.vue';
const input = useInputState();
defineProps<{ identity: BuildIdentity | null }>();
const emit = defineEmits<{ about: [] }>();
const editor = useEditorStore();
const { t } = useI18n();
// Status segments joined into one live-region message.
const status = computed(() =>
  editor.status.segments
    .map((segment) => t(`status.${segment.key}`, segment.params ?? {}))
    .join(' · '),
);
</script>
<template>
  <footer
    class="statusbar"
    :class="{ 'status-error': editor.isError }"
  >
    <!-- status message: polite live region -->
    <span
      class="status-message"
      role="status"
      aria-live="polite"
      :title="status"
      >{{ status }}</span
    >
    <StatusHints />
    <!-- cursor readout and marker count -->
    <span class="status-cursor">{{
      t('chrome.readoutTick', {
        measure: Math.floor(editor.cursorTick / MEASURE_TICKS) + 1,
        tick: editor.cursorTick,
      })
    }}</span>
    <span class="status-markers">{{ t('chrome.tabCuts') }}: {{ editor.ticks.length }}</span>
    <!-- about entry, shown only with build identity -->
    <span
      class="input-device"
      :data-device="input.device"
      role="img"
      :aria-label="t(`input.${input.device}`)"
      :title="t(`input.${input.device}`)"
      ><YuanconIcon v-if="input.device === 'yuancon'" /><AppIcon
        v-else
        :name="input.device"
    /></span>
    <ElButton
      v-if="identity"
      link
      size="small"
      :title="t('menu.about')"
      @click="emit('about')"
      >v{{ identity.version }}{{ identity.dirty ? '*' : '' }}</ElButton
    >
  </footer>
</template>
<style scoped>
/* Status bar strip: one row. The input hints shrink first, then the message wraps. */
.statusbar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px 16px;
  min-height: 28px;
  padding: 5px 10px;
  border-top: 1px solid var(--el-border-color);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  background: var(--wos-chrome);
  font-variant-numeric: tabular-nums;
}

/* Status message fills the remaining width; error state recolors it. */
.status-message {
  flex: 1 1 240px;
  min-width: 160px;
  overflow-wrap: anywhere;
}
.statusbar > :not(.status-message, .status-hints) {
  flex: none;
  white-space: nowrap;
}
.status-error .status-message {
  color: var(--el-color-danger);
}
.input-device {
  display: inline-flex;
  align-items: center;
}
</style>
