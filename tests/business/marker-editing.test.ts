import { expect, it } from 'vitest';
import { createTestApp as setup, audioFile } from '../support/app';

it('commits parameters, output recipe and cuts as one operation and leaves no-op history untouched', () => {
  const { editor, actions } = setup();
  const original = editor.document;
  const revision = editor.docRevision;
  editor.transact((draft) => {
    draft.timing.bpm = 160;
    draft.tracks[0].slicing.markers = [24, 48];
    draft.tracks[0].slicing.noisegateEnabled = false;
    draft.tracks[0].output.baseName = 'recording';
  });
  expect(editor.docRevision).toBe(revision + 1);
  expect(editor.doc.bpm).toBe(160);
  expect(editor.baseName).toBe('recording');
  actions.undo();
  expect(editor.document).toEqual(original);
  expect(editor.canUndo).toBe(false);
  const undoneRevision = editor.docRevision;
  editor.setDocumentOptions({ bpm: 120 });
  editor.setTicks([]);
  expect(editor.docRevision).toBe(undoneRevision);
  expect(editor.canRedo).toBe(true);
  actions.redo();
  expect(editor.ticks).toEqual([24, 48]);
  expect(editor.noisegateEnabled).toBe(false);
});

it('keeps redo after a marker command that changes nothing', () => {
  const { editor, actions } = setup();
  actions.setMarker(24);
  actions.undo();
  actions.measureCut();
  expect(editor.canUndo).toBe(false);
  expect(editor.canRedo).toBe(true);
  actions.redo();
  expect(editor.ticks).toEqual([24]);
});

it('uses group clipboard collision checks and a single undo entry for quantize', () => {
  const { editor, actions } = setup();
  editor.addTicks([10, 34, 100]);
  editor.setSelectedTicks([10, 34]);
  actions.copySelection();
  editor.setCursorTick(100);
  expect(actions.pasteSelection()).toBe(false);
  editor.setCursorTick(150);
  expect(actions.pasteSelection()).toBe(true);
  expect(editor.selectedTicks).toEqual([150, 174]);
  actions.undo();
  expect(editor.ticks).toEqual([10, 34, 100]);
  editor.setSelectedTicks([10, 34]);
  actions.quantizeSelection();
  expect(editor.ticks).toEqual([0, 24, 100]);
  actions.undo();
  expect(editor.ticks).toEqual([10, 34, 100]);
});

it('rejects entire quantize/paste groups beyond EOF without altering undo history', async () => {
  const { editor, workspace, actions } = setup();
  await workspace.loadAudio(audioFile('short.wav', 22000));
  actions.setMarker(43);
  editor.setSelectedTicks([43]);
  const before = editor.ticks;
  expect(actions.quantizeSelection()).toBe(false);
  expect(editor.ticks).toEqual(before);
  actions.copySelection();
  editor.setCursorTick(46);
  expect(actions.pasteSelection()).toBe(false);
  actions.undo();
  expect(editor.ticks).toEqual([]);
});

it('moves selected markers by command no further than the source end', async () => {
  const f = setup();
  // 48000 frames at 120 BPM: 500 frames per tick, so tick 96 is the source end.
  await f.workspace.loadAudio(audioFile());
  f.editor.setTicks([0, 90]);
  f.editor.setSelectedTicks([0, 90]);
  expect(f.actions.moveSelection(10)).toBe(6);
  expect(f.editor.ticks).toEqual([6, 96]);
});

it('finds both clipboards empty after the project is closed', async () => {
  const { editor, workspace, actions } = setup();
  editor.addTicks([10, 34]);
  editor.setSelectedTicks([10, 34]);
  actions.copySelection();
  actions.measureCopy();
  await workspace.reset();
  editor.setCursorTick(200);
  expect(actions.pasteSelection()).toBe(false);
  expect(editor.status.segments[0]?.key).toBe('pasteClipboardEmpty');
  expect(actions.measurePaste()).toBe(false);
  expect(editor.ticks).toEqual([]);
});

it('copies and cuts a measure by command and pastes it into the measure of the cursor', async () => {
  const f = setup();
  f.editor.addTicks([10, 100, 200]);
  await f.run('measure-copy');
  expect(f.editor.status.segments[0]).toMatchObject({
    key: 'copiedMeasure',
    params: { measure: 1 },
  });
  f.editor.setCursorTick(384);
  await f.run('measure-paste');
  expect(f.editor.ticks).toEqual([10, 100, 200, 394, 484]);
  expect(f.editor.status.segments[0]).toMatchObject({
    key: 'pastedMeasure',
    params: { measure: 3 },
  });
  await f.run('measure-cut');
  expect(f.editor.ticks).toEqual([10, 100, 200]);
  expect(f.editor.status.segments[0]).toMatchObject({ key: 'cutMeasure', params: { measure: 3 } });
});

it('reports an empty measure clipboard when nothing was copied', async () => {
  const f = setup();
  await f.run('measure-paste');
  expect(f.editor.status.segments[0]?.key).toBe('measureClipboardEmpty');
  expect(f.editor.isError).toBe(true);
});
