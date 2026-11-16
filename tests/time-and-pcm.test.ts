import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tickToSample,
  sampleToTick,
  exportSample,
  canPlaceMarker,
} from '../src/core/time/conversion.js';
import { encodePcm16 } from '../src/core/formats/wave.js';
import { encodeWav16 } from '../src/core/wav.js';

const base = { tempo: 96, sampleRate: 32000, shift: 0 };
test('time conversion preserves fractional display and truncates exported samples', () => {
  assert.equal(tickToSample(48, base), 20000);
  assert.equal(sampleToTick(20000, base), 48);
  assert.equal(exportSample(0, { ...base, shift: -1 }), -416);
  assert.ok(tickToSample(0.2, base) > tickToSample(0.1, base));
});
test('marker placement includes the audio endpoint and excludes the bitmap limit', () => {
  assert.equal(canPlaceMarker(48, 20000, base), true);
  assert.equal(canPlaceMarker(49, 20000, base), false);
  assert.equal(canPlaceMarker(49152, 1e9, base), false);
});
test('sample export rejects a zero tempo', () => {
  assert.throws(() => exportSample(1, { ...base, tempo: 0 }));
});
test('PCM16 writes signed samples in little-endian order', () => {
  const mono = encodePcm16([Int16Array.of(-32768, -2, 2, 32767)], 32000);
  assert.deepEqual([...mono.slice(44)], [0, 128, 254, 255, 2, 0, 255, 127]);
});
test('stereo PCM16 interleaves frames and writes the canonical 32000 Hz header', () => {
  const channels = [Int16Array.of(-2, 2), Int16Array.of(32767, -32768)];
  const stereo = encodePcm16(channels, 32000);
  assert.deepEqual(encodeWav16(channels, 32000, 2), stereo);
  assert.equal(stereo.length, 52);
  // RIFF size 44; PCM16 stereo; 32000 Hz; 128000 bytes/s; 8 data bytes.
  assert.equal(
    Buffer.from(stereo.slice(0, 44)).toString('hex'),
    '524946462c00000057415645666d74201000000001000200007d000000f40100040010006461746108000000',
  );
  assert.deepEqual([...stereo.slice(44)], [254, 255, 255, 127, 2, 0, 0, 128]);
});
test('empty stereo PCM16 still writes a complete 48000 Hz header', () => {
  const channels = [new Int16Array(), new Int16Array()];
  const empty = encodePcm16(channels, 48000);
  assert.deepEqual(encodeWav16(channels, 48000, 0), empty);
  // RIFF size 36; PCM16 stereo; 48000 Hz; 192000 bytes/s; no payload.
  assert.equal(
    Buffer.from(empty).toString('hex'),
    '524946462400000057415645666d7420100000000100020080bb000000ee0200040010006461746100000000',
  );
});
test('PCM16 rejects unequal channel lengths', () => {
  assert.throws(() => encodePcm16([new Int16Array(1), new Int16Array(2)], 48000));
});
