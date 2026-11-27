<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { ElButton, ElCheckbox, ElDialog } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { useEditorStore } from '../slicing/editor-store';
import {
  cellKey,
  defaultSelection,
  exportJobs,
  markerRows,
  type ExportJob,
  type MarkerRow,
} from './export-plan';

/**
 * Chooses which track's audio is cut at which markers. Columns are the audio
 * of each track, rows are marker sets: one per distinct marker list, and the
 * markers linked on all tracks. Each checked cell exports one set of slices.
 */
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ export: [jobs: ExportJob[]] }>();
const editor = useEditorStore();
const { t } = useI18n();
const tracks = computed(() => editor.document.tracks);
const rows = computed(() => markerRows(tracks.value));
/** Only tracks with audio can be exported. */
const audible = (trackId: string) => !!editor.sessions.get(trackId)?.source;
const selection = shallowRef<ReadonlySet<string>>(new Set());
function defaults(row?: MarkerRow): Set<string> {
  return new Set(
    [...defaultSelection(row ? [row] : rows.value)].filter((key) =>
      tracks.value.some((track) => key.endsWith(`|${track.trackId}`) && audible(track.trackId)),
    ),
  );
}
watch(
  open,
  (value) => {
    if (value) selection.value = defaults();
  },
  { immediate: true },
);
function toggle(row: MarkerRow, trackId: string): void {
  const next = new Set(selection.value);
  const key = cellKey(row.id, trackId);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  selection.value = next;
}
type RowMode = 'default' | 'all' | 'none' | 'custom';
const ROW_MODE_LABELS = {
  default: 'exportDialog.modeDefault',
  all: 'exportDialog.modeAll',
  none: 'exportDialog.modeNone',
  custom: 'exportDialog.modeCustom',
} as const;
/** The row's cells compared with its default, all audible tracks, and none. */
function rowMode(row: MarkerRow): RowMode {
  const cells = tracks.value
    .filter((track) => audible(track.trackId))
    .map((track) => cellKey(row.id, track.trackId));
  const chosen = cells.filter((key) => selection.value.has(key));
  const preset = [...defaults(row)];
  if (chosen.length === preset.length && preset.every((key) => selection.value.has(key)))
    return 'default';
  if (chosen.length === cells.length) return 'all';
  return chosen.length ? 'custom' : 'none';
}
/** The row button switches the row to its default, then all tracks, then none. */
function cycle(row: MarkerRow): void {
  const mode = rowMode(row);
  const next = new Set([...selection.value].filter((key) => !key.startsWith(`${row.id}|`)));
  const target = mode === 'default' ? 'all' : mode === 'all' ? 'none' : 'default';
  if (target === 'default') for (const key of defaults(row)) next.add(key);
  if (target === 'all')
    for (const track of tracks.value)
      if (audible(track.trackId)) next.add(cellKey(row.id, track.trackId));
  selection.value = next;
}
function rowLabel(row: MarkerRow): string {
  if (row.kind === 'linked') return t('exportDialog.rowLinked');
  const numbers = row.trackIds.map(
    (trackId) => tracks.value.findIndex((track) => track.trackId === trackId) + 1,
  );
  return t('exportDialog.rowTrack', { tracks: numbers.join(', ') });
}
function start(): void {
  emit('export', exportJobs(tracks.value, rows.value, selection.value));
  open.value = false;
}
</script>
<template>
  <ElDialog
    v-model="open"
    :title="t('exportDialog.title')"
    width="min(760px, 95vw)"
    append-to-body
    destroy-on-close
  >
    <p class="export-hint">{{ t('exportDialog.hint') }}</p>
    <div
      class="export-matrix"
      data-gamepad-scroll
    >
      <table>
        <thead>
          <tr>
            <th scope="col">{{ t('exportDialog.markers') }}</th>
            <th
              v-for="(track, index) in tracks"
              :key="track.trackId"
              scope="col"
              :title="track.name"
            >
              <span class="track-number">{{ index + 1 }}</span>
              <span class="track-name">{{ track.name }}</span>
            </th>
            <th scope="col">{{ t('exportDialog.rowToggle') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.id"
          >
            <th scope="row">
              {{ rowLabel(row) }}
              <small>{{ t('exportDialog.count', { count: row.ticks.length }) }}</small>
            </th>
            <td
              v-for="(track, index) in tracks"
              :key="track.trackId"
            >
              <ElCheckbox
                :model-value="selection.has(cellKey(row.id, track.trackId))"
                :disabled="!audible(track.trackId)"
                :aria-label="`${rowLabel(row)} · ${index + 1}. ${track.name}`"
                @update:model-value="toggle(row, track.trackId)"
              />
            </td>
            <td>
              <ElButton
                size="small"
                :aria-label="`${rowLabel(row)}: ${t(ROW_MODE_LABELS[rowMode(row)])}`"
                @click="cycle(row)"
                >{{ t(ROW_MODE_LABELS[rowMode(row)]) }}</ElButton
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <template #footer>
      <ElButton @click="open = false">{{ t('exportDialog.cancel') }}</ElButton>
      <ElButton
        type="primary"
        :disabled="!selection.size"
        @click="start"
        >{{ t('exportDialog.export') }}</ElButton
      >
    </template>
  </ElDialog>
</template>
<style scoped>
.export-hint {
  margin: 0 0 10px;
  color: var(--el-text-color-secondary);
}
.export-matrix {
  max-height: 60vh;
  overflow: auto;
}
table {
  border-collapse: collapse;
}
th,
td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  text-align: center;
  white-space: nowrap;
}
th[scope='row'] {
  text-align: left;
  font-weight: normal;
}
th[scope='row'] small {
  margin-left: 6px;
  color: var(--el-text-color-secondary);
}
thead th {
  vertical-align: bottom;
  font-weight: 600;
}
.track-number {
  display: block;
  color: var(--el-color-primary);
  font-family: 'Consolas', monospace;
}
.track-name {
  display: block;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: normal;
}
</style>
