import { expect, it, vi } from 'vitest';
import { audioFile, createTestApp as setup, processorEngine } from '../support/app';

// The status bar names the action that failed. Each case fails one action at
// the platform or at the audio engine.

it('names a failed project save', async () => {
  const f = setup();
  vi.spyOn(f.platform, 'saveFile').mockRejectedValue(new Error('disk full'));
  await f.workspace.saveProject();
  expect(f.editor.status.segments[0]).toMatchObject({
    key: 'projectSaveFailed',
    params: { message: 'disk full' },
  });
  expect(f.editor.isError).toBe(true);
});

it('names a failed BMSE clipboard write', async () => {
  const f = setup();
  f.actions.setMarker(0);
  vi.spyOn(f.platform, 'writeClipboard').mockRejectedValue(new Error('denied'));
  await f.interop.bmseOut();
  expect(f.editor.status.segments[0]).toMatchObject({
    key: 'bmseWriteFailed',
    params: { message: 'denied' },
  });
});

it('names a failed detection', async () => {
  const f = setup(() => ({
    ...processorEngine(),
    edges: () => Promise.reject(new Error('worker stopped')),
  }));
  await f.workspace.loadAudio(audioFile());
  await f.detection.edgeDetect();
  expect(f.editor.status.segments[0]).toMatchObject({
    key: 'detectionFailed',
    params: { message: 'worker stopped' },
  });
});
