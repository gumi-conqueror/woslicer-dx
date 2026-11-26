import init, { AudioDecoder } from '@gumi-conqueror/audio-decode';
import wasmUrl from '@gumi-conqueror/audio-decode/index_bg.wasm?url';
import { FULL_SCALE, type SourceAudio, type SourceFormat } from '../core/audio/pcm';

/** Runs inside the audio Worker. Disposing that Worker cancels decoding. */
export async function decodeAudio(bytes: Uint8Array): Promise<SourceAudio> {
  await init({ module_or_path: wasmUrl });
  const decoder = new AudioDecoder(bytes);
  try {
    const channels = decoder.channels;
    if (channels < 1 || channels > 2) {
      throw new Error(`Unsupported audio channel count ${channels} (1 or 2 expected)`);
    }
    const chunks: Float32Array[] = [];
    let length = 0;
    for (let samples = decoder.nextChunk(); samples !== undefined; samples = decoder.nextChunk()) {
      chunks.push(samples);
      length += samples.length / channels;
    }
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    let offset = 0;
    for (const chunk of chunks) {
      for (let frame = 0; frame < chunk.length / channels; frame++) {
        for (let channel = 0; channel < channels; channel++) {
          const sample = chunk[frame * channels + channel];
          if (!Number.isFinite(sample)) throw new Error('Audio contains a non-finite sample');
          // Keep the existing DSP amplitude scale without rounding or clipping samples.
          data[channel][offset + frame] = sample * FULL_SCALE;
        }
      }
      offset += chunk.length / channels;
    }
    const pcm = /^pcm_([suf])(\d+)/.exec(decoder.codec);
    const sourceFormat: SourceFormat = pcm
      ? { kind: pcm[1] === 'f' ? 'float' : 'pcm', bits: Number(pcm[2]) }
      : {
          kind: 'encoded',
          codec: decoder.codec === 'vorbis' ? 'Ogg Vorbis' : decoder.codec.toUpperCase(),
        };
    return {
      channels,
      sampleRate: decoder.sampleRate,
      length,
      data,
      sourceFormat,
    };
  } finally {
    decoder.free();
  }
}
