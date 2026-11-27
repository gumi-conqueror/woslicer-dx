import { afterEach, expect, it, vi } from 'vitest';
import { watch } from 'vue';
import { audioFile, fixture, processorEngine } from '../support/app';
import { captureEditorSession } from '../../src/workspace/session';
import { encodeProject } from '../../src/project/codec';

const fixtures: ReturnType<typeof fixture>[] = [];
function setup(createEngine = processorEngine) {
  const f = fixture(createEngine);
  fixtures.push(f);
  return f;
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Promise not initialized');
  };
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
afterEach(async () => {
  for (const f of fixtures.splice(0)) await f.dispose();
});

it('shows recovery before storage returns, then media reading and decoding until ready', async () => {
  const original = setup();
  const file = audioFile();
  await original.workspace.loadAudio(file);
  const archive = captureEditorSession(original.editor);
  const storage = deferred<unknown>();
  const reading = deferred<ReturnType<typeof audioFile>>();
  const decoding = deferred<void>();
  const f = setup(() => {
    const engine = processorEngine();
    return {
      ...engine,
      async decode(name, bytes) {
        await decoding.promise;
        return engine.decode(name, bytes);
      },
    };
  });
  f.platform.readSession = () => storage.promise;
  f.platform.reopenFile = () => reading.promise;
  const restore = f.workspace.restoreSession();
  expect(f.workspace.loading.value?.stage).toBe('restoring');
  storage.resolve(archive);
  await vi.waitFor(() =>
    expect(f.workspace.loading.value).toMatchObject({ stage: 'reading', name: 'tone.wav' }),
  );
  reading.resolve(file);
  await vi.waitFor(() =>
    expect(f.workspace.loading.value).toMatchObject({
      stage: 'decoding',
      name: 'tone.wav',
      mediaId: archive.project.tracks[0].media?.mediaId,
    }),
  );
  decoding.resolve();
  await restore;
  expect(f.workspace.loading.value).toBeNull();
  expect(f.editor.source?.length).toBe(48000);
});

it('clears cancelled and failed opens, and does not let an older open hide a newer one', async () => {
  const f = setup();
  const old = deferred<ReturnType<typeof audioFile> | null>();
  const next = deferred<ReturnType<typeof audioFile> | null>();
  f.platform.openFile = () => old.promise;
  const first = f.workspace.openAudio();
  expect(f.workspace.loading.value?.stage).toBe('opening');
  f.platform.openFile = () => next.promise;
  const second = f.workspace.openAudio();
  old.resolve(null);
  await first;
  expect(f.workspace.loading.value?.stage).toBe('opening');
  next.resolve(null);
  await second;
  expect(f.workspace.loading.value).toBeNull();
  f.platform.openFile = () => Promise.reject(new Error('Read failed'));
  await f.workspace.openAudio();
  expect(f.workspace.loading.value).toBeNull();
  expect(f.editor.isError).toBe(true);
});

it('keeps edits made while audio is being read and decoded', async () => {
  const reading = deferred<ReturnType<typeof audioFile>>();
  const decoding = deferred<void>();
  const f = setup(() => {
    const engine = processorEngine();
    return {
      ...engine,
      async decode(name, bytes) {
        await decoding.promise;
        return engine.decode(name, bytes);
      },
    };
  });
  f.platform.openFile = () => reading.promise;
  const opening = f.workspace.openAudio();
  f.editor.setDocumentOptions({ bpm: 175 });
  reading.resolve(audioFile());
  await vi.waitFor(() => expect(f.workspace.loading.value?.stage).toBe('decoding'));
  f.editor.setVolume(0.5);
  f.editor.setTicks([12, 24]);
  decoding.resolve();
  await opening;
  expect(f.editor.source?.name).toBe('tone');
  expect(f.editor.doc.bpm).toBe(175);
  expect(f.editor.volume).toBeCloseTo(0.5);
  expect(f.editor.ticks).toEqual([12, 24]);
  expect(f.editor.isDirty).toBe(true);
  expect(f.editor.isError).toBe(false);
  expect(f.workspace.loading.value).toBeNull();
});

it.each(['project', 'recovery'] as const)(
  'keeps edits and undo history while %s media is read and decoded',
  async (mode) => {
    const original = setup();
    const file = { ...audioFile(), absolutePath: 'C:/Audio/tone.wav' };
    await original.workspace.loadAudio(file);
    const reading = deferred<ReturnType<typeof audioFile>>();
    const decoding = deferred<void>();
    const f = setup(() => {
      const engine = processorEngine();
      return {
        ...engine,
        async decode(name, bytes) {
          await decoding.promise;
          return engine.decode(name, bytes);
        },
      };
    });
    f.opened = {
      name: 'project.wosdx',
      reference: 'project-grant',
      bytes: encodeProject(original.editor.document),
    };
    f.session = captureEditorSession(original.editor);
    f.platform.openProjectMedia = () => reading.promise;
    f.platform.reopenFile = () => reading.promise;
    const opening = mode === 'project' ? f.workspace.openProject() : f.workspace.restoreSession();
    await vi.waitFor(() => expect(f.workspace.loading.value?.stage).toBe('reading'));
    f.editor.setDocumentOptions({ bpm: 175 });
    reading.resolve(file);
    await vi.waitFor(() => expect(f.workspace.loading.value?.stage).toBe('decoding'));
    f.editor.setTicks([12, 24]);
    decoding.resolve();
    await opening;
    expect(f.editor.source?.name).toBe('tone');
    expect(f.editor.doc.bpm).toBe(175);
    expect(f.editor.ticks).toEqual([12, 24]);
    expect(f.editor.isDirty).toBe(true);
    expect(f.editor.isError).toBe(false);
    expect(f.editor.undo()).toBe(true);
    expect(f.editor.ticks).toEqual([]);
    expect(f.editor.doc.bpm).toBe(175);
    expect(f.workspace.loading.value).toBeNull();
  },
);

it('keeps missing project media editable and cancels a pending media read when closing', async () => {
  const f = setup();
  await f.workspace.loadAudio({ ...audioFile(), absolutePath: 'C:/Audio/tone.wav' });
  f.opened = {
    name: 'project.wosdx',
    reference: 'project-grant',
    bytes: encodeProject(f.editor.document),
  };
  f.platform.openProjectMedia = () => Promise.reject(new Error('File moved'));
  await f.workspace.openProject();
  expect(f.editor.source).toBeNull();
  expect(f.editor.status.segments[0]?.key).toBe('projectMediaMissing');
  expect(f.workspace.loading.value).toBeNull();
  const reading = deferred<ReturnType<typeof audioFile>>();
  f.platform.openProjectMedia = () => reading.promise;
  const opening = f.workspace.openProject();
  await vi.waitFor(() => expect(f.workspace.loading.value?.stage).toBe('reading'));
  await f.workspace.reset();
  expect(f.workspace.loading.value).toBeNull();
  reading.resolve(audioFile());
  await opening;
  expect(f.editor.source).toBeNull();
  expect(f.editor.document.tracks[0].media).toBeNull();
});

it('reports the declared audio length before the decoded audio arrives', async () => {
  const f = setup();
  const reports: unknown[] = [];
  const stop = watch(
    () => f.workspace.loading.value?.audio,
    (audio) => reports.push(audio),
    { flush: 'sync' },
  );
  await f.workspace.loadAudio(audioFile('tone.wav', 24000));
  stop();
  // The WAV header declares 24000 frames at 48 kHz before any frame is decoded.
  expect(reports[0]).toEqual({ sampleRate: 48000, frames: 24000, decoded: 0 });
  expect(f.workspace.loading.value).toBeNull();
});
