import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSlice, sliceWave } from '../src/core/audio/slice.js';
import { gateAudio } from '../src/core/audio/gate.js';

function stereoSlice() {
  return {
    channels: [new Int16Array(512).fill(1200), new Int16Array(512).fill(-600)],
    sampleRate: 48000,
    sourceLength: 512,
    start: 0,
    end: 512,
    sustainMs: 0,
    gateDb: -48,
  };
}
test('slice rendering preserves stereo samples after attack and pads the tail', () => {
  const input = stereoSlice();
  const before = input.channels.map((channel) => channel.slice());
  const result = renderSlice(input);
  assert.equal(result.length, 528);
  assert.equal(result.channels[0][0], 0);
  assert.ok(result.channels[0][24] > 0 && result.channels[0][24] < 1200);
  assert.equal(result.channels[0][100], 1200);
  assert.equal(result.channels[1][100], -600);
  assert.ok(result.channels.every((channel) => channel.slice(512).every((value) => value === 0)));
  assert.deepEqual(input.channels, before);
});
test('slice WAVE includes the full stereo payload and its logical duration', () => {
  const result = renderSlice(stereoSlice());
  const wave = sliceWave(result);
  assert.equal(wave.length, 2156);
  // RIFF size 2148; stereo PCM16 at 48000 Hz; 2112 payload bytes.
  assert.equal(
    Buffer.from(wave.slice(0, 44)).toString('hex'),
    '524946466408000057415645666d7420100000000100020080bb000000ee0200040010006461746140080000',
  );
  const payload = new DataView(wave.buffer, wave.byteOffset + 44, wave.byteLength - 44);
  assert.equal(result.channels.length, 2);
  for (const channel of result.channels) assert.equal(channel.length, 528);
  // Read the payload independently, including attack and all tail frames.
  for (let frame = 0; frame < result.length; frame++) {
    for (let channel = 0; channel < 2; channel++) {
      assert.equal(
        payload.getInt16((frame * 2 + channel) * 2, true),
        result.channels[channel][frame],
        `frame ${frame}, channel ${channel}`,
      );
    }
  }
});
test('an endpoint slice remains empty even with sustain', () => {
  const empty = renderSlice({ ...stereoSlice(), start: 512, sustainMs: 500 });
  assert.equal(empty.length, 0);
  assert.equal(empty.channels.length, 2);
  assert.equal(sliceWave(empty).length, 44);
});
test('slice end and sustain stop at the source boundary', () => {
  const input = stereoSlice();
  const expected = renderSlice(input);
  assert.deepEqual(renderSlice({ ...input, end: 999 }), expected);
  assert.deepEqual(renderSlice({ ...input, sustainMs: 500 }), expected);
});
test('slice rendering rejects a negative start', () => {
  assert.throws(() => renderSlice({ ...stereoSlice(), start: -1 }));
});
test('gate uses a strict threshold and includes the last audible sample', () => {
  const impulse = new Int16Array(100);
  impulse[37] = 100;
  assert.equal(gateAudio([impulse], 0).length, 37);
  assert.equal(gateAudio([new Int16Array(30).fill(128)], -48).length, 4);
});
test('gate caps its trailing padding and considers both channels without mutation', () => {
  const left = new Int16Array(20000),
    right = new Int16Array(20000);
  right[150] = -129;
  assert.equal(gateAudio([left, right], -48).length, 11175);
  assert.equal(right[150], -129);
});
test('gate preserves a short buffer and accepts an empty one', () => {
  const short = new Int16Array(100);
  short[20] = 500;
  short[50] = 100;
  assert.deepEqual(gateAudio([short], -48).channels[0], short);
  assert.equal(gateAudio([new Int16Array()], -48).length, 0);
});
test('sustain decays following material without mixing or echo', () => {
  const result = renderSlice({
    channels: [new Int16Array(1000).fill(2000)],
    sampleRate: 48000,
    sourceLength: 1000,
    start: 0,
    end: 200,
    sustainMs: 10,
    gateDb: -48,
  });
  assert.equal(result.length, 696);
  const channel = result.channels[0];
  assert.ok(channel[200] > channel[400]);
  assert.ok(channel[400] > channel[600]);
  assert.equal(channel[679], 0);
  assert.ok(channel.every((value) => value >= 0 && value <= 2000));
});
