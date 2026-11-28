import { expect, it, vi } from 'vitest';
import { createTestApp as setup } from '../support/app';
import { restoredSession as parseEditorSession } from '../support/app';
import { createEmptyProject, encodeProject } from '../../src/project/codec';
import { createTimelineGestures } from '../../src/timeline/gestures';
import { handleKeyDown } from '../../src/input/keyboard';

it('cancels an active paint gesture when the project is replaced mid-stroke', async () => {
  vi.useFakeTimers();
  const f = setup();
  f.editor.pxPerTick = 1;
  f.actions.setMarker(0);
  const gestures = createTimelineGestures(f.editor);
  try {
    await f.workspace.flushSession();
    const point = { x: 48, y: 10, button: 0, altKey: false, shiftKey: false, ctrlKey: false };
    gestures.begin(point);
    gestures.move({ ...point, x: 120 });
    expect(f.editor.previewTicks).not.toBeNull();
    f.opened = {
      name: 'empty.wosdx',
      reference: null,
      bytes: encodeProject(createEmptyProject('replacement')),
    };
    await f.workspace.openProject();
    expect(f.editor.previewTicks).toBeNull();
    gestures.end({ ...point, x: 120 });
    expect(f.editor.document.projectId).toBe('replacement');
    expect(f.editor.ticks).toEqual([]);
    expect(f.editor.canUndo).toBe(false);
  } finally {
    gestures.dispose();
    vi.useRealTimers();
  }
});

it.each([false, true])(
  'cancels a paint draft before a real keyboard command (undo=%s)',
  async (ctrlKey) => {
    const f = setup();
    f.editor.pxPerTick = 1;
    f.actions.setMarker(0);
    const gestures = createTimelineGestures(f.editor);
    const point = { x: 48, y: 10, button: 0, altKey: false, shiftKey: false, ctrlKey: false };
    gestures.begin(point);
    gestures.move({ ...point, x: 120 });
    f.editor.setCursorTick(200);
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey, cancelable: true });
    handleKeyDown(event, 'edit', f.commands);
    await Promise.resolve();
    expect(event.defaultPrevented).toBe(true);
    expect(f.editor.previewTicks).toBeNull();
    gestures.end({ ...point, x: 120 });
    expect(f.editor.ticks).toEqual(ctrlKey ? [] : [0, 200]);
    if (ctrlKey) {
      f.actions.redo();
      expect(f.editor.ticks).toEqual([0]);
    } else {
      f.actions.undo();
      expect(f.editor.ticks).toEqual([0]);
    }
    gestures.dispose();
  },
);

it('autosaves only committed cuts while a pointer stroke remains active', async () => {
  vi.useFakeTimers();
  const f = setup();
  f.editor.pxPerTick = 1;
  f.actions.setMarker(0);
  const gestures = createTimelineGestures(f.editor);
  try {
    await f.workspace.flushSession();
    const revision = f.editor.docRevision;
    const point = { x: 48, y: 10, button: 0, altKey: false, shiftKey: false, ctrlKey: false };
    gestures.begin(point);
    gestures.move({ ...point, x: 120 });
    expect(f.editor.previewTicks).toEqual([0, 48, 72, 96, 120]);
    await vi.advanceTimersByTimeAsync(650);
    expect(parseEditorSession(f.session)?.project.tracks[0].slicing.markers).toEqual([0]);
    expect(f.editor.docRevision).toBe(revision);
    gestures.cancel();
    await f.workspace.flushSession();
    expect(parseEditorSession(f.session)?.project.tracks[0].slicing.markers).toEqual([0]);
    f.actions.undo();
    expect(f.editor.ticks).toEqual([]);
    expect(f.editor.canUndo).toBe(false);
  } finally {
    gestures.dispose();
    vi.useRealTimers();
  }
});
