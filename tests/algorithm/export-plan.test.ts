import { describe, expect, it } from 'vitest';
import { createEmptyTrack } from '../../src/project/codec';
import { cellKey, defaultSelection, exportJobs, markerRows } from '../../src/export/export-plan';

function tracks(...lists: { markers: number[]; links?: number[] }[]) {
  return lists.map(({ markers, links }, index) => {
    const track = createEmptyTrack(`t${index + 1}`, `t${index + 1}`);
    track.slicing.markers = markers;
    if (links) track.slicing.links = links;
    return track;
  });
}

describe('export plan', () => {
  it('merges tracks with equal markers into one row and adds the markers linked on all tracks', () => {
    const value = tracks(
      { markers: [24, 48], links: [24] },
      { markers: [24, 96], links: [24] },
      { markers: [24, 48], links: [24] },
      { markers: [] },
    );
    const rows = markerRows(value.slice(0, 3));
    expect(rows.map((row) => [row.id, row.ticks, row.trackIds])).toEqual([
      ['track:t1', [24, 48], ['t1', 't3']],
      ['track:t2', [24, 96], ['t2']],
      ['linked', [24], []],
    ]);
    // A track without markers has no row, and nothing is linked on it.
    expect(markerRows(value).map((row) => row.id)).toEqual(['track:t1', 'track:t2']);
    // The default exports each track with its own markers; the linked row is off.
    expect([...defaultSelection(rows)]).toEqual(['track:t1|t1', 'track:t1|t3', 'track:t2|t2']);
  });
  it('names a track that is cut at several marker rows by row', () => {
    const value = tracks({ markers: [24], links: [24] }, { markers: [24, 48], links: [24] });
    const rows = markerRows(value);
    const selection = new Set([
      cellKey('track:t1', 't1'),
      cellKey('track:t2', 't1'),
      cellKey('linked', 't1'),
      cellKey('track:t2', 't2'),
    ]);
    expect(exportJobs(value, rows, selection)).toEqual([
      { trackId: 't1', ticks: [24], suffix: 'm1' },
      { trackId: 't1', ticks: [24, 48], suffix: 'm2' },
      { trackId: 't1', ticks: [24], suffix: 'linked' },
      { trackId: 't2', ticks: [24, 48], suffix: null },
    ]);
  });
});
