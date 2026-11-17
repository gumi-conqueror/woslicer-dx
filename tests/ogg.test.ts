import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { decodeOgg } from '../src/core/ogg.js';

test('imports a complete short Vorbis file including its final buffered page', async () => {
  const audio = await decodeOgg(readFileSync('tests/fixtures/audio/generated-tone.ogg'));
  assert.equal(audio.channels, 1);
  assert.equal(audio.sampleRate, 44100);
  assert.equal(audio.length, 13230);
  assert.ok(audio.data[0].some((sample) => Math.abs(sample) > 1000));
});
