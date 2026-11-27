<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { useDevicePixelRatio, useResizeObserver } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useEditorStore } from '../slicing/editor-store';
import { useUiPreferencesStore } from '../ui/preferences';
import { paletteFor } from '../ui/palette';
import { drawOverview, OVERVIEW_HEIGHT, setupCanvas } from './render';
const overviewHeightCss = `${OVERVIEW_HEIGHT}px`;
import type { LoadingActivity } from '../workspace/workspace';

const props = defineProps<{
  trackId: string;
  viewportWidth: number;
  loading?: LoadingActivity | null;
}>();
const { t } = useI18n();
const editor = useEditorStore();
const preferences = useUiPreferencesStore();
const palette = computed(() => paletteFor(preferences.theme));
const canvas = useTemplateRef<HTMLCanvasElement>('canvas');
const surface = useTemplateRef<HTMLElement>('surface');
const width = ref(0);
const { pixelRatio } = useDevicePixelRatio();
let frame = 0;
let pointer: number | null = null;
const current = computed(() => editor.track.trackId === props.trackId);
// Other tracks draw their own audio without the viewport box and do not scroll the view.
const snapshot = computed(() => {
  const session = editor.sessions.get(props.trackId);
  return {
    source: session?.source ?? null,
    peaks: session?.peaks ?? null,
    timeBase: editor.timeBaseOf(props.trackId),
    scrollTick: editor.scrollTick,
    pxPerTick: editor.pxPerTick,
    timelineTicks: editor.timelineTicks,
  };
});

function measure(): void {
  width.value = surface.value?.clientWidth ?? 0;
}
function invalidate(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    if (!canvas.value || width.value <= 0) return;
    const context = setupCanvas(canvas.value, {
      width: width.value,
      height: OVERVIEW_HEIGHT,
      dpr: pixelRatio.value || 1,
    });
    if (context)
      drawOverview(
        context,
        snapshot.value,
        width.value,
        current.value ? props.viewportWidth : null,
        palette.value,
      );
  });
}
// setupCanvas assigns a pixel CSS width. Observe the fluid wrapper so opening
// modules or resizing the window cannot leave that canvas at its previous size.
useResizeObserver(surface, measure);
onMounted(measure);
watch(
  [
    width,
    pixelRatio,
    palette,
    () => props.viewportWidth,
    snapshot,
    current,
    () => editor.docRevision,
    () => editor.scrollTick,
    () => editor.pxPerTick,
  ],
  invalidate,
);
function seek(event: PointerEvent): void {
  if (props.loading || !canvas.value || width.value <= 0) return;
  const ratio = (event.clientX - canvas.value.getBoundingClientRect().left) / width.value;
  const span = props.viewportWidth / editor.pxPerTick;
  editor.setScrollTick(ratio * editor.timelineTicks - span / 2);
}
function down(event: PointerEvent): void {
  if (props.loading || event.button !== 0 || pointer !== null || !current.value) return;
  event.preventDefault();
  pointer = event.pointerId;
  canvas.value?.setPointerCapture(event.pointerId);
  seek(event);
}
function end(event: PointerEvent): void {
  if (event.pointerId !== pointer) return;
  pointer = null;
  if (canvas.value?.hasPointerCapture(event.pointerId))
    canvas.value.releasePointerCapture(event.pointerId);
}
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<template>
  <div
    ref="surface"
    class="track-overview-container"
    :class="{ 'is-loading': !!loading }"
  >
    <canvas
      ref="canvas"
      class="track-overview"
      @pointerdown="down"
      @pointermove="pointer === $event.pointerId && seek($event)"
      @pointerup="end"
      @pointercancel="end"
      @lostpointercapture="end"
    />
    <div
      v-if="loading"
      class="track-loading"
      role="status"
      aria-live="polite"
      :aria-label="t(`loading.${loading.stage}`)"
      :data-media-id="loading.mediaId"
    />
  </div>
</template>

<style scoped>
.track-overview-container {
  position: relative;
  min-width: 0;
  height: v-bind(overviewHeightCss);
  overflow: hidden;
}
.is-loading .track-overview {
  visibility: hidden;
  pointer-events: none;
}
/* The effect overlays the existing thumbnail; loading never changes its box. */
.track-loading {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--wos-panel-header);
}
.track-loading::before,
.track-loading::after {
  content: '';
  position: absolute;
  inset: 0;
}
.track-loading::before {
  background: repeating-linear-gradient(90deg, var(--el-color-primary) 0 2px, transparent 2px 7px);
  mask-image: linear-gradient(transparent, #000 40% 60%, transparent);
  opacity: 0.4;
  animation: track-loading-pulse 1.8s ease-in-out infinite alternate;
}
.track-loading::after {
  background: linear-gradient(
    100deg,
    transparent 20%,
    var(--el-color-primary-light-7) 50%,
    transparent 80%
  );
  animation: track-loading-sweep 1.8s ease-in-out infinite;
}
@keyframes track-loading-pulse {
  from {
    transform: scaleY(0.45);
    opacity: 0.25;
  }
  to {
    transform: scaleY(1);
    opacity: 0.55;
  }
}
@keyframes track-loading-sweep {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .track-loading::before,
  .track-loading::after {
    animation: none;
  }
}
.track-overview {
  display: block;
  width: 100%;
  height: v-bind(overviewHeightCss);
  min-width: 0;
  cursor: pointer;
  touch-action: none;
}
</style>
