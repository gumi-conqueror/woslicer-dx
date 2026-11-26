import { expect, test } from 'vitest';
import { encodePcm16 } from '../../src/core/formats/wave';

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

test('writes signed samples in little-endian order', () => {
  const mono = encodePcm16([Int16Array.of(-32768, -2, 2, 32767)], 32000);
  expect([...mono.subarray(44)]).toEqual([0, 128, 254, 255, 2, 0, 255, 127]);
});

test('interleaves stereo frames after the canonical 44-byte header', () => {
  const stereo = encodePcm16([Int16Array.of(-2, 2), Int16Array.of(32767, -32768)], 32000);
  // RIFF size 44; PCM16 stereo; 32000 Hz; 128000 bytes/s; 8 data bytes.
  expect(hex(stereo.subarray(0, 44))).toBe(
    '524946462c00000057415645666d74201000000001000200007d000000f40100040010006461746108000000',
  );
  expect([...stereo.subarray(44)]).toEqual([254, 255, 255, 127, 2, 0, 0, 128]);
});

test('an empty slice is a complete header without data', () => {
  // RIFF size 36; PCM16 stereo; 48000 Hz; 192000 bytes/s; no payload.
  expect(hex(encodePcm16([new Int16Array(), new Int16Array()], 48000))).toBe(
    '524946462400000057415645666d7420100000000100020080bb000000ee0200040010006461746100000000',
  );
});

test.each([
  { channels: [new Int16Array(1), new Int16Array(2)], sampleRate: 48000 },
  { channels: [], sampleRate: 48000 },
  { channels: [new Int16Array(1)], sampleRate: 0 },
])('rejects unequal channels, no channels and an invalid rate', ({ channels, sampleRate }) => {
  expect(() => encodePcm16(channels, sampleRate)).toThrow(RangeError);
});
