import type { Note } from './pairing.js';
function vlq(value: number): number[] {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x0fffffff)
    throw new RangeError('SMF delta exceeds supported range');
  const bytes = [value % 128];
  while ((value = Math.floor(value / 128)) > 0) bytes.unshift((value % 128) + 128);
  return bytes;
}
function u32(value: number): number[] {
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}
export function recordingSmf(notes: readonly Note[], resolution: number): Uint8Array {
  if (!Number.isInteger(resolution) || resolution <= 0 || resolution > 32767)
    throw new RangeError('Unsupported MIDI resolution');
  const events: { time: number; order: number; bytes: number[] }[] = [];
  notes.forEach((note, i) => {
    if (![note.onset, note.duration, note.pitch, note.velocity].every(Number.isFinite))
      throw new RangeError('Nonfinite note');
    const onset = Math.max(0, Math.trunc(note.onset));
    const end = onset + Math.max(0, Math.trunc(note.duration));
    const pitch = Math.max(0, Math.min(127, Math.trunc(note.pitch)));
    const velocity = Math.max(1, Math.min(127, Math.trunc(note.velocity)));
    events.push(
      { time: onset, order: i * 2, bytes: [0x90, pitch, velocity] },
      { time: end, order: i * 2 + 1, bytes: [0x80, pitch, 0] },
    );
  });
  events.sort((a, b) => a.time - b.time || a.order - b.order);
  const track: number[] = [];
  let previous = 0;
  for (const event of events) {
    track.push(...vlq(event.time - previous), ...event.bytes);
    previous = event.time;
  }
  track.push(0, 255, 47, 0);
  if (track.length > 0xffffffff) throw new RangeError('Track too large');
  return Uint8Array.from([
    77,
    84,
    104,
    100,
    0,
    0,
    0,
    6,
    0,
    1,
    0,
    2,
    resolution >> 8,
    resolution & 255,
    77,
    84,
    114,
    107,
    0,
    0,
    0,
    4,
    0,
    255,
    47,
    0,
    77,
    84,
    114,
    107,
    ...u32(track.length),
    ...track,
  ]);
}
