/**
 * Source samples use the PCM16 amplitude scale: full scale is ±32768.
 * Decoded audio keeps fractional values and headroom in Float32 until export.
 * Playback buffers and the band filters use normalized values (sample / FULL_SCALE).
 */
export const FULL_SCALE = 32768;

export type PcmChannel = Float32Array | Int16Array;

/** Original encoding, independent of the internal sample representation. */
export type SourceFormat =
  | { kind: 'pcm'; bits: number }
  | { kind: 'float'; bits: number }
  | { kind: 'encoded'; codec: string };

/** Decoded audio of one source file. */
export interface SourceAudio {
  sourceFormat: SourceFormat;
  sampleRate: number;
  channels: number;
  /** Frames per channel. */
  length: number;
  /** Per-channel samples on the FULL_SCALE amplitude scale. */
  data: PcmChannel[];
}

/** Rounds a sample on the FULL_SCALE amplitude scale to PCM16 and clips it. */
export function toPcm16(sample: number): number {
  const value = Math.round(sample);
  return value < -FULL_SCALE ? -FULL_SCALE : value > FULL_SCALE - 1 ? FULL_SCALE - 1 : value;
}
