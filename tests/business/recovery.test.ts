import { expect, it, vi } from 'vitest';
import { createTestApp as setup, audioFile } from '../support/app';
import { captureEditorSession, readEditorSession } from '../../src/workspace/session';
import { restoredSession as parseEditorSession } from '../support/app';

it('restores versioned sessions and custom export prefix without persisting dropped bytes', async () => {
  const f = setup(),
    file = audioFile();
  await f.workspace.loadAudio(file);
  f.editor.setOutputOptions({ baseName: 'custom' });
  f.workspace.actions.setMarker(20);
  await f.workspace.flushSession();
  const session = f.session;
  expect(parseEditorSession(session)?.version).toBe(3);
  const restored = setup();
  restored.session = session;
  restored.opened = file;
  await restored.workspace.restoreSession();
  expect(restored.editor.baseName).toBe('custom');
  expect(restored.editor.ticks).toEqual([20]);
  expect(restored.editor.source?.reference).toBe(file.reference);
  expect(restored.editor.canUndo).toBe(false);
  expect(restored.editor.canRedo).toBe(false);
  await f.workspace.loadAudio({ ...file, reference: null });
  expect(captureEditorSession(f.editor).lastFile).toBeNull();
  expect(JSON.stringify(captureEditorSession(f.editor))).not.toContain('floatData');
});

it('rejects unsupported session versions and invalid numeric document inputs', () => {
  const f = setup(),
    s = captureEditorSession(f.editor);
  expect(parseEditorSession({ ...s, version: 99 })).toBeNull();
  expect(
    parseEditorSession({ ...s, project: { ...s.project, timing: { bpm: 0, shiftTicks: 0 } } }),
  ).toBeNull();
  expect(
    parseEditorSession({
      ...s,
      project: {
        ...s.project,
        tracks: [
          {
            ...s.project.tracks[0],
            slicing: { ...s.project.tracks[0].slicing, markers: [0, 0, -1] },
          },
        ],
      },
    }),
  ).toBeNull();
  const parsed = parseEditorSession({ ...s, state: { view: { grid: 7, snap: false } } });
  expect(parsed?.state.view.grid).toBeUndefined();
  expect(parsed?.state.view.snap).toBe(false);
});

it('keeps recovery data of an earlier version unchanged instead of reading it', async () => {
  const f = setup();
  const earlier = {
    version: 2,
    dirty: true,
    options: {},
    project: captureEditorSession(f.editor).project,
  };
  f.session = earlier;
  await f.workspace.restoreSession();
  expect(f.editor.status.segments[0]?.key).toBe('sessionRecoverInvalid');
  f.workspace.actions.setMarker(5);
  await f.workspace.flushSession();
  expect(f.session).toBe(earlier);
});

it('keeps the last-file binding when reopening fails so the next archive still carries it', async () => {
  const f = setup();
  const file = audioFile();
  await f.workspace.loadAudio(file);
  f.editor.setDocumentOptions({ bpm: 150 });
  await f.workspace.flushSession();
  const snapshot = f.session;
  expect(parseEditorSession(snapshot)?.lastFile).toEqual({
    reference: file.reference,
    name: 'tone',
  });
  const restored = setup();
  restored.session = JSON.parse(JSON.stringify(snapshot));
  restored.platform.reopenFile = () => Promise.reject(new Error('Missing source'));
  await restored.workspace.restoreSession();
  expect(restored.editor.source).toBeNull();
  expect(restored.editor.isError).toBe(true);
  expect(restored.editor.doc.bpm).toBe(150);
  restored.editor.setTicks([1]);
  await restored.workspace.flushSession();
  expect(parseEditorSession(restored.session)?.lastFile).toEqual({
    reference: file.reference,
    name: 'tone',
  });
});

it('rebuilds audio from the binding without resetting project identity or dirty state', async () => {
  const f = setup();
  const file = audioFile();
  await f.workspace.loadAudio(file);
  const projectId = f.editor.document.projectId;
  f.editor.setDocumentOptions({ bpm: 150 });
  const snapshot = captureEditorSession(f.editor);
  const restored = setup();
  restored.session = JSON.parse(JSON.stringify(snapshot));
  restored.opened = file;
  await restored.workspace.restoreSession();
  expect(restored.editor.source?.reference).toBe(file.reference);
  expect(restored.editor.document.projectId).toBe(projectId);
  expect(restored.editor.document.tracks[0].media).toEqual(snapshot.project.tracks[0].media);
  expect(restored.editor.isDirty).toBe(true);
  expect(restored.editor.canUndo).toBe(false);
  expect(restored.editor.lastFile).toEqual({ reference: file.reference, name: 'tone' });
});

