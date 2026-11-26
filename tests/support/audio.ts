import { encodePcm16 } from '../../src/core/formats/wave';
import type { SourceAudio } from '../../src/core/audio/pcm';

/** A PCM16 WAV file to feed to the decoder or a file picker. */
export function wavFile(channels: readonly Int16Array[], sampleRate = 48000): Uint8Array {
  return encodePcm16(channels, sampleRate);
}

/** Decoded audio with the given channels on the full PCM16 scale. */
export function sourceAudio(data: SourceAudio['data'], sampleRate = 48000): SourceAudio {
  return {
    sourceFormat: { kind: 'pcm', bits: 16 },
    sampleRate,
    channels: data.length,
    length: data[0]?.length ?? 0,
    data,
  };
}
