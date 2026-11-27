import type { ProjectDocument } from '../project/schema';

type Track = ProjectDocument['tracks'][number];

/**
 * One row of the export matrix: a set of markers. Tracks whose marker lists
 * are equal share one row. The `linked` row holds the markers that every track
 * links.
 */
export interface MarkerRow {
  id: string;
  kind: 'track' | 'linked';
  ticks: readonly number[];
  /** Tracks that have exactly these markers; their cells are the default. */
  trackIds: readonly string[];
}

/** The marker rows of a project, in track order; the linked row comes last. */
export function markerRows(tracks: readonly Track[]): MarkerRow[] {
  const rows = new Map<string, { ticks: readonly number[]; trackIds: string[] }>();
  for (const track of tracks) {
    const { markers } = track.slicing;
    if (!markers.length) continue;
    const key = markers.join(',');
    const row = rows.get(key);
    if (row) row.trackIds.push(track.trackId);
    else rows.set(key, { ticks: markers, trackIds: [track.trackId] });
  }
  const result: MarkerRow[] = [...rows.values()].map((row) => ({
    id: `track:${row.trackIds[0] ?? ''}`,
    kind: 'track',
    ...row,
  }));
  const [first, ...others] = tracks;
  const linked =
    tracks.length > 1 && first
      ? (first.slicing.links ?? []).filter((tick) =>
          others.every((track) => track.slicing.links?.includes(tick)),
        )
      : [];
  if (linked.length) result.push({ id: 'linked', kind: 'linked', ticks: linked, trackIds: [] });
  return result;
}

/** A selected cell: the slices of one track's audio, cut at one row's markers. */
export const cellKey = (rowId: string, trackId: string) => `${rowId}|${trackId}`;

/** The default selection: each track's audio with its own markers. */
export function defaultSelection(rows: readonly MarkerRow[]): Set<string> {
  return new Set(rows.flatMap((row) => row.trackIds.map((trackId) => cellKey(row.id, trackId))));
}

/** One export job: the audio of a track cut at a set of markers. */
export interface ExportJob {
  trackId: string;
  ticks: readonly number[];
  /**
   * Added to the base name when the track uses more than one row, so the
   * file names differ: `m` and the number of the row's first track, or `linked`.
   */
  suffix: string | null;
}

/** The jobs of a selection, in track order, then row order. */
export function exportJobs(
  tracks: readonly Track[],
  rows: readonly MarkerRow[],
  selection: ReadonlySet<string>,
): ExportJob[] {
  const number = new Map(tracks.map((track, index) => [track.trackId, index + 1]));
  return tracks.flatMap((track) => {
    const used = rows.filter((row) => selection.has(cellKey(row.id, track.trackId)));
    return used.map((row) => ({
      trackId: track.trackId,
      ticks: row.ticks,
      suffix:
        used.length < 2
          ? null
          : row.kind === 'linked'
            ? 'linked'
            : `m${number.get(row.trackIds[0] ?? '') ?? 0}`,
    }));
  });
}
