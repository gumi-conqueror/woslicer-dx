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
/** Track cells wrap after this many tracks, so a row stays narrow enough for the panel. */
const CELLS_PER_LINE = 8;
const cellLines = computed(() => Math.ceil(columns.value.length / CELLS_PER_LINE));
const cellGrid = computed(() => ({
  gridTemplateColumns: `repeat(${Math.min(columns.value.length, CELLS_PER_LINE)}, 14px)`,
}));
/**
 * The points picked for linking: tracks at one tick. Picking a point at
 * another tick starts a new pick.
 */
const picked = shallowRef<{ tick: number; trackIds: ReadonlySet<string> } | null>(null);
function isPicked(trackId: string, tick: number): boolean {
  return picked.value?.tick === tick && picked.value.trackIds.has(trackId);
}
/** A left click picks or drops one point. */
function pick(trackId: string, tick: number): void {
  const ids = new Set(picked.value?.tick === tick ? picked.value.trackIds : []);
  if (ids.has(trackId)) ids.delete(trackId);
  else ids.add(trackId);
  picked.value = ids.size ? { tick, trackIds: ids } : null;
}
/** A double click picks every marker at the tick. */
function pickAll(tick: number): void {
  const ids = columns.value.filter((column) => column.markers.has(tick)).map((c) => c.trackId);
  picked.value = { tick, trackIds: new Set(ids) };
}
/**
 * A right click links or unlinks. On a picked point it acts on all picked
 * points: they unlink when all of them are linked, otherwise they link. On
 * another point it toggles that point alone, linking it with the other markers
 * at its tick.
 */
function toggleLink(column: (typeof columns.value)[number], tick: number): void {
  const group = isPicked(column.trackId, tick) && picked.value ? [...picked.value.trackIds] : [];
  if (group.length) {
    const linked = columns.value.filter(
      (item) => group.includes(item.trackId) && item.links.has(tick),
    );
    if (linked.length === group.length) workspace.actions.unlinkPoints(tick, group);
    else workspace.actions.linkPoints(tick, group);
  } else if (column.links.has(tick)) workspace.actions.unlinkPoints(tick, [column.trackId]);
  else {
    const holders = columns.value.filter((item) => item.markers.has(tick)).map((c) => c.trackId);
    workspace.actions.linkPoints(tick, [...new Set([...holders, column.trackId])]);
  }
  picked.value = null;
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
      :style="cellGrid"
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
                @click.stop="pick(column.trackId, tick)"
                @dblclick.stop="pickAll(tick)"
                @contextmenu.prevent.stop="toggleLink(column, tick)"
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
  padding: 0 8px 0 0;
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
  padding: 0 24px 4px 0;
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
