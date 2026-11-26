import { expect, it } from 'vitest';
import { createTestApp as setup, audioFile, processorEngine } from '../support/app';

it('refuses re-entrant detection and export while their busy flags hold', async () => {
  const f = setup();
  await f.workspace.loadAudio(audioFile());
  f.workspace.actions.setMarker(12);
  let complete: (() => void) | undefined;
  let started = 0;
  f.platform.exportFiles = () => {
    started++;
    return new Promise((resolve) => {
      complete = () => resolve(1);
    });
  };
  const exporting = f.workspace.exportAll();
  expect(f.editor.exportLock).toBe(true);
  await f.workspace.exportAll(); // re-entry is a no-op while the first export holds
  expect(started).toBe(1);
  if (!complete) throw new Error('Expected a pending export');
  complete();
  await exporting;
  expect(f.editor.exportLock).toBe(false);
});

it('exports an empty slice for a marker at the source end and skips later markers', async () => {
  const f = setup();
  // 48000 frames at 120 BPM: 500 frames per tick, so tick 96 is the source end.
  await f.workspace.loadAudio(audioFile());
  f.editor.setNoisegateEnabled(false);
  f.editor.addTicks([0, 48, 96, 120]);
  await f.workspace.exportAll();
  expect(f.exported.map((file) => file.name)).toEqual([
    'tone_000.wav',
    'tone_001.wav',
    'tone_002.wav',
  ]);
  expect(f.exported[2].bytes.byteLength).toBe(44);
  expect(f.editor.exportLock).toBe(false);
  expect(f.editor.status.segments.some((segment) => segment.key === 'exportSkippedBeyond')).toBe(
    true,
  );
});

it('stops an old export iterator before it can render from a replacement source', async () => {
  const f = setup();
  await f.workspace.loadAudio(audioFile());
  f.editor.addTicks([0, 48]);
  let continuationRejected = false;
  f.platform.exportFiles = async (files) => {
    const iterator = files[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.done).toBe(false);
    await f.workspace.loadAudio(audioFile('replacement.wav'));
    try {
      await iterator.next();
    } catch {
      continuationRejected = true;
    }
    return 1;
  };
  await f.workspace.exportAll();
  expect(continuationRejected).toBe(true);
  expect(f.editor.source?.name).toBe('replacement');
  expect(f.editor.isError).toBe(false);
});

it('does not render any output when the host cancels destination selection', async () => {
  let renders = 0;
  const f = setup(() => {
    const engine = processorEngine();
    return {
      ...engine,
      async slice(params) {
        renders++;
        return engine.slice(params);
      },
    };
  });
  await f.workspace.loadAudio(audioFile());
  f.workspace.actions.setMarker(0);
  f.platform.exportFiles = () => Promise.resolve(null);
  await f.workspace.exportAll();
  expect(renders).toBe(0);
  expect(f.editor.exportLock).toBe(false);
});
