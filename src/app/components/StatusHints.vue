<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { commandLabel } from '../commands';
import { HINT_AREAS, isHintArea, type HintArea, type MouseHint } from '../hint-areas';
import { chordKeys, keyboardChords } from '../../input/bindings';
import { useInputState } from '../../input/state';
import GamepadHints from '../../input/GamepadHints.vue';
import KeyCaps from '../../input/KeyCaps.vue';
import MouseIcon from '../../ui/MouseIcon.vue';

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
/** Each hint: held keys, an optional mouse gesture, and the action. */
const items = computed(() => {
  if (!area.value) return [];
  const { mouse, commands } = HINT_AREAS[area.value];
  return [
    ...mouse.map((hint: MouseHint) => ({
      keys: hint.keys ?? [],
      mouse: hint.mouse,
      label: t(hint.label),
    })),
    ...commands.flatMap((command) => {
      const chord = keyboardChords(command)[0];
      return chord
        ? [{ keys: chordKeys(chord), mouse: undefined, label: t(commandLabel(command)) }]
        : [];
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
        v-for="(item, index) in items"
        :key="index"
        class="hint"
        ><KeyCaps
          v-if="item.keys.length"
          :keys="item.keys"
        /><MouseIcon
          v-if="item.mouse"
          v-bind="item.mouse"
        />{{ item.label }}</span
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
.area-hints .hint {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  vertical-align: middle;
}
.area-hints .hint + .hint {
  margin-left: 14px;
}
</style>
