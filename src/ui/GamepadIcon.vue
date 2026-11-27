<script setup lang="ts">
import { computed } from 'vue';
import { GAMEPAD_CONTROLS, type GamepadControl } from '../input/gamepad';
const props = defineProps<{ control: GamepadControl }>();
const label = computed(() => GAMEPAD_CONTROLS.find((item) => item.id === props.control)?.label);
const arrows: Readonly<Record<string, string>> = {
  up: 'm12 7-3 4h6Z',
  down: 'm12 17-3-4h6Z',
  left: 'm7 12 4-3v6Z',
  right: 'm17 12-4-3v6Z',
};
/** The direction of a D-pad or stick control, if it has one. */
const direction = computed(
  () => props.control.match(/^(?:dpad|ls|rs)-(up|down|left|right)(?:-hard)?$/)?.[1],
);
/** A hard stick push draws a solid ring. */
const hard = computed(() => props.control.endsWith('-hard'));
const stick = computed(() => props.control.match(/^(ls|rs)(?:-|$)/)?.[1]?.toUpperCase());
</script>
<template>
  <svg
    class="gamepad-icon"
    :class="control"
    viewBox="0 0 24 24"
    role="img"
    :aria-label="label"
  >
    <template v-if="control === 'ls-clockwise' || control === 'ls-counterclockwise'">
      <path
        :d="
          control === 'ls-clockwise'
            ? 'M20 10a8 8 0 1 0-2 9m3-14v6h-6'
            : 'M4 10a8 8 0 1 1 2 9M3 5v6h6'
        "
        fill="none"
        stroke="currentColor"
      />
      <text
        x="12"
        y="16"
        text-anchor="middle"
        font-size="9"
        fill="currentColor"
      >
        LS
      </text>
    </template>
    <template v-else-if="control.startsWith('dpad-') && direction">
      <path
        d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5Z"
        fill="none"
        stroke="currentColor"
      />
      <path
        :d="arrows[direction]"
        fill="currentColor"
      />
    </template>
    <template v-else-if="stick">
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        :stroke-dasharray="direction ? undefined : '2 2'"
        :stroke-width="hard ? 2.5 : 1"
      />
      <path
        v-if="direction"
        :d="arrows[direction]"
        transform="translate(12 12) scale(1.35) translate(-12 -12)"
        fill="currentColor"
        opacity="0.45"
      />
      <text
        x="12"
        y="15.5"
        text-anchor="middle"
        font-size="9"
        font-weight="600"
        fill="currentColor"
      >
        {{ stick }}
      </text>
    </template>
    <template v-else-if="control === 'menu' || control === 'view'">
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
      />
      <path
        :d="control === 'menu' ? 'M7 8h10M7 12h10M7 16h10' : 'M6 7h8v7H6ZM10 10h8v7h-8'"
        fill="none"
        stroke="currentColor"
      />
    </template>
    <template v-else>
      <rect
        v-if="control.length > 1"
        x="1"
        y="4"
        width="22"
        height="16"
        rx="4"
        fill="none"
        stroke="currentColor"
      />
      <circle
        v-else
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      />
      <text
        x="12"
        y="16"
        text-anchor="middle"
        fill="currentColor"
        :font-size="control.length > 1 ? 10 : 13"
        font-weight="600"
      >
        {{ label }}
      </text>
    </template>
  </svg>
</template>
<style scoped>
.gamepad-icon {
  width: 23px;
  height: 23px;
  flex: none;
  vertical-align: middle;
}
.a {
  color: var(--el-color-success);
}
.b {
  color: var(--el-color-danger);
}
.x {
  color: var(--el-color-primary);
}
.y {
  color: var(--el-color-warning);
}
</style>
