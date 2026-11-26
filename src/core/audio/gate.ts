import { FULL_SCALE } from './pcm.js';

export interface GatedAudio {
  readonly channels: readonly Int16Array[];
  readonly length: number;
}
export function gateAudio(channels: readonly Int16Array[], gateDb: number): GatedAudio {
  if (!Number.isFinite(gateDb) || gateDb > 0) throw new RangeError('Invalid noise threshold');
  const available = channels[0]?.length ?? 0;
  if (!channels.length || channels.some((c) => c.length !== available))
    throw new RangeError('Invalid audio channels');
  if (!available) return { channels: channels.map(() => new Int16Array()), length: 0 };
  // Six-decibel amplitude convention; -48 dB is exactly 128.
  const threshold = gateDb === 0 ? 0 : FULL_SCALE * Math.pow(2, gateDb / 6);
  let last = -1;
  for (let i = 0; i < available; i++)
    if (channels.some((c) => Math.abs(c[i] ?? 0) > threshold)) last = i;
  const length =
    gateDb === 0 ? Math.max(0, last) : last < 0 ? 4 : Math.min(available, last + 11025);
  const output = channels.map((channel) => {
    const result = new Int16Array(length);
    result.set(channel.subarray(0, length));
    // Smooth release only when the threshold cap actually truncates.
    if (gateDb !== 0 && last >= 0 && length < available) {
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
