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

it('moves the current track in the list and undoes the move', async () => {
  const f = setup();
  await f.workspace.loadAudio(audioFile('kick.wav'));
  f.opened = audioFile('snare.wav', 24000);
  await f.run('add-track');
  const names = () => f.editor.document.tracks.map((track) => track.name);
  await f.run('move-track-up');
  expect(names()).toEqual(['snare', 'kick']);
  expect(f.editor.track.name).toBe('snare');
  await f.run('move-track-up');
  expect(names()).toEqual(['snare', 'kick']);
  await f.run('undo');
  expect(names()).toEqual(['kick', 'snare']);
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

it('restores every track and its audio from recovery data', async () => {
  const f = setup();
  const kick = audioFile('kick.wav'),
    snare = audioFile('snare.wav', 24000);
  await f.workspace.loadAudio(kick);
  f.opened = snare;
  await f.run('add-track');
  await f.workspace.flushSession();
  const restored = setup();
  restored.session = f.session;
  const files = new Map([kick, snare].map((file) => [file.reference, file]));
  restored.platform.reopenFile = (reference) => {
    const file = files.get(reference);
    return file ? Promise.resolve(file) : Promise.reject(new Error('missing'));
  };
  await restored.workspace.restoreSession();
  expect(restored.editor.document.tracks.map((track) => track.name)).toEqual(['kick', 'snare']);
  expect(restored.editor.track.name).toBe('snare');
  expect(restored.editor.source?.length).toBe(24000);
  restored.editor.selectTrack(restored.editor.document.tracks[0]?.trackId ?? '');
  expect(restored.editor.source?.length).toBe(48000);
});

it('exports the slices of every track into one archive and refuses equal file names', async () => {
  const f = setup();
  await f.workspace.loadAudio(audioFile('kick.wav', 96000));
  f.workspace.actions.setMarker(48);
  f.opened = audioFile('snare.wav', 96000);
  await f.run('add-track');
  f.workspace.actions.setMarker(96);
  f.editor.setOutputOptions({ baseName: 'kick' });
  await f.run('export-all-tracks');
  expect(f.editor.isError).toBe(true);
  expect(f.exported).toHaveLength(0);
  f.editor.setOutputOptions({ baseName: 'snare' });
  await f.run('export-all-tracks');
  expect(f.editor.isError).toBe(false);
  expect(f.exported.map((file) => file.name).sort()).toEqual(['kick_000.wav', 'snare_000.wav']);
});
