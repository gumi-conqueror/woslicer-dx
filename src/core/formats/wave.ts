export function encodePcm16(channels: readonly Int16Array[], sampleRate: number): Uint8Array {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0 || sampleRate > 0xffffffff)
    throw new RangeError('Invalid sample rate');
  if (!channels.length || channels.length > 32767) throw new RangeError('Invalid channel count');
  const frames = channels[0]?.length ?? 0;
  if (channels.some((c) => c.length !== frames)) throw new RangeError('Unequal channel lengths');
  const size = frames * channels.length * 2;
  const rate = sampleRate * channels.length * 2;
  if (size > 0xffffffff - 36 || rate > 0xffffffff) throw new RangeError('WAVE size overflow');
  const bytes = new Uint8Array(44 + size);
  const view = new DataView(bytes.buffer);
  const tag = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  tag(0, 'RIFF');
  view.setUint32(4, 36 + size, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, channels.length * 2, true);
  view.setUint16(34, 16, true);
  tag(36, 'data');
  view.setUint32(40, size, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame++)
    for (const channel of channels) {
      view.setInt16(offset, channel[frame] ?? 0, true);
      offset += 2;
    }
  return bytes;
}
