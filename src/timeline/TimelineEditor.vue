<script setup lang="ts">
import { CANCEL, matchesChords, primaryPressed } from '../input/bindings';
import TrackHeader from './TrackHeader.vue';
import CommandMenu from '../input/CommandMenu.vue';
import { TRACK_MENU } from '../commands/menu';
import { useCommandRunner } from '../commands/commands';
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue';
import { useDevicePixelRatio, useResizeObserver } from '@vueuse/core';
import { ElSlider } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { useEditorStore } from '../slicing/editor-store';
import { usePlayback } from '../playback';
import { useUiPreferencesStore } from '../ui/preferences';
import { paletteFor } from '../ui/palette';
import { sampleToTick, tickToSampleExport } from '../core/timebase';
import { createTimelineGestures, type TimelinePointer } from './gestures';
import { drawOverlay, drawRuler, drawTimeline, RULER_HEIGHT, setupCanvas } from './render';
const rulerHeightCss = `${RULER_HEIGHT}px`;
import type { LoadingActivity } from '../workspace/workspace';

defineProps<{ loading?: LoadingActivity | null }>();
const editor = useEditorStore();
const playback = usePlayback();
const preferences = useUiPreferencesStore();
const { t } = useI18n();
// Canvas colors follow the UI theme.
const palette = computed(() => paletteFor(preferences.theme));
// Layer stack: track overview, ruler, wave and overlay inside the viewport.
const viewport = useTemplateRef<HTMLElement>('viewport');
const ruler = useTemplateRef<HTMLCanvasElement>('ruler');
const wave = useTemplateRef<HTMLCanvasElement>('wave');
const overlay = useTemplateRef<HTMLCanvasElement>('overlay');
const { pixelRatio } = useDevicePixelRatio();
const dimensions = shallowRef({ width: 0, height: 0 });
const trackMenu = shallowRef<{ x: number; y: number } | null>(null);
const runCommand = useCommandRunner();
// Gestures own pointer semantics; this component owns the DOM, RAF and observer lifecycle.
const gestures = createTimelineGestures(editor);
const { ghost, cursor } = gestures;
// One pending animation frame coalesces redraws; fullDraw marks a full repaint of all
// layers versus an overlay-only pass (playhead, hover ghost). activePointer is the
// captured viewport pointer.
let frame = 0;
let fullDraw = false;
let activePointer: number | null = null;
// Widest scroll offset in ticks: timeline length minus one viewport width.
const scrollMaximum = computed(() =>
  Math.max(0, editor.timelineTicks - dimensions.value.width / editor.pxPerTick),
);
watch(
  () => dimensions.value.width,
  (width) => {
    editor.viewportWidth = width;
  },
  { immediate: true },
);
// Coalesced repaint: one RAF redraws wave/ruler when fullDraw, then the overlay.
function invalidate(all = true): void {
  fullDraw ||= all;
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const size = { ...dimensions.value, dpr: pixelRatio.value || 1 };
    if (size.width <= 0 || size.height <= 0) {
      fullDraw = false;
      return;
    }
    if (fullDraw) {
      if (wave.value) {
        const context = setupCanvas(wave.value, size);
        if (context) drawTimeline(context, editor, size, palette.value);
      }
      if (ruler.value) {
        const context = setupCanvas(ruler.value, { ...size, height: RULER_HEIGHT });
        if (context) drawRuler(context, editor, size.width, palette.value);
      }
    }
    if (overlay.value) {
      const context = setupCanvas(overlay.value, size);
      if (context) drawOverlay(context, editor, size, palette.value, ghost.value);
    }
    fullDraw = false;
  });
}
function measure(): void {
  if (viewport.value)
    dimensions.value = { width: viewport.value.clientWidth, height: viewport.value.clientHeight };
}
// Viewport size from the resize observer, re-measured once after mount.
useResizeObserver(viewport, measure);
onMounted(measure);
// Full repaints: layout, palette, document revision, preview ticks, source/peaks,
// grid/zoom/scroll, selections and rms/band overlays.
watch(
  [
    dimensions,
    pixelRatio,
    palette,
    () => editor.docRevision,
    () => editor.previewTicks,
    () => editor.source,
    () => editor.peaks,
    () => editor.grid,
    () => editor.pxPerTick,
    () => editor.scrollTick,
    () => editor.selectedTicks,
    () => editor.selectionStartTick,
    () => editor.selectionEndTick,
    () => editor.rmsVisible,
    () => editor.bandsVisible,
    () => editor.bandAnalysis,
  ],
  () => invalidate(),
);
// Overlay-only repaints: the moving playhead and the gesture hover ghost.
watch([() => editor.playheadSample, () => editor.cursorTick, ghost], () => invalidate(false));
// Auto-scroll: while playing with follow enabled, keep the playhead inside the window.
watch([() => editor.playheadSample, () => editor.followPlayhead], () => {
  if (!editor.playing || !editor.followPlayhead || !editor.timeBase || dimensions.value.width <= 0)
    return;
  const tick = sampleToTick(editor.playheadSample, editor.timeBase);
  const span = dimensions.value.width / editor.pxPerTick;
  if (tick < editor.scrollTick || tick > editor.scrollTick + span * 0.95)
    editor.setScrollTick(Math.max(0, tick - span * 0.1));
});
function point(event: PointerEvent): TimelinePointer {
  const rect = viewport.value?.getBoundingClientRect();
  return {
    x: event.clientX - (rect?.left ?? 0),
    y: event.clientY - (rect?.top ?? 0),
    button: event.button,
    altKey: event.altKey,
    shiftKey: event.shiftKey,
    ctrlKey: primaryPressed(event),
  };
}
// Viewport gesture protocol: one captured pointer drives begin/move/end;
// cancel and lost capture abort the gesture and drop the capture slot.
function pointerDown(event: PointerEvent): void {
  if (activePointer !== null || event.button > 2) return;
  event.preventDefault();
  viewport.value?.focus();
  activePointer = event.pointerId;
  viewport.value?.setPointerCapture(event.pointerId);
  gestures.begin(point(event));
}
function pointerMove(event: PointerEvent): void {
  if (activePointer !== null && event.pointerId !== activePointer) return;
  gestures.move(point(event));
}
function pointerUp(event: PointerEvent): void {
  if (event.pointerId !== activePointer) return;
  gestures.end(point(event));
  activePointer = null;
  if (viewport.value?.hasPointerCapture(event.pointerId))
    viewport.value.releasePointerCapture(event.pointerId);
}
function cancelGesture(): void {
  gestures.cancel();
  activePointer = null;
}
// Escape aborts an active gesture before any other key handling.
function keydown(event: KeyboardEvent): void {
  if (matchesChords(event, CANCEL) && gestures.cancel()) {
    activePointer = null;
    event.preventDefault();
    event.stopPropagation();
  }
}
// Wheel pans in timeline ticks; Ctrl/Meta (or ruler-originated wheel) zooms instead.
// Delta units are normalized to pixels per deltaMode (line=16px, page=viewport width).
function wheel(event: WheelEvent, rulerZoom = false): void {
  event.preventDefault();
  const rect = viewport.value?.getBoundingClientRect();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? dimensions.value.width : 1;
  gestures.wheel(
    event.clientX - (rect?.left ?? 0),
    event.deltaX * unit,
    event.deltaY * unit,
    // A trackpad pinch arrives as a wheel with Ctrl held, also on macOS.
    rulerZoom || event.ctrlKey || primaryPressed(event),
  );
}
// Ruler click seeks: snapped cursor tick, then playback re-anchored to the same tick.
function seek(event: PointerEvent): void {
  if (event.button !== 0) return;
  const rect = ruler.value?.getBoundingClientRect();
  const tick = editor.snapTick(
    editor.scrollTick + (event.clientX - (rect?.left ?? 0)) / editor.pxPerTick,
  );
  editor.setCursorTick(tick);
  if (editor.timeBase) playback.seekSample(tickToSampleExport(editor.cursorTick, editor.timeBase));
}
// Horizontal scroll slider accepts only the number branch of the payload.
function scroll(value: number | number[]): void {
  if (typeof value === 'number') editor.setScrollTick(value);
}
// Cleanup: abort the gesture, unregister the editor draft-cancellation hook,
// and cancel any pending animation frame.
onBeforeUnmount(() => {
  cancelGesture();
  gestures.dispose();
  cancelAnimationFrame(frame);
});
</script>