it('restores the entire committed project and independent session controls with fresh history', async () => {
  const f = setup();
  f.editor.transact((draft) => {
    draft.name = 'Recovery';
    draft.tracks[0].slicing.markers = [12];
    draft.tracks[0].output.baseName = 'custom';
    draft.tracks[0].media = {
      mediaId: 'm1',
      name: 'missing.wav',
      format: 'wav',
      byteLength: 1000,
      sampleRateHz: 48000,
      channels: 1,
      framesPerChannel: 400,
      integrity: null,
      originHint: null,
    };
    const track = draft.tracks[0];
    if (!track) throw new Error('Missing default track');
    track.clips = [
      {
        clipId: 'c1',
        mediaId: 'm1',
        timelineStartSeconds: 0,
        sourceOffsetFrames: 0,
        frameCount: 400,
      },
    ];
    draft.bmhelper = {
      format: 'bmhelper',
      source: { quantize: 480, notes: [], pitches: [], controls: [] },
      divisions: [],
    };
  });
  f.editor.setSelectedTicks([12]);
  f.editor.setCursorTick(12);
  f.editor.scrollTick = 4;
  f.editor.rmsVisible = true;
  f.editor.volume = 0.2;
  f.editor.playbackRate = 0.5;
  const snapshot = captureEditorSession(f.editor);
  f.editor.setTicks([24]);
  expect(snapshot.project.tracks[0].slicing.markers).toEqual([12]);
  const restored = setup();
  restored.session = JSON.parse(JSON.stringify(snapshot));
  await restored.workspace.restoreSession();
  expect(restored.editor.document).toEqual(snapshot.project);
  expect(restored.editor.source).toBeNull();
  expect(restored.editor.canUndo).toBe(false);
  expect(restored.editor.selectedTicks).toEqual([12]);
  expect(restored.editor.cursorTick).toBe(12);
  expect(restored.editor.scrollTick).toBe(4);
  expect(restored.editor.rmsVisible).toBe(true);
  expect(restored.editor.volume).toBeCloseTo(0.2, 12);
  expect(restored.editor.playbackRate).toBe(0.5);
  restored.editor.setDocumentOptions({ bpm: 180 });
  restored.workspace.actions.undo();
  expect(restored.editor.document).toEqual(snapshot.project);
  expect(restored.editor.volume).toBeCloseTo(0.2, 12);
});

it('serializes a reset behind already-running session writes', async () => {
  const f = setup();
  let release: (() => void) | undefined;
  f.platform.writeSession = (value) =>
    new Promise<void>((resolve) => {
      release = () => {
        f.session = value;
        resolve();
      };
    });
  f.workspace.actions.setMarker(5);
  const saving = f.workspace.flushSession();
  await Promise.resolve();
  await Promise.resolve();
  const resetting = f.workspace.reset();
  if (!release) throw new Error('Expected pending write');
  release();
  await saving;
  await resetting;
  expect(f.session).toBeNull();
  expect(f.editor.ticks).toEqual([]);
});

it('reports a failed recovery write and retries the same content without new edits', async () => {
  vi.useFakeTimers();
  const f = setup();
  let attempts = 0;
  let failing = true;
  f.platform.writeSession = (value) => {
    attempts++;
    if (failing) return Promise.reject(new Error('storage unavailable'));
    f.session = value;
    return Promise.resolve();
  };
  try {
    f.workspace.actions.setMarker(5);
    await vi.advanceTimersByTimeAsync(650);
    expect(attempts).toBe(1);
    expect(f.session).toBeNull();
    expect(f.editor.status.segments.some((segment) => segment.key === 'sessionSaveFailed')).toBe(
      true,
    );
    failing = false;
    await f.workspace.flushSession();
    expect(attempts).toBe(2);
    expect(parseEditorSession(f.session)?.project.tracks[0].slicing.markers).toEqual([5]);
  } finally {
    vi.useRealTimers();
  }
});

