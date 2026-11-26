import { expect, it } from 'vitest';
import { createTestApp as setup, audioFile, processorEngine } from '../support/app';
import { suggestOnsets } from '../../src/core/audio/onsets';
import { wavFile } from '../support/audio';

it('detects real burst onsets in one undo transaction and preserves legacy edge detection', async () => {
  const f = setup();
  const pcm = new Int16Array(96000);
  for (const start of [12000, 48000, 72000])
    for (let i = start; i < start + 4800; i++) pcm[i] = Math.round(Math.sin(i / 9) * 18000);
  await f.workspace.loadAudio({
    name: 'bursts.wav',
    reference: null,
    bytes: wavFile([pcm], 48000),
  });
  f.editor.bandSnap = false;
  await f.workspace.detect();
  expect(f.editor.ticks.length).toBeGreaterThan(0);
  expect(f.editor.ticks.every(f.editor.legalTick)).toBe(true);
  f.workspace.actions.undo();
  expect(f.editor.ticks).toEqual([]);
  const source = f.editor.source;
  if (!source) throw new Error('Expected source');
  const expected = suggestOnsets({
    channels: source.data,
    timebase: { bpm: 120, shift: 0, sampleRate: 48000 },
    grid: 4,
  }).filter(f.editor.legalTick);
  await f.workspace.edgeDetect();
  expect(f.editor.ticks).toEqual(expected);
  f.workspace.actions.undo();
  expect(f.editor.ticks).toEqual([]);
});

it('ignores late detection results when the time base was edited', async () => {
  let complete:
    | ((value: { ticks: number[]; skippedGap: number; existing: number; onsets: number }) => void)
    | undefined;
  const f = setup(() => ({
    ...processorEngine(),
    detect: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  }));
  await f.workspace.loadAudio(audioFile());
  await f.workspace.ensureBands();
  const detecting = f.workspace.detect();
  await Promise.resolve();
  await Promise.resolve();
  f.editor.setDocumentOptions({ bpm: 180 });
  if (!complete) throw new Error('Expected pending detection');
  complete({ ticks: [24], skippedGap: 0, existing: 0, onsets: 1 });
  await detecting;
  expect(f.editor.ticks).toEqual([]);
  expect(f.editor.bandBusy).toBe(false);
});
