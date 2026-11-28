import { expect, it } from 'vitest';
import { createTestApp as setup, audioFile } from '../support/app';

type App = ReturnType<typeof setup>;
const markers = (f: App) => f.editor.document.tracks.map((track) => track.slicing.markers);
const links = (f: App) => f.editor.document.tracks.map((track) => track.slicing.links ?? []);

/** Two tracks of two seconds each: 192 ticks at 120 BPM. */
async function twoTracks(): Promise<App> {
  const f = setup();
  await f.workspace.loadAudio(audioFile('kick.wav', 96000));
  f.actions.setMarker(24);
  f.opened = audioFile('snare.wav', 96000);
  await f.run('add-track');
  return f;
}

it('shares markers across tracks by default and moves linked markers together', async () => {
  const f = await twoTracks();
  // A new track starts with linked copies of the current track's markers.
  expect(markers(f)).toEqual([[24], [24]]);
  expect(links(f)).toEqual([[24], [24]]);
  expect(f.editor.linkedTicks.has(24)).toBe(true);
  f.editor.setSelectedTicks([24]);
  f.actions.moveSelection(24);
  expect(markers(f)).toEqual([[48], [48]]);
  // New markers go to every track, and removing a linked marker removes it everywhere.
  f.actions.setMarker(96);
  expect(markers(f)).toEqual([
    [48, 96],
    [48, 96],
  ]);
  f.actions.toggleMarker(96);
  expect(markers(f)).toEqual([[48], [48]]);
  // One edit is one undo step on all tracks.
  await f.run('undo');
  expect(markers(f)).toEqual([
    [48, 96],
    [48, 96],
  ]);
});

it('unlinks markers, relinks them only at the same tick and edits single tracks', async () => {
  const f = await twoTracks();
  f.editor.setSelectedTicks([24]);
  await f.run('unlink-markers');
  expect(links(f)).toEqual([[], []]);
  f.actions.moveSelection(24);
  expect(markers(f)).toEqual([[24], [48]]);
  // The other track has no marker at 48, so nothing links.
  await f.run('relink-markers');
  expect(f.editor.status.segments[0]?.key).toBe('markersRelinkNone');
  f.actions.moveSelection(-24);
  await f.run('relink-markers');
  expect(links(f)).toEqual([[24], [24]]);
  // Track markers: edits stay on the current track, and moved markers leave their link.
  await f.run('toggle-shared-markers');
  expect(f.editor.document.global.sharedMarkers).toBe(false);
  f.actions.setMarker(120);
  f.editor.setSelectedTicks([24]);
  f.actions.moveSelection(12);
  expect(markers(f)).toEqual([[24], [36, 120]]);
  expect(links(f)).toEqual([[], []]);
});

it('links markers to all tracks within each track audio', async () => {
  const f = setup();
  await f.workspace.loadAudio(audioFile('kick.wav', 96000));
  await f.run('toggle-shared-markers');
  f.opened = audioFile('short.wav', 24000);
  await f.run('add-track');
  expect(markers(f)).toEqual([[], []]);
  await f.run('previous-track');
  f.actions.setMarker(24);
  f.actions.setMarker(120);
  await f.run('link-markers-all-tracks');
  // The short track ends at tick 48, so only tick 24 is copied.
  expect(markers(f)).toEqual([[24, 120], [24]]);
  expect(links(f)).toEqual([[24], [24]]);
  expect(f.editor.status.segments[0]).toEqual({
    key: 'markersLinked',
    params: { count: 1, tracks: 1 },
  });
});