it('keeps edits made during a failed write pending and retries the newest snapshot', async () => {
  const f = setup();
  let attempts = 0;
  let failing = true;
  f.platform.writeSession = (value) => {
    attempts++;
    if (failing) return Promise.reject(new Error('write rejected'));
    f.session = value;
    return Promise.resolve();
  };
  f.workspace.actions.setMarker(5);
  const first = f.workspace.flushSession();
  await Promise.resolve();
  await Promise.resolve();
  f.editor.setDocumentOptions({ bpm: 200 });
  await expect(first).rejects.toThrow('write rejected');
  expect(f.session).toBeNull();
  expect(attempts).toBe(1);
  failing = false;
  await f.workspace.flushSession();
  expect(parseEditorSession(f.session)?.project.tracks[0].slicing.markers).toEqual([5]);
  expect(parseEditorSession(f.session)?.project.timing.bpm).toBe(200);
});

it('propagates an in-flight recovery failure to a second flush during exit', async () => {
  const f = setup();
  let rejectWrite: (error: Error) => void = () => {};
  f.platform.writeSession = () =>
    new Promise<void>((_resolve, reject) => {
      rejectWrite = reject;
    });
  f.workspace.actions.setMarker(5);
  const autosave = f.workspace.flushSession();
  await Promise.resolve();
  const exitSave = f.workspace.flushSession();
  const expectedAutosave = expect(autosave).rejects.toThrow('storage unavailable');
  const expectedExit = expect(exitSave).rejects.toThrow('storage unavailable');
  rejectWrite(new Error('storage unavailable'));
  try {
    await expectedAutosave;
    await expectedExit;
  } finally {
    f.platform.writeSession = async () => {};
  }
});

it('keeps newer edits pending when an older write settles first', async () => {
  const f = setup();
  let release: (() => void) | undefined;
  let subsequent = false;
  f.platform.writeSession = (value) =>
    new Promise<void>((resolve) => {
      if (subsequent) {
        f.session = value;
        resolve();
        return;
      }
      release = () => {
        f.session = value;
        resolve();
      };
    });
  f.workspace.actions.setMarker(5);
  const saving = f.workspace.flushSession();
  await Promise.resolve();
  await Promise.resolve();
  f.editor.setDocumentOptions({ bpm: 200 });
  if (!release) throw new Error('Expected pending write');
  release();
  await saving;
  expect(parseEditorSession(f.session)?.project.tracks[0].slicing.markers).toEqual([5]);
  subsequent = true;
  await f.workspace.flushSession();
  expect(parseEditorSession(f.session)?.project.timing.bpm).toBe(200);
});

it('surfaces a failing final write from dispose instead of reporting success', async () => {
  const f = setup();
  f.platform.writeSession = () => Promise.reject(new Error('gone'));
  f.workspace.actions.setMarker(3);
  await expect(f.workspace.dispose()).rejects.toThrow('gone');
  expect(f.editor.status.segments.some((segment) => segment.key === 'sessionSaveFailed')).toBe(
    true,
  );
});

it('classifies recovery reads as absent, restored, damaged or future without reinterpretation', () => {
  expect(readEditorSession(null)).toEqual({ kind: 'absent' });
  expect(readEditorSession(undefined)).toEqual({ kind: 'absent' });
  expect(readEditorSession('junk')).toEqual({ kind: 'invalid', raw: 'junk' });
  const f = setup();
  const valid = captureEditorSession(f.editor);
  const restored = readEditorSession(JSON.parse(JSON.stringify(valid)));
  expect(restored.kind).toBe('restored');
  if (restored.kind === 'restored') expect(restored.session.project).toEqual(valid.project);
  const future = { version: 4, note: 'newer' };
  expect(readEditorSession(future)).toEqual({ kind: 'future', raw: future, version: 4 });
  const damaged = { version: 3, project: { timing: { bpm: 0, shiftTicks: 0 } } };
  const read = readEditorSession(damaged);
  expect(read.kind).toBe('invalid');
  if (read.kind === 'invalid') expect(read.raw).toBe(damaged);
});

