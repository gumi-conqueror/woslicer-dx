import { expect, it } from 'vitest';
import { createTestApp as setup } from '../support/app';

it('imports BMSE cuts as one undo operation and preserves the clip numbering text', async () => {
  const f = setup();
  f.actions.setMarker(0);
  f.actions.setMarker(24);
  f.editor.setOutputOptions({ clipStartNumber: 16, useFfNumbering: true });
  await f.workspace.bmseOut();
  expect(await f.platform.readClipboard()).toContain('1010000000036');
  f.actions.clearMarkers();
  await f.workspace.bmseIn();
  expect(f.editor.ticks).toEqual([0, 24]);
  f.actions.undo();
  expect(f.editor.ticks).toEqual([]);
});
