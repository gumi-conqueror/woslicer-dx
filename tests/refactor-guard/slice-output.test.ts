// Temporary guard for the maintainability refactor (dist/plan/09, T0).
// The expected hashes were recorded from the application before the refactor,
// so they prove only that exported bytes did not change. Delete this file in R8.
import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { wavFile } from '../support/audio';
import { setupWorkspace } from '../app/workspace-fixture';

const pcm = (frames: number, phase: number) =>
  Int16Array.from({ length: frames }, (_, i) =>
    Math.round(Math.sin(i / 12 + phase) * 16000 * Math.exp(-((i % 6000) / 1500))),
  );
const mono = () => ({
  name: 'mono.wav',
  reference: null,
  bytes: wavFile([pcm(48000, 0)], 48000),
});
const stereo = () => ({
  name: 'stereo.wav',
  reference: null,
  bytes: wavFile([pcm(44100, 0), pcm(44100, 1)], 44100),
});
const cases = [
  {
    name: 'mono, no fade, gate off, endpoint and beyond-end cuts',
    file: mono,
    fade: 0,
    gate: null,
    shift: 0,
    ticks: [0, 48, 96, 120],
  },
  {
    name: 'mono, fade 30 ms, gate -48 dB',
    file: mono,
    fade: 30,
    gate: -48,
    shift: 0,
    ticks: [0, 12, 30, 60, 90],
  },
  {
    name: 'mono, shifted, fade 200 ms, gate -24 dB',
    file: mono,
    fade: 200,
    gate: -24,
    shift: 3,
    ticks: [5, 20, 47, 80],
  },
  {
    name: 'stereo, fade 0, gate -60 dB',
    file: stereo,
    fade: 0,
    gate: -60,
    shift: 0,
    ticks: [0, 24, 50, 70],
  },
  {
    name: 'stereo, fade 500 ms, gate off',
    file: stereo,
    fade: 500,
    gate: null,
    shift: -2,
    ticks: [10, 40, 85],
  },
];
const expected: Record<string, string[]> = {
  'mono, no fade, gate off, endpoint and beyond-end cuts': [
    'mono_000.wav 427c532a54f4bd4797cfcae256eea5ce067ea335490debea027147e5a2c948df',
    'mono_001.wav 87fb7cb80337121cc0bccafa3220225026144e776864bde68a45c5498dbf62bf',
    'mono_002.wav 531cd597b25052b4845ef2f3887dec2183240802a93b6e044960de8ba017caa0',
  ],
  'mono, fade 30 ms, gate -48 dB': [
    'mono_000.wav ebf6d2a53f87d8f9d7acf5c7be3c67dff4416a06094a0f9d33bc387f9749f459',
    'mono_001.wav 3ce228163690634f8f7d8a0a72d8fdd3269a7a6cee440bbd7830a2a26a50cb46',
    'mono_002.wav 25e5c74640c2b2f4591ead29d8aad9463e47e92f91980bf95bb96603438fad8e',
    'mono_003.wav ad88de8da14e916955f6821efbf5b48c83b5e1e52b1ad4a611be1f9f74789649',
    'mono_004.wav 2eb693e0354aa975d5051ae772839e262a07cd34224e89639a312b80b10b308e',
  ],
  'mono, shifted, fade 200 ms, gate -24 dB': [
    'mono_000.wav 78260d9e25fe42f393d9214835b008a6b1d3f32126afbed8c203c41242a86c9b',
    'mono_001.wav 491379f205c03f292f847ffab0b3dc3efa21919fc1aca26a7e0e814818c32e5c',
    'mono_002.wav c7bf68ebcd6bbb28341af5d8828eb19d2e89d021334c4044e7ccdc250567294f',
    'mono_003.wav 9209ce6391fbb4cc8e56f5575bc21922f1d3bcbb79894111779b5ff6856180e4',
  ],
  'stereo, fade 0, gate -60 dB': [
    'stereo_000.wav d2054fd0c5deba11b1d23f4b6602cc59e76f2358e5d8ab420c987169bc01f39e',
    'stereo_001.wav a1d7c39b1a05f2154da729c8490b9df98108a37d169acaa4e3b73335d4ef3ba4',
    'stereo_002.wav 5d269dbde695789dfb125ccf5de25d6b61218c3f09d30451397ae0be4940b429',
    'stereo_003.wav 89a5d62ee6eb259abce02b942818d9079d6a5ab2f3e49fa3fc191c01fcc604d5',
  ],
  'stereo, fade 500 ms, gate off': [
    'stereo_000.wav ebb8aafb049242742047818e2dbb9277d3efc9cb3bb8d6a609891f82789c7368',
    'stereo_001.wav 9f917ef8ed3a7b1b17cd5bbe5c3e65722f6c5c0b0192383faf8b7fd4fe248b82',
    'stereo_002.wav 256a2e8e5f5a0383c4ffcf9aa3a915ee2167779e924cae643ec9921169758079',
  ],
};

test.each(cases)('exported slice bytes are unchanged: $name', async (c) => {
  const f = setupWorkspace();
  await f.workspace.loadAudio(c.file());
  f.editor.setDocumentOptions({
    fadeoutMs: c.fade,
    shift: c.shift,
    ...(c.gate === null ? {} : { noisegateDb: c.gate }),
  });
  f.editor.setNoisegateEnabled(c.gate !== null);
  f.editor.addTicks(c.ticks);
  await f.workspace.exportAll();
  const hashes = f.exported.map(
    (file) => `${file.name} ${createHash('sha256').update(file.bytes).digest('hex')}`,
  );
  if (process.env.RECORD_GUARD) console.log(JSON.stringify(c.name), JSON.stringify(hashes));
  else expect(hashes).toEqual(expected[c.name]);
});
