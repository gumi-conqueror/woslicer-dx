<script setup lang="ts">
import type { YuanconGuideControl } from '../input/yuancon/protocol';
defineProps<{
  control?: YuanconGuideControl;
  keys?: number;
  direction?: number;
  numbered?: boolean;
}>();
const keyPositions = [
  { bit: 0, x: 27, y: 16 },
  { bit: 1, x: 32, y: 3 },
  { bit: 2, x: 37, y: 16 },
  { bit: 3, x: 42, y: 3 },
  { bit: 4, x: 47, y: 16 },
  { bit: 5, x: 52, y: 3 },
  { bit: 6, x: 57, y: 16 },
];
</script>
<template>
  <svg
    class="yuancon-icon"
    viewBox="0 0 68 32"
    fill="currentColor"
    fill-opacity="0.16"
    stroke="currentColor"
    stroke-width="1.5"
    aria-hidden="true"
  >
    <circle
      cx="12"
      cy="16"
      r="10"
      :class="{ active: direction || control === 'positive' || control === 'negative' }"
    />
    <circle
      cx="12"
      cy="16"
      r="3"
    />
    <path
      v-if="control === 'positive'"
      fill="none"
      d="M5 14a7 7 0 0 1 12-3m-4 0h4V7"
    />
    <path
      v-if="control === 'negative'"
      fill="none"
      d="M19 14A7 7 0 0 0 7 11m4 0H7V7"
    />
    <rect
      v-for="key in keyPositions"
      :key="key.bit"
      :x="key.x"
      :y="key.y"
      width="8"
      height="12"
      rx="1"
      :class="{ active: control === 'keys' || ($props.keys ?? 0) & (1 << key.bit) }"
    />
    <template v-if="numbered">
      <text
        v-for="key in keyPositions"
        :key="key.bit"
        :x="key.x + 4"
        :y="key.y + 8.5"
        text-anchor="middle"
        font-size="7"
        fill="currentColor"
        fill-opacity="1"
        stroke="none"
      >
        {{ key.bit + 1 }}
      </text>
    </template>
  </svg>
</template>
<style scoped>
.yuancon-icon {
  width: 51px;
  height: 24px;
  flex: none;
  vertical-align: middle;
}
/* Bodies carry a light tint of the outline color; active parts a strong one. */
.active {
  fill: currentColor;
  fill-opacity: 0.6;
  stroke-width: 2;
}
</style>
