<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, shallowRef, watch, useTemplateRef } from 'vue';
import { ElButton, ElDropdown, ElDropdownItem, ElDropdownMenu } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { MEASURE_TICKS, tickToSampleExport } from '../core/timebase';
import { useWorkspace } from '../workspace/workspace';
import { useUiPreferencesStore } from '../ui/preferences';
import { paletteFor } from '../ui/palette';
const { t } = useI18n();
const workspace = useWorkspace();
const editor = workspace.editor;
const preferences = useUiPreferencesStore();
// Cells use the marker colors of the waveform.
const palette = computed(() => paletteFor(preferences.theme));
const tracks = computed(() => editor.document.tracks);
const multiTrack = computed(() => tracks.value.length > 1);
/** The markers and links of each track, for the track columns. */
const columns = computed(() =>
  tracks.value.map((item, index) => ({
    trackId: item.trackId,
    number: index + 1,
    name: item.name,
    markers: new Set(item.slicing.markers),
    links: new Set(item.slicing.links ?? []),
  })),
);
/** One row per tick that has a marker on any track, in time order. */
const markerRows = computed(() => {
  if (!multiTrack.value) return editor.ticks;
  const all = new Set<number>();
  for (const item of tracks.value) for (const tick of item.slicing.markers) all.add(tick);
  return [...all].sort((a, b) => a - b);
});
type CellState = 'absent' | 'own' | 'linked';
function cellState(column: (typeof columns.value)[number], tick: number): CellState {
  if (!column.markers.has(tick)) return 'absent';
  return column.links.has(tick) ? 'linked' : 'own';
}
const CELL_LABELS = {
  absent: 'chrome.markerAbsent',
  own: 'chrome.markerOwn',
  linked: 'chrome.markerLinked',
} as const;
const current = computed(() => new Set(editor.ticks));
const otherTracks = computed(() =>
  columns.value.filter((column) => column.trackId !== editor.track.trackId),
);
// Virtual list: a window of rows is derived from the viewport scroll offset.
const viewport = useTemplateRef<HTMLDivElement>('viewport');
const offset = shallowRef(0);
const viewportHeight = shallowRef(0);
// The virtual list positions rows with this height; the row style reads it.
const rowHeight = 32;
const rowHeightCss = `${rowHeight}px`;
const first = computed(() => Math.max(0, Math.floor(offset.value / rowHeight) - 3));
const rows = computed(() =>
  markerRows.value.slice(
    first.value,
    first.value + Math.ceil(viewportHeight.value / rowHeight) + 6,
  ),
);
let observer: ResizeObserver | undefined;
onMounted(() => {
  viewportHeight.value = viewport.value?.clientHeight ?? 0;
  observer = new ResizeObserver(([entry]) => {
    if (entry) viewportHeight.value = entry.contentRect.height;
  });
  if (viewport.value) observer.observe(viewport.value);
});
onBeforeUnmount(() => observer?.disconnect());
const selected = computed(() => new Set(editor.selectedTicks));
// Viewport scroll drives the rendered window.
function scroll(event: Event): void {
  if (event.currentTarget instanceof HTMLElement) offset.value = event.currentTarget.scrollTop;
}
// Click protocol: plain click replaces the selection; Ctrl/Meta toggles the clicked tick.
// Only markers of the current track can be selected.
// Afterwards: cursor, scroll keep-alive, and playhead update only while playback is stopped.
function choose(tick: number, event: MouseEvent): void {
  editor.setCursorTick(tick);
  editor.setSelectedTicks(nextSelection(tick, event));
  editor.setScrollTick(Math.max(0, tick - 24));
  if (editor.timeBase && !editor.playing)
    editor.setPlayheadSample(tickToSampleExport(tick, editor.timeBase));
}
// Selection branch of the click protocol.
function nextSelection(tick: number, event: MouseEvent): number[] {
  if (!event.ctrlKey && !event.metaKey) return [tick];
  if (!selected.value.has(tick)) return [...editor.selectedTicks, tick];
  return editor.selectedTicks.filter((t) => t !== tick);
}
function linkTo(trackId: unknown): void {
  if (typeof trackId === 'string') workspace.actions.linkMarkersTo([trackId]);
}
// Reset the scroll window when the row list shrinks below the current offset.
watch(
  () => markerRows.value.length,
  (count) => {
    if (offset.value > count * rowHeight) {
      offset.value = 0;
      if (viewport.value) viewport.value.scrollTop = 0;
    }
  },
);
</script>