<template>
  <section
    class="timeline"
    :aria-label="t('chrome.tabCuts')"
  >
    <div
      class="track-list"
      role="list"
      :aria-label="t('chrome.tracks')"
    >
      <TrackHeader
        v-for="(item, index) in editor.document.tracks"
        :key="item.trackId"
        role="listitem"
        :track-id="item.trackId"
        :index="index"
        :viewport-width="dimensions.width"
        :loading="loading"
        @menu="trackMenu = $event"
      />
      <!-- A new track that is still decoding -->
      <TrackHeader
        v-if="loading?.newTrack && loading.trackId && loading.stage !== 'opening'"
        role="listitem"
        :track-id="loading.trackId"
        :index="editor.document.tracks.length"
        :viewport-width="dimensions.width"
        :loading="loading"
      />
    </div>
    <CommandMenu
      v-if="trackMenu"
      :commands="TRACK_MENU"
      :x="trackMenu.x"
      :y="trackMenu.y"
      :state="editor"
      :label="t('chrome.trackMenu')"
      @run="(command) => runCommand?.(command)"
      @close="trackMenu = null"
    />
    <!-- ruler: click to seek, wheel zooms -->
    <canvas
      ref="ruler"
      class="timeline-ruler"
      data-hint-area="ruler"
      @pointerdown="seek"
      @wheel="wheel($event, true)"
    />
    <!-- viewport: keyboard-focusable gesture surface over stacked wave + overlay canvases -->
    <div
      ref="viewport"
      class="timeline-viewport"
      data-hint-area="timeline"
      :aria-busy="!!loading"
      tabindex="0"
      :style="{ cursor }"
      @pointerdown="pointerDown"
      @pointermove="pointerMove"
      @pointerup="pointerUp"
      @pointercancel="cancelGesture"
      @lostpointercapture="cancelGesture"
      @contextmenu.prevent
      @wheel="wheel($event)"
      @keydown="keydown"
    >
      <canvas
        ref="wave"
        class="timeline-canvas"
      />
      <canvas
        ref="overlay"
        class="timeline-canvas timeline-overlay"
      />
      <!-- empty placeholder while no audio source is loaded -->
      <div
        v-if="!editor.source && !loading"
        class="timeline-empty"
      >
        <div class="empty-prompt">
          <span
            class="empty-wave"
            aria-hidden="true"
            >▂ ▅ ▃ ▇ ▅ ▂</span
          ><strong>{{ t('chrome.emptyTitle') }}</strong><span>{{ t('chrome.emptySub') }}</span>
        </div>
      </div>
    </div>
    <!-- horizontal scrollbar bound to scrollTick -->
    <ElSlider
      class="timeline-scroll"
      :model-value="Math.min(editor.scrollTick, scrollMaximum)"
      :max="scrollMaximum || 1"
      :disabled="scrollMaximum === 0"
      :show-tooltip="false"
      :aria-label="t('chrome.tabCuts')"
      @update:model-value="scroll"
    />
  </section>