it('keeps a damaged recovery record unchanged and pauses recovery writes', async () => {
  const f = setup();
  const raw = { version: 3, project: { timing: { bpm: 0, shiftTicks: 0 } } };
  f.session = raw;
  await f.workspace.restoreSession();
  expect(f.editor.status.segments.some((segment) => segment.key === 'sessionRecoverInvalid')).toBe(
    true,
  );
  expect(f.editor.ticks).toEqual([]);
  expect(f.editor.canUndo).toBe(false);
  const write = vi.spyOn(f.platform, 'writeSession');
  f.workspace.actions.setMarker(5);
  await f.workspace.flushSession();
  expect(write).not.toHaveBeenCalled();
  expect(f.session).toBe(raw);
});

it('keeps a future recovery record with its version visible and recovery paused', async () => {
  const f = setup();
  const raw = { version: 7, project: {} };
  f.session = raw;
  await f.workspace.restoreSession();
  expect(
    f.editor.status.segments.some(
      (segment) => segment.key === 'sessionRecoverFuture' && segment.params?.version === 7,
    ),
  ).toBe(true);
  f.editor.setDocumentOptions({ bpm: 200 });
  await f.workspace.flushSession();
  expect(f.session).toBe(raw);
});

it('keeps recovery paused when the recovery record cannot be read', async () => {
  const f = setup();
  f.platform.readSession = () => Promise.reject(new Error('storage busy'));
  const write = vi.spyOn(f.platform, 'writeSession');
  await f.workspace.restoreSession();
  expect(
    f.editor.status.segments.some(
      (segment) =>
        segment.key === 'sessionRecoverReadFailed' && segment.params?.message === 'storage busy',
    ),
  ).toBe(true);
  f.workspace.actions.setMarker(5);
  await f.workspace.flushSession();
  expect(write).not.toHaveBeenCalled();
  expect(f.session).toBeNull();
});

it('opens content over a blocked record only after explicit confirmation', async () => {
  const f = setup();
  const raw = { version: 3, project: { timing: { bpm: 0, shiftTicks: 0 } } };
  f.session = raw;
  await f.workspace.restoreSession();
  const openFile = vi.spyOn(f.platform, 'openFile');
  await f.workspace.openAudio();
  expect(openFile).not.toHaveBeenCalled();
  expect(f.session).toBe(raw);
  f.confirmOptions.confirmDiscardRecovery = () => Promise.resolve(false);
  await f.workspace.openAudio();
  expect(openFile).not.toHaveBeenCalled();
  expect(f.session).toBe(raw);
  f.confirmOptions.confirmDiscardRecovery = () => Promise.resolve(true);
  f.opened = audioFile();
  await f.workspace.openAudio();
  expect(f.editor.source?.name).toBe('tone');
  await f.workspace.flushSession();
  expect(f.session).not.toBe(raw);
  expect(parseEditorSession(f.session)).not.toBeNull();
});

it('lets an explicit close discard a blocked record and resume archiving', async () => {
  const f = setup();
  const raw = { version: 3, project: { timing: { bpm: 0, shiftTicks: 0 } } };
  f.session = raw;
  await f.workspace.restoreSession();
  const confirm = vi.fn(() => Promise.resolve(false));
  f.confirmOptions.confirmDiscardRecovery = confirm;
  await f.workspace.reset();
  expect(confirm).not.toHaveBeenCalled();
  expect(f.session).toBeNull();
  f.workspace.actions.setMarker(5);
  await f.workspace.flushSession();
  expect(parseEditorSession(f.session)?.project.tracks[0].slicing.markers).toEqual([5]);
});

it('keeps a reset archive empty when an older restore returns later', async () => {
  const f = setup();
  let complete: ((value: unknown) => void) | undefined;
  const snapshot = captureEditorSession(f.editor);
  f.platform.readSession = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  const restoring = f.workspace.restoreSession();
  await f.workspace.reset();
  if (!complete) throw new Error('Expected pending restore');
  complete(snapshot);
  await restoring;
  await f.workspace.flushSession();
  expect(f.session).toBeNull();
  expect(f.editor.source).toBeNull();
});

it('starts archiving later edits after reset without recreating an untouched empty archive', async () => {
  const f = setup();
  await f.workspace.reset();
  await f.workspace.flushSession();
  expect(f.session).toBeNull();
  f.workspace.actions.setMarker(12);
  await f.workspace.flushSession();
  expect(parseEditorSession(f.session)?.project.tracks[0].slicing.markers).toEqual([12]);
});