<template>
  <section
    class="marker-list"
    :aria-label="t('chrome.tabCuts')"
    data-testid="marker-list"
  >
    <!-- marker actions: quantize selection, clear all, links between tracks -->
    <div class="marker-actions">
      <ElButton
        size="small"
        :disabled="!editor.selectedTicks.length"
        @click="workspace.actions.quantizeSelection()"
        >{{ t('chrome.quantize') }}</ElButton
      >
      <ElButton
        size="small"
        :disabled="!editor.ticks.length"
        @click="workspace.actions.clearMarkers()"
        >{{ t('chrome.clearMarkers') }}</ElButton
      >
      <template v-if="multiTrack">
        <ElButton
          size="small"
          :disabled="!editor.ticks.length"
          @click="workspace.actions.linkMarkersToAllTracks()"
          >{{ t('menu.linkMarkersAll') }}</ElButton
        >
        <ElDropdown
          trigger="click"
          :disabled="!editor.ticks.length"
          @command="linkTo"
        >
          <ElButton
            size="small"
            :disabled="!editor.ticks.length"
            >{{ t('chrome.linkTo') }} ▾</ElButton
          >
          <template #dropdown>
            <ElDropdownMenu>
              <ElDropdownItem
                v-for="column in otherTracks"
                :key="column.trackId"
                :command="column.trackId"
                >{{ column.number }}. {{ column.name }}</ElDropdownItem
              >
            </ElDropdownMenu>
          </template>
        </ElDropdown>
        <ElButton
          size="small"
          :disabled="!editor.linkedTicks.size"
          @click="workspace.actions.unlinkMarkers()"
          >{{ t('menu.unlinkMarkers') }}</ElButton
        >
        <ElButton
          size="small"
          :disabled="!editor.ticks.length"
          @click="workspace.actions.relinkMarkers()"
          >{{ t('menu.relinkMarkers') }}</ElButton
        >
      </template>
    </div>
    <!-- track columns: one per track, the current track highlighted -->
    <div
      v-if="multiTrack"
      class="marker-columns"
      :aria-label="t('chrome.markerTracks')"
    >
      <span
        v-for="column in columns"
        :key="column.trackId"
        class="marker-cell"
        :class="{ current: column.trackId === editor.track.trackId }"
        :title="column.name"
        >{{ column.number }}</span
      >
    </div>
    <!-- virtualized list: spacer keeps the scroll height, window offsets the visible rows -->
    <div
      ref="viewport"
      class="marker-viewport"
      @scroll="scroll"
    >
      <div
        class="marker-spacer"
        :style="{ height: `${markerRows.length * rowHeight}px` }"
      >
        <div
          class="marker-window"
          :style="{ transform: `translateY(${first * rowHeight}px)` }"
        >
          <ElButton
            v-for="tick in rows"
            :key="tick"
            class="marker-row"
            :class="{ selected: selected.has(tick), elsewhere: !current.has(tick) }"
            :aria-pressed="selected.has(tick)"
            @click="choose(tick, $event)"
          >
            <span class="marker-readout">{{
              t('chrome.readoutTick', { measure: Math.floor(tick / MEASURE_TICKS) + 1, tick })
            }}</span>
            <span
              v-if="multiTrack"
              class="marker-cells"
            >
              <span
                v-for="column in columns"
                :key="column.trackId"
                role="img"
                class="marker-cell"
                :class="[
                  cellState(column, tick),
                  { current: column.trackId === editor.track.trackId },
                ]"
                :aria-label="`${column.number}: ${t(CELL_LABELS[cellState(column, tick)])}`"
              />
            </span>
          </ElButton>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Panel padding and marker action buttons. */
.marker-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.marker-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.marker-actions :deep(.el-button) {
  margin: 0;
}

/* The viewport consumes the pane's remaining height; rows follow its measured size. */
.marker-viewport {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.marker-spacer {
  position: relative;
}
.marker-window {
  position: absolute;
  inset: 0 0 auto;
}

/* Row buttons: full-width, square, tabular numerals; selected highlight. */
.marker-row {
  display: flex;
  width: 100%;
  height: v-bind(rowHeightCss);
  margin: 0;
  border-radius: 0;
  justify-content: flex-start;
  font-variant-numeric: tabular-nums;
}
.marker-row :deep(> span) {
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.marker-row + .marker-row {
  margin-left: 0;
}
.marker-row.selected {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
/* A row where only other tracks have a marker. */
.marker-row.elsewhere {
  color: var(--el-text-color-secondary);
}

/* Track columns: the header numbers and the cells of each row line up from the right. */
.marker-columns,
.marker-cells {
  display: flex;
  justify-content: flex-end;
  gap: 3px;
}
.marker-columns {
  padding: 0 16px 4px 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.marker-cell {
  display: inline-flex;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 2px;
  font-variant-numeric: tabular-nums;
}
.marker-columns .marker-cell.current {
  color: var(--el-color-primary);
  font-weight: 600;
}
.marker-cells .marker-cell {
  border: 1px solid var(--el-border-color-lighter);
}
.marker-cells .marker-cell.own {
  background: v-bind('palette.accent');
  border-color: v-bind('palette.accent');
}
.marker-cells .marker-cell.linked {
  background: v-bind('palette.linked');
  border-color: v-bind('palette.linked');
}
.marker-cells .marker-cell.current {
  outline: 1px solid var(--el-color-primary);
  outline-offset: 1px;
}
</style>