</template>

<style scoped>
/* Up to three track rows stay visible; more tracks scroll inside the list. */
.track-list {
  flex: none;
  max-height: calc(3 * 65px);
  overflow-y: auto;
}
/* Timeline column: track, ruler, viewport and scrollbar stacked vertically. */
.timeline {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Ruler strip: fixed height, pointer cursor for seeking. */
.timeline-ruler {
  flex: 0 0 v-bind(rulerHeightCss);
  height: v-bind(rulerHeightCss);
  min-height: 0;
  min-width: 0;
  cursor: pointer;
}

/* Viewport fills the remaining height; pointer events drive gestures. */
.timeline-viewport {
  position: relative;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  touch-action: none;
  outline-offset: -2px;
}

/* Wave and overlay canvases are stacked layers; gestures hit the viewport only. */
.timeline-canvas {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* Overlay sits above the wave to carry playhead, selection and ghost. */
.timeline-overlay {
  z-index: 1;
}

/* Empty hint centered over the canvases while no source is loaded. */
.timeline-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.empty-prompt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  background: var(--el-bg-color);
  max-width: calc(100% - 32px);
  text-align: center;
  box-shadow: 0 4px 24px #00000012;
}
.empty-prompt strong {
  color: var(--el-text-color-primary);
  font-size: 15px;
  font-weight: 500;
}
.empty-wave {
  color: var(--el-color-primary);
  letter-spacing: 2px;
  font-size: 25px;
  line-height: 1.5;
}

/* Horizontal scrollbar below the viewport. */
.timeline-scroll {
  flex: 0 0 20px;
  width: calc(100% - 16px);
  margin: 0 8px;
}
</style>
