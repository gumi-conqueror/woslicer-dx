import { expect, it } from 'vitest';
import { createTestApp as setup } from '../support/app';

it('keeps playback properties in document history with one transaction per change', () => {
  const { editor, workspace } = setup();
  editor.setDocumentOptions({ bpm: 160, fadeoutMs: 40 });
  editor.setVolume(0.2);
  expect(editor.isDirty).toBe(true);
  expect(workspace.actions.undo()).toBe(true);
  expect(editor.doc.bpm).toBe(160);
  expect(editor.doc.fadeoutMs).toBe(40);
  expect(editor.volume).toBeCloseTo(Math.pow(10, -10 / 20), 12);
  workspace.actions.undo();
  expect(editor.doc.bpm).toBe(120);
  expect(editor.doc.fadeoutMs).toBe(0);
});
