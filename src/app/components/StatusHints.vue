<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { commandLabel } from '../commands';
import { HINT_AREAS, isHintArea, type HintArea } from '../hint-areas';
import { shortcutLabel } from '../../input/bindings';
import { useInputState } from '../../input/state';
import GamepadHints from './GamepadHints.vue';

/**
 * Input hints in the status bar. With a controller, the common controller
 * buttons; otherwise the mouse and keyboard actions of the area under the
 * pointer. The status bar shortens these hints first when the window is narrow.
 */
const input = useInputState();
const { t } = useI18n();
const area = shallowRef<HintArea | null>(null);
function hover(event: PointerEvent): void {
  if (!(event.target instanceof Element)) return;
  // Moving to the status bar to read the hints keeps them.
  if (event.target.closest('.statusbar')) return;
  const name = event.target.closest('[data-hint-area]')?.getAttribute('data-hint-area');
  area.value = isHintArea(name) ? name : null;
}
function leave(): void {
  area.value = null;
}
onMounted(() => {
  window.addEventListener('pointerover', hover);
  document.documentElement.addEventListener('pointerleave', leave);
});
onBeforeUnmount(() => {
  window.removeEventListener('pointerover', hover);
  document.documentElement.removeEventListener('pointerleave', leave);
});
const items = computed(() => {
  if (!area.value) return [];
  const { mouse, commands } = HINT_AREAS[area.value];
  return [
    ...mouse.map((key) => t(key)),
    ...commands.flatMap((command) => {
      const keys = shortcutLabel(command);
      return keys ? [`${keys}: ${t(commandLabel(command))}`] : [];
    }),
  ];
});
</script>
<template>
  <span class="status-hints">
    <GamepadHints v-if="input.device === 'gamepad'" />
    <span
      v-else-if="items.length"
      class="area-hints"
      role="note"
      :aria-label="t('hints.area')"
    >
      <span
        v-for="item in items"
        :key="item"
        class="hint"
        >{{ item }}</span
      >
    </span>
  </span>
</template>
<style scoped>
/* One line that the status bar cuts off at its end when space runs out. */
.status-hints {
  flex: 0 1000 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11px;
}
.area-hints .hint + .hint {
  margin-left: 14px;
}
</style>
