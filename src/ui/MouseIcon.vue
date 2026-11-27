<script setup lang="ts">
import { computed, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MouseGesture } from './mouse';

const props = defineProps<MouseGesture>();
const { t } = useI18n();
const clip = useId();
const label = computed(() =>
  [t(`mouse.${props.button}`), props.action ? t(`mouse.${props.action}`) : '']
    .filter(Boolean)
    .join(' '),
);
/** The click count shown beside the mouse. */
const count = computed(() =>
  props.action === 'double' ? '2' : props.action === 'triple' ? '3' : '',
);
</script>
<template>
  <svg
    class="mouse-icon"
    viewBox="0 0 26 24"
    role="img"
    :aria-label="label"
  >
    <defs>
      <clipPath :id="clip">
        <rect
          x="4"
          y="2"
          width="12"
          height="20"
          rx="6"
        />
      </clipPath>
    </defs>
    <!-- The pressed button is filled. -->
    <rect
      v-if="button === 'left' || button === 'right'"
      :x="button === 'left' ? 4 : 10"
      y="2"
      width="6"
      height="8"
      fill="currentColor"
      :clip-path="`url(#${clip})`"
    />
    <rect
      class="body"
      x="4"
      y="2"
      width="12"
      height="20"
      rx="6"
      fill="none"
      stroke="currentColor"
    />
    <path
      d="M4 10h12M10 2v8"
      fill="none"
      stroke="currentColor"
      stroke-width="1"
    />
    <rect
      x="8.8"
      y="4"
      width="2.4"
      height="4"
      rx="1.2"
      :fill="button === 'middle' || button === 'wheel' ? 'currentColor' : 'none'"
      stroke="currentColor"
      stroke-width="0.8"
    />
    <!-- Wheel: up and down arrows. Drag: a two-way arrow. Clicks: the count. -->
    <path
      v-if="button === 'wheel'"
      d="M21 3l2.5 3h-5ZM21 21l2.5-3h-5Z"
      fill="currentColor"
    />
    <path
      v-else-if="action === 'drag'"
      d="M17.5 16h8M17.5 16l2-2M17.5 16l2 2M25.5 16l-2-2M25.5 16l-2 2"
      fill="none"
      stroke="currentColor"
      stroke-width="1.2"
    />
    <text
      v-else-if="count"
      x="21.5"
      y="21"
      text-anchor="middle"
      font-size="9"
      font-weight="600"
      fill="currentColor"
    >
      {{ count }}
    </text>
  </svg>
</template>
<style scoped>
.mouse-icon {
  flex: none;
  width: 21px;
  height: 19px;
  vertical-align: middle;
}
/* The mouse body is filled with a tint of its outline color, as the controller icons. */
.body {
  fill: currentColor;
  fill-opacity: 0.16;
}
</style>
