import { describe, expect, it } from 'vitest';
import { createEmptyTrack } from '../../src/project/codec';
import { applyMarkerEdit, linkAt } from '../../src/project/marker-links';

function tracks(...lists: { markers: number[]; links: number[] }[]) {
  return lists.map(({ markers, links }, index) => {
    const track = createEmptyTrack(`t${index}`, `t${index}`);
    track.slicing.markers = markers;
    track.slicing.links = links;
    return track;
  });
}
const anywhere = () => true;

describe('linked marker edits', () => {
  it('moves a chain of linked markers by one step on every track', () => {
    // Shifting 0, 24 and 48 by 24: each marker lands where the next one was.
    const value = tracks(
      { markers: [0, 24, 48], links: [0, 24, 48] },
      { markers: [0, 24, 48, 100], links: [0, 24, 48] },
    );
    const target = (tick: number) => tick + 24;
    applyMarkerEdit(value, 't0', { markers: [24, 48, 72], keys: [], target }, true, anywhere);
    expect(value[1]?.slicing.markers).toEqual([24, 48, 72, 100]);
    expect(value[1]?.slicing.links).toEqual([24, 48, 72]);
  });
  it('keeps key attributes with the marker they follow and leaves unlinked markers', () => {
    const value = tracks({ markers: [24], links: [24] }, { markers: [24, 30], links: [24] });
    const other = value[1];
    if (!other) throw new Error('Expected a track');
    other.slicing.markerKeys = [{ tick: 24, keys: [3] }];
    applyMarkerEdit(
      value,
      't0',
      { markers: [36], keys: [], target: (tick) => (tick === 24 ? 36 : tick) },
      true,
      anywhere,
    );
    expect(other.slicing.markers).toEqual([30, 36]);
    expect(other.slicing.markerKeys).toEqual([{ tick: 36, keys: [3] }]);
  });
  it('adds one unlinked marker to the link group at its tick', () => {
    const value = tracks(
      { markers: [24], links: [24] },
      { markers: [24], links: [24] },
      { markers: [24], links: [] },
    );
    expect(linkAt(value, 24, ['t2'], anywhere)).toBe(1);
    expect(value.map((track) => track.slicing.links)).toEqual([[24], [24], [24]]);
    // Alone, one marker forms no link.
    const lone = tracks({ markers: [24], links: [] }, { markers: [], links: [] });
    expect(linkAt(lone, 24, ['t0'], anywhere)).toBe(0);
  });
});
