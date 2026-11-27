import { expect, it, vi } from 'vitest';
import { createTestApp as setup, audioFile } from '../support/app';

it('keeps the cursor in the middle of the view when keys or a controller move it', async () => {
  const f = setup();
  // Two seconds at 120 BPM: 192 ticks of audio and a 384-tick timeline.
  await f.workspace.loadAudio(audioFile('kick.wav', 96000));
  f.editor.viewportWidth = 600;
  f.editor.pxPerTick = 6;
  // The view is 100 ticks wide, so the cursor at tick 192 puts the view at tick 142.
  // The view glides there over a few frames.
  await f.run('cursor-next-measure');
  expect(f.editor.cursorTick).toBe(192);
  expect(f.editor.scrollTick).toBeLessThan(142);
  await vi.waitFor(() => expect(f.editor.scrollTick).toBe(142));
  // At the start of the timeline the view cannot center the cursor and stays at 0.
  await f.run('cursor-previous-measure');
  await vi.waitFor(() => expect(f.editor.scrollTick).toBe(0));
  // A pointer click sets the cursor without scrolling.
  f.editor.setCursorTick(300);
  expect(f.editor.scrollTick).toBe(0);
  // Held moves stop at the end of the 384-tick timeline.
  for (let step = 0; step < 10; step++) await f.run('cursor-next-measure');
  expect(f.editor.cursorTick).toBe(384);
});
