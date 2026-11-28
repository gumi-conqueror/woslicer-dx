import { expect, it, vi } from 'vitest';
import { isReactive } from 'vue';
import { createTestApp as setup, audioFile, processorEngine } from '../support/app';
import type { DecodedAudio } from '../../src/audio/audio-jobs';

it('decodes PCM, builds peaks, keeps buffers raw, and keeps cuts when changing audio', async () => {
  const { editor, workspace, actions } = setup();
  actions.setMarker(24);
  await workspace.loadAudio(audioFile());
  expect(editor.source?.sampleRate).toBe(48000);
  expect(editor.peaks).not.toBeNull();
  expect(editor.phase.kind).toBe('ready');
  expect(isReactive(editor.source)).toBe(false);
  expect(isReactive(editor.doc)).toBe(false);
  await workspace.loadAudio(audioFile('other.wav'));
  expect(editor.ticks).toEqual([24]);
  expect(editor.baseName).toBe('other');
});

it('does not let a late decode resurrect audio after reset', async () => {
  let complete: ((result: DecodedAudio) => void) | undefined;
  const result = await processorEngine().decode('tone.wav', audioFile().bytes);
  const f = setup(() => ({
    ...processorEngine(),
    decode: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  }));
  const loading = f.workspace.loadAudio(audioFile());
  expect(f.editor.phase.kind).toBe('loading');
  await vi.waitFor(() => expect(complete).toBeDefined());
  await f.workspace.reset();
  if (!complete) throw new Error('Expected pending decode');
  complete(result);
  await loading;
  expect(f.editor.source).toBeNull();
  expect(f.editor.phase.kind).toBe('empty');
  expect(f.session).toBeNull();
  await f.workspace.flushSession();
  expect(f.session).toBeNull();
});
