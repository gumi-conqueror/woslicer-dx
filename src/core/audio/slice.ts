import { FULL_SCALE, toPcm16, type SourceAudio } from './pcm.js';

/**
 * Slice export processing, in order: a 1 ms raised-cosine attack, an optional
 * fade-out over the following source material, PCM16 quantization, a
 * 16-frame silent pad, then the noise gate. Preview and export both call
 * `renderSlice`, so they always produce the same audio.
 */

/** Frames of silence after every slice. */
const PAD_FRAMES = 16;
/** Frames kept after the last loud frame when the gate cuts the tail (250 ms at 44.1 kHz). */
const GATE_TAIL_FRAMES = 11025;
/** Length of a slice that the gate finds completely silent. The original program does the same. */
const SILENT_FRAMES = 4;

export interface SliceParams {
  /** First source frame. */
  readonly start: number;
  /** Frame after the slice; the source end limits it. */
  readonly end: number;
  readonly fadeoutMs: number;
  /** Gate threshold. 0 dB cuts only trailing digital silence. */
  readonly noisegateDb: number;
}

export interface RenderedSlice {
  readonly channels: readonly Int16Array[];
  readonly sampleRate: number;
  readonly length: number;
}

type SliceSource = Pick<SourceAudio, 'data' | 'sampleRate' | 'length'>;

export function renderSlice(source: SliceSource, params: SliceParams): RenderedSlice {
  const { data: channels, sampleRate, length: sourceLength } = source;
  const { start, end, fadeoutMs, noisegateDb } = params;
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
    !Number.isFinite(fadeoutMs) ||
    fadeoutMs < 0 ||
    !Number.isFinite(noisegateDb) ||
    noisegateDb > 0
  )
    throw new RangeError('Invalid slice input');
  const limit = Math.min(end, sourceLength);
  if (start >= limit)
    return { channels: channels.map(() => new Int16Array()), sampleRate, length: 0 };
  const main = limit - start;
  // The fade-out reads only following source material; it never repeats endpoint samples.
  const sustain = Math.min(Math.trunc((fadeoutMs * sampleRate) / 1000), sourceLength - limit);
  const total = main + sustain + PAD_FRAMES;
  const attack = Math.max(1, Math.min(main, Math.trunc(sampleRate / 1000)));
  const rendered = channels.map((channel) => {
    const output = new Int16Array(total);
    for (let i = 0; i < main; i++) {
      const gain = i < attack ? 0.5 * (1 - Math.cos((Math.PI * i) / attack)) : 1;
      // Quantize before the gain, as the established PCM16 fade and gate rules require.
      output[i] = Math.trunc(toPcm16(channel[start + i] ?? 0) * gain);
    }
    for (let i = 0; i < sustain; i++) {
      const gain = 0.5 * (1 + Math.cos((Math.PI * (i + 1)) / sustain));
      output[main + i] = Math.trunc(toPcm16(channel[limit + i] ?? 0) * gain);
    }
    return output;
  });
  return { sampleRate, ...gate(rendered, noisegateDb) };
}

/** Cuts the tail after the last frame above the threshold in any channel. */
function gate(channels: readonly Int16Array[], noisegateDb: number) {
  const available = channels[0]?.length ?? 0;
  if (!available) return { channels: channels.map(() => new Int16Array()), length: 0 };
  // Six-decibel amplitude convention; -48 dB is exactly 128.
  const threshold = noisegateDb === 0 ? 0 : FULL_SCALE * Math.pow(2, noisegateDb / 6);
  let last = -1;
  for (let i = 0; i < available; i++)
    if (channels.some((c) => Math.abs(c[i] ?? 0) > threshold)) last = i;
  const length =
    noisegateDb === 0
      ? Math.max(0, last)
      : last < 0
        ? SILENT_FRAMES
        : Math.min(available, last + GATE_TAIL_FRAMES);
  const output = channels.map((channel) => {
    const result = new Int16Array(length);
    result.set(channel.subarray(0, length));
    // Smooth release only when the gate actually truncates.
    if (noisegateDb !== 0 && last >= 0 && length < available) {
      const span = length - last - 1;
      for (let i = last + 1; i < length; i++) {
        const gain = span > 0 ? 0.5 * (1 + Math.cos((Math.PI * (i - last)) / span)) : 0;
        result[i] = Math.trunc((result[i] ?? 0) * gain);
      }
    }
    return result;
  });
  return { channels: output, length };
}
