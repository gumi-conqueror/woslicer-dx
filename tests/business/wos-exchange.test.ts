import { expect, it } from 'vitest';
import { createTestApp as setup } from '../support/app';
import { readWos, writeWos } from '@gumi-conqueror/wos-file';
import { projectToWos } from '../../src/project/codec';

it('rejects fractional WOS gate, then saves exact original format and resets undo on load', async () => {
  const f = setup();
  f.workspace.actions.setMarker(5);
  f.editor.setDocumentOptions({ noisegateDb: -48.5 });
  await f.workspace.saveWos();
  expect(f.saved).toHaveLength(0);
  expect(f.editor.isError).toBe(true);
  f.editor.setDocumentOptions({ noisegateDb: -48 });
  await f.workspace.saveWos();
  expect(f.saved[0].bytes).toEqual(writeWos(projectToWos(f.editor.document)));
  expect(readWos(f.saved[0].bytes).markers[5]).toBe(1);
  f.opened = { name: 'saved.wos', bytes: f.saved[0].bytes, reference: null };
  await f.workspace.newProjectFromWos();
  expect(f.editor.canUndo).toBe(false);
  expect(f.editor.ticks).toEqual([5]);
  expect(f.editor.canRedo).toBe(false);
  expect(f.editor.document.media).toEqual([]);
  expect(f.editor.document.tracks).toHaveLength(1);
  expect(f.editor.document.tracks[0]?.clips).toEqual([]);
});
