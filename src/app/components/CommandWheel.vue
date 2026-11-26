<script setup lang="ts">
import { computed } from 'vue';
import { useWindowSize } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { commandEnabled, commandLabel, type CommandState } from '../commands';
import { WHEEL_SLOTS } from '../../input/wheel';
import {
  WHEEL_SLOT_RADIUS_SHARE,
  WHEEL_VIEWPORT_SHARE,
  type CommandWheel,
} from '../../input/use-wheel';
const props = defineProps<{ wheel: CommandWheel; state: CommandState }>();
const { t } = useI18n();
const viewport = useWindowSize();
const size = computed(
  () => Math.min(viewport.width.value, viewport.height.value) * WHEEL_VIEWPORT_SHARE,
);
const open = computed(() => (props.wheel.state.value.open ? props.wheel.state.value : null));
const position = computed(() => {
  const center = props.wheel.center.value;
  const half = size.value / 2;
  const box = { width: `${size.value}px`, height: `${size.value}px` };
  if (!center) return { ...box, left: `calc(50% - ${half}px)`, top: `calc(50% - ${half}px)` };
  // Keep the whole wheel inside the window.
  const x = Math.min(Math.max(center.x, half), viewport.width.value - half);
  const y = Math.min(Math.max(center.y, half), viewport.height.value - half);
  return { ...box, left: `${x - half}px`, top: `${y - half}px` };
});
const slots = computed(() => {
  const page = props.wheel.wheels.value[props.wheel.openPage.value] ?? [];
  return Array.from({ length: WHEEL_SLOTS }, (_, slot) => {
    const command = page[slot] ?? null;
    const angle = (slot * 2 * Math.PI) / WHEEL_SLOTS;
    return {
      slot,
      command,
      enabled: command !== null && commandEnabled(command, props.state),
      x: size.value / 2 + Math.sin(angle) * size.value * WHEEL_SLOT_RADIUS_SHARE,
      y: size.value / 2 - Math.cos(angle) * size.value * WHEEL_SLOT_RADIUS_SHARE,
    };
  });
});
</script>
<template>
  <div
    v-if="open"
    class="command-wheel"
    role="menu"
    :aria-label="t('input.wheel')"
    :style="position"
  >
    <div class="wheel-ring" />
    <button
      v-for="item in slots"
      :key="item.slot"
      type="button"
      role="menuitem"
      tabindex="-1"
      class="wheel-slot"
      :class="{ selected: open.selected === item.slot, empty: !item.command }"
      :data-command="item.command ?? undefined"
      :disabled="!item.enabled"
      :style="{ left: `${item.x}px`, top: `${item.y}px` }"
      @click="wheel.send({ type: 'choose', slot: item.slot })"
    >
      {{ item.command ? t(commandLabel(item.command)) : '' }}
    </button>
    <div
      class="wheel-center"
      aria-hidden="true"
    >
      <span v-if="wheel.wheels.value.length > 1"
        >{{ wheel.openPage.value + 1 }} / {{ wheel.wheels.value.length }}</span
      >
    </div>
  </div>
</template>
<style scoped>
.command-wheel {
  position: fixed;
  z-index: 3000;
  pointer-events: none;
}
.wheel-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid var(--el-border-color);
  background: color-mix(in srgb, var(--el-bg-color-overlay) 88%, transparent);
  box-shadow: var(--el-box-shadow);
}
.wheel-slot {
  position: absolute;
  width: clamp(108px, 20%, 180px);
  min-height: 44px;
  padding: 6px 8px;
  transform: translate(-50%, -50%);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  background: var(--el-bg-color);
  color: var(--el-text-color-regular);
  font: inherit;
  font-size: 13px;
  line-height: 1.3;
  overflow-wrap: anywhere;
  pointer-events: auto;
  cursor: pointer;
}
.wheel-slot.empty {
  visibility: hidden;
}
.wheel-slot:disabled {
  color: var(--el-text-color-disabled);
  cursor: default;
}
.wheel-slot.selected {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
.wheel-slot.selected:disabled {
  color: var(--el-text-color-disabled);
}
.wheel-center {
  position: absolute;
  left: 50%;
  top: 50%;
  display: grid;
  place-items: center;
  width: 18%;
  height: 18%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 1px dashed var(--el-border-color);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
</style>
