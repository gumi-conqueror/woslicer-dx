/** Deterministic audio/fixture builders shared by the test suites. */

/** Writes an ASCII chunk id / fourCC into the view. */
export function writeAscii(view: DataView, off: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(off + i, text.charCodeAt(i));
}

/**
 * Writes the canonical 16-byte `fmt ` chunk body at `off`: byte rate and
 * block align derive from channels × bytes per sample.
 */
export function writeFmtChunk(
  view: DataView,
  off: number,
  formatTag: number,
  channels: number,
  sampleRate: number,
  bits: number,
): void {
  writeAscii(view, off, 'fmt ');
  view.setUint32(off + 4, 16, true);
  view.setUint16(off + 8, formatTag, true);
  view.setUint16(off + 10, channels, true);
  view.setUint32(off + 12, sampleRate, true);
  const bytesPer = bits >> 3;
  view.setUint32(off + 16, sampleRate * channels * bytesPer, true);
  view.setUint16(off + 20, channels * bytesPer, true);
  view.setUint16(off + 22, bits, true);
}

/** Writes the 44-byte canonical WAV header (RIFF/WAVE/fmt/data sizes). */
export function writeWavHeader(
  view: DataView,
  dataSize: number,
  formatTag: number,
  channels: number,
  sampleRate: number,
  bits: number,
): void {
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, dataSize + 36, true);
  writeAscii(view, 8, 'WAVE');
  writeFmtChunk(view, 12, formatTag, channels, sampleRate, bits);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);
}

/** Builds a WAV byte buffer at an arbitrary PCM bit depth. */
export function wavBytesDepth(
  samples: number[],
  sampleRate: number,
  bits: 8 | 16 | 24 | 32,
): Uint8Array {
  const bytesPer = bits >> 3;
  const dataSize = samples.length * bytesPer;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  writeWavHeader(view, dataSize, 1, 1, sampleRate, bits);
  let p = 44;
  for (const s of samples) {
    switch (bits) {
      case 8:
        view.setUint8(p, s & 0xff);
        break;
      case 16:
        view.setInt16(p, s, true);
        break;
      case 24:
        view.setUint8(p, s & 0xff);
        view.setUint8(p + 1, (s >> 8) & 0xff);
        view.setUint8(p + 2, (s >> 16) & 0xff);
        break;
      case 32:
        view.setInt32(p, s, true);
        break;
    }
    p += bytesPer;
  }
  return new Uint8Array(buf);
}
