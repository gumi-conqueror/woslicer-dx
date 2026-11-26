import { gateAudio } from './gate.js';
import { encodePcm16 } from '../formats/wave.js';
import { toPcm16, type PcmChannel } from './pcm.js';
export interface SliceInput {
  readonly channels: readonly PcmChannel[];
  readonly sampleRate: number;
  readonly sourceLength: number;
  readonly start: number;
  readonly end: number;
  readonly sustainMs: number;
  readonly gateDb: number;
}
export interface SliceResult {
  readonly channels: readonly Int16Array[];
  readonly sampleRate: number;
  readonly length: number;
}
export function renderSlice(input: SliceInput): SliceResult {
  const { channels, sampleRate, sourceLength, start, end, sustainMs, gateDb } = input;
  if (
    !channels.length ||
    !Number.isInteger(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isSafeInteger(sourceLength) ||
    sourceLength < 0 ||
    channels.some((c) => c.length < sourceLength) ||
    !Number.isSafeInteger(start) ||
    start < 0 ||
    !Number.isSafeInteger(end) ||
    !Number.isFinite(sustainMs) ||
    sustainMs < 0 ||
    !Number.isFinite(gateDb) ||
    gateDb > 0
  )
    throw new RangeError('Invalid slice input');
  const limit = Math.min(end, sourceLength);
  if (start >= limit)
    return { channels: channels.map(() => new Int16Array()), sampleRate, length: 0 };
  const main = limit - start;
  // Sustain reads only following source material, never repeats endpoint samples.
  const sustain = Math.min(Math.trunc((sustainMs * sampleRate) / 1000), sourceLength - limit);
  const total = main + sustain + 16;
  const attack = Math.max(1, Math.min(main, Math.trunc(sampleRate / 1000)));
  const rendered = channels.map((channel) => {
    const output = new Int16Array(total);
    for (let i = 0; i < main; i++) {
      // One-millisecond raised-cosine attack.
      const gain = i < attack ? 0.5 * (1 - Math.cos((Math.PI * i) / attack)) : 1;
      // Quantize only the exported frames, preserving the established PCM16 fade/gate rules.
      output[i] = Math.trunc(toPcm16(channel[start + i] ?? 0) * gain);
    }
    for (let i = 0; i < sustain; i++) {
      const gain = 0.5 * (1 + Math.cos((Math.PI * (i + 1)) / sustain));
      output[main + i] = Math.trunc(toPcm16(channel[limit + i] ?? 0) * gain);
    }
    return output;
  });
  return { sampleRate, ...gateAudio(rendered, gateDb) };
}
export function sliceWave(result: SliceResult): Uint8Array {
  if (result.channels.some((c) => c.length !== result.length))
    throw new RangeError('Logical slice length mismatch');
  return encodePcm16(result.channels, result.sampleRate);
}
