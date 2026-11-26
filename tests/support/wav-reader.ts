/**
 * Reads the canonical 44-byte-header PCM16 WAV files that slice export writes.
 * It is independent of the writer, so tests can check exported bytes.
 */
export function readPcm16Wav(bytes: Uint8Array): { sampleRate: number; channels: Int16Array[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || tag(12) !== 'fmt ' || tag(36) !== 'data')
    throw new Error('Not a canonical WAV file');
  if (view.getUint16(20, true) !== 1 || view.getUint16(34, true) !== 16)
    throw new Error('Not PCM16');
  const count = view.getUint16(22, true);
  const frames = view.getUint32(40, true) / (count * 2);
  const channels = Array.from({ length: count }, () => new Int16Array(frames));
  for (let frame = 0; frame < frames; frame++)
    for (let channel = 0; channel < count; channel++)
      channels[channel][frame] = view.getInt16(44 + (frame * count + channel) * 2, true);
  return { sampleRate: view.getUint32(24, true), channels };
}
