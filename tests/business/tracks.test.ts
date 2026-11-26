import { expect, it } from 'vitest';
import { createTestApp as setup, audioFile } from '../support/app';

it('adds tracks with their own audio, markers and output names', async () => {
  const f = setup();
  await f.workspace.loadAudio(audioFile('kick.wav'));
  f.workspace.actions.setMarker(24);
  const first = f.editor.track.trackId;
  f.opened = audioFile('snare.wav', 24000);
  await f.run('add-track');
  expect(f.editor.document.tracks.map((track) => track.name)).toEqual(['kick', 'snare']);
  expect(f.editor.track.name).toBe('snare');
  expect(f.editor.baseName).toBe('snare');
  expect(f.editor.source?.length).toBe(24000);
  // The new track starts without markers; the first track keeps its own.
  expect(f.editor.ticks).toEqual([]);
  f.workspace.actions.setMarker(48);
  await f.run('previous-track');
  expect(f.editor.track.trackId).toBe(first);
  expect(f.editor.ticks).toEqual([24]);
  expect(f.editor.source?.length).toBe(48000);
  await f.run('next-track');
  expect(f.editor.ticks).toEqual([48]);
  expect(f.editor.document.name).toBe('kick');
});

it('removes the current track in one undoable step and keeps the last track', async () => {
  const f = setup();
  await f.run('remove-track');
  expect(f.editor.isError).toBe(true);
  expect(f.editor.document.tracks).toHaveLength(1);
  await f.workspace.loadAudio(audioFile('kick.wav'));
  f.opened = audioFile('snare.wav', 24000);
  await f.run('add-track');
  const snare = f.editor.track.trackId;
  await f.run('remove-track');
  expect(f.editor.document.tracks.map((track) => track.name)).toEqual(['kick']);
  expect(f.editor.track.name).toBe('kick');
  // Undo restores the track with its decoded audio.
  await f.run('undo');
  expect(f.editor.document.tracks.map((track) => track.name)).toEqual(['kick', 'snare']);
  f.editor.selectTrack(snare);
  expect(f.editor.source?.length).toBe(24000);
});

it('replaces only the current track audio in a multi-track project', async () => {
  const f = setup();
  await f.workspace.loadAudio(audioFile('kick.wav'));
  f.opened = audioFile('snare.wav', 24000);
  await f.run('add-track');
  f.workspace.actions.setMarker(12);
  await f.workspace.loadAudio(audioFile('clap.wav', 12000));
  expect(f.editor.document.tracks.map((track) => track.name)).toEqual(['kick', 'clap']);
  expect(f.editor.document.name).toBe('kick');
  expect(f.editor.ticks).toEqual([12]);
  expect(f.editor.source?.length).toBe(12000);
  await f.run('undo');
  expect(f.editor.track.name).toBe('snare');
});

it('renames a track and ignores a blank name', () => {
  const f = setup();
  const id = f.editor.track.trackId;
  f.editor.renameTrack(id, '  Bass  ');
  expect(f.editor.track.name).toBe('Bass');
  f.editor.renameTrack(id, '   ');
  expect(f.editor.track.name).toBe('Bass');
  f.workspace.actions.undo();
  expect(f.editor.track.name).toBe('Untitled');
});
