<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, shallowRef, watch, useTemplateRef } from 'vue';
import { ElButton, ElDropdown, ElDropdownItem, ElDropdownMenu } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { MEASURE_TICKS, tickToSampleExport } from '../core/timebase';
import { useWorkspace } from '../workspace/workspace';
import { primaryPressed } from '../input/bindings';
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
/** Track cells wrap after this many tracks, so a row stays narrow enough for the panel. */
const CELLS_PER_LINE = 8;
/** The right padding of a row; the header adds it to line up with the cells. */
const ROW_PADDING = 8;
const rowPaddingCss = `${ROW_PADDING}px`;
const cellLines = computed(() => Math.ceil(columns.value.length / CELLS_PER_LINE));
const cellGrid = computed(() => ({
  gridTemplateColumns: `repeat(${Math.min(columns.value.length, CELLS_PER_LINE)}, 14px)`,
}));
type Column = (typeof columns.value)[number];
/** Selected cells, as "track id@tick". Cells at several ticks can be selected. */
const picked = shallowRef<ReadonlySet<string>>(new Set());
const cellKey = (trackId: string, tick: number) => `${trackId}@${tick}`;
function isPicked(trackId: string, tick: number): boolean {
  return picked.value.has(cellKey(trackId, tick));
}
/**
 * Left clicks select cells. One click selects or deselects a cell, also a
 * linked one alone. A second click adds the cells linked with it; a third
 * adds every cell of the row.
 */
function pick(column: Column, tick: number, event: MouseEvent): void {
  const next = new Set(picked.value);
  const key = cellKey(column.trackId, tick);
  if (event.detail <= 1) {
    if (next.has(key)) next.delete(key);
    else next.add(key);
  } else if (event.detail === 2) {
    if (!column.links.has(tick)) return;
    for (const item of columns.value)
      if (item.links.has(tick)) next.add(cellKey(item.trackId, tick));
  } else for (const item of columns.value) next.add(cellKey(item.trackId, tick));
  picked.value = next;
}
/**
 * A middle click edits the links of the selection, or of the clicked cell when
 * nothing is selected. While a selected cell is not linked, the selection is
 * linked, tick by tick; a cell without a marker gets one. A fully linked
 * selection leaves its links instead; a link that keeps one marker ends.
 */
function applyLinks(column: Column, tick: number): void {
  const keys = picked.value.size ? [...picked.value] : [cellKey(column.trackId, tick)];
  const groups = new Map<number, string[]>();
  let unlinked = false;
  for (const key of keys) {
    const at = key.lastIndexOf('@');
    const trackId = key.slice(0, at),
      point = Number(key.slice(at + 1));
    const item = columns.value.find((entry) => entry.trackId === trackId);
    if (!item) continue;
    if (!item.links.has(point)) unlinked = true;
    groups.set(point, [...(groups.get(point) ?? []), trackId]);
  }
  const points = [...groups].map(([point, trackIds]) => ({ tick: point, trackIds }));
  if (unlinked) workspace.actions.linkPoints(points);
  else workspace.actions.unlinkPoints(points);
  picked.value = new Set();
}
/** Two right clicks on one cell within this time are a double right click. */
const DOUBLE_CLICK_MS = 400;
let lastRightClick: { key: string; time: number } | null = null;
/**
 * A right click goes to the marker: its track becomes current and the cursor
 * moves there. A second right click on the same cell adds or removes that
 * track's marker there, on that track only.
 */
function goTo(column: Column, tick: number, event: MouseEvent): void {
  const key = cellKey(column.trackId, tick);
  if (lastRightClick?.key === key && event.timeStamp - lastRightClick.time <= DOUBLE_CLICK_MS) {
    lastRightClick = null;
    workspace.actions.toggleTrackMarker(column.trackId, tick);
    return;
  }
  lastRightClick = { key, time: event.timeStamp };
  editor.selectTrack(column.trackId);
  editor.moveCursorTo(tick);
  editor.setSelectedTicks(column.markers.has(tick) ? [tick] : []);
  if (editor.timeBase && !editor.playing)
    editor.setPlayheadSample(tickToSampleExport(tick, editor.timeBase));
}
const otherTracks = computed(() =>
  columns.value.filter((column) => column.trackId !== editor.track.trackId),
);
// Virtual list: a window of rows is derived from the viewport scroll offset.
const viewport = useTemplateRef<HTMLDivElement>('viewport');
const offset = shallowRef(0);
const viewportHeight = shallowRef(0);
// The virtual list positions rows with this height. Each extra line of track cells adds 17 px.
const rowHeight = computed(() => Math.max(32, cellLines.value * 17 + 12));
const first = computed(() => Math.max(0, Math.floor(offset.value / rowHeight.value) - 3));
const rows = computed(() =>
  markerRows.value.slice(
    first.value,
    first.value + Math.ceil(viewportHeight.value / rowHeight.value) + 6,
  ),
);
let observer: ResizeObserver | undefined;
/** The scroll bar width of the list, so the header numbers stay above the cells. */
const gutter = shallowRef(0);
function measureGutter(): void {
  if (viewport.value) gutter.value = viewport.value.offsetWidth - viewport.value.clientWidth;
}
onMounted(() => {
  viewportHeight.value = viewport.value?.clientHeight ?? 0;
  observer = new ResizeObserver(([entry]) => {
    if (entry) viewportHeight.value = entry.contentRect.height;
    measureGutter();
  });
  measureGutter();
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
  if (!primaryPressed(event)) return [tick];
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
    if (offset.value > count * rowHeight.value) {
      offset.value = 0;
      if (viewport.value) viewport.value.scrollTop = 0;
    }
  },
);
</script>

<template>
  <section
    class="marker-list"
    data-hint-area="markers"
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
      :style="{ ...cellGrid, paddingRight: `${ROW_PADDING + gutter}px` }"
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
          <div
            v-for="tick in rows"
            :key="tick"
            class="marker-row"
            :class="{ selected: selected.has(tick), elsewhere: !current.has(tick) }"
            :style="{ height: `${rowHeight}px` }"
            @click="choose(tick, $event)"
          >
            <button
              type="button"
              class="marker-readout"
              :aria-pressed="selected.has(tick)"
            >
              {{ t('chrome.readoutTick', { measure: Math.floor(tick / MEASURE_TICKS) + 1, tick }) }}
            </button>
            <span
              v-if="multiTrack"
              class="marker-cells"
              :style="cellGrid"
            >
              <button
                v-for="column in columns"
                :key="column.trackId"
                type="button"
                tabindex="-1"
                class="marker-cell"
                :class="[
                  cellState(column, tick),
                  {
                    current: column.trackId === editor.track.trackId,
                    picked: isPicked(column.trackId, tick),
                  },
                ]"
                :aria-pressed="isPicked(column.trackId, tick)"
                :aria-label="`${column.number}: ${t(CELL_LABELS[cellState(column, tick)])}`"
                @click.stop="pick(column, tick, $event)"
                @mousedown.middle.prevent
                @auxclick.stop="$event.button === 1 && applyLinks(column, tick)"
                @contextmenu.prevent.stop="goTo(column, tick, $event)"
              />
            </span>
          </div>
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

/* Rows: the readout fills the width; selected highlight. */
.marker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0 v-bind(rowPaddingCss) 0 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.marker-readout {
  flex: 1;
  align-self: stretch;
  min-width: 0;
  padding: 0 12px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.marker-row:hover {
  background: var(--el-fill-color-light);
}
.marker-row.selected {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
/* A row where only other tracks have a marker. */
.marker-row.elsewhere {
  color: var(--el-text-color-secondary);
}

/* Track columns: the header numbers and the cells of each row line up from the right,
   at most eight per line. */
.marker-columns,
.marker-cells {
  display: grid;
  justify-content: end;
  gap: 3px;
}
.marker-columns {
  padding-bottom: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.marker-cell {
  display: inline-flex;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border-radius: 2px;
  font-variant-numeric: tabular-nums;
}
.marker-columns .marker-cell.current {
  color: var(--el-color-primary);
  font-weight: 600;
}
.marker-cells .marker-cell {
  border: 1px solid var(--el-border-color);
  background: transparent;
  cursor: pointer;
}
.marker-cells .marker-cell.own {
  background: v-bind('palette.accent');
  border-color: v-bind('palette.accent');
}
.marker-cells .marker-cell.linked {
  background: v-bind('palette.linked');
  border-color: v-bind('palette.linked');
}
/* The current track's cell has a thin ring; a picked point a thick one. */
.marker-cells .marker-cell.current {
  outline: 1px solid var(--el-color-primary);
  outline-offset: 1px;
}
.marker-cells .marker-cell.picked {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 1px;
  box-shadow: inset 0 0 0 2px var(--el-bg-color);
}
</style>
