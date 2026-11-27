import init, { AudioDecoder } from '@gumi-conqueror/audio-decode';
import wasmUrl from '@gumi-conqueror/audio-decode/index_bg.wasm?url';
import { FULL_SCALE, type SourceAudio, type SourceFormat } from '../core/audio/pcm';

/** How far decoding is: the length that the file declares, if any, and the frames decoded so far. */
export interface DecodeProgress {
  sampleRate: number;
  /** Frames per channel that the file declares before decoding; `null` when it declares none. */
  frames: number | null;
  decoded: number;
}
/** Progress reports of one decode are at least this far apart. */
const PROGRESS_INTERVAL_MS = 100;

/**
 * Runs inside the audio Worker. Disposing that Worker cancels decoding.
 * `progress` receives the declared length first, then the decoded frames while decoding.
 */
export async function decodeAudio(
  bytes: Uint8Array,
  progress?: (value: DecodeProgress) => void,
): Promise<SourceAudio> {
  await init({ module_or_path: wasmUrl });
  const decoder = new AudioDecoder(bytes);
  try {
    const channels = decoder.channels;
    if (channels < 1 || channels > 2) {
      throw new Error(`Unsupported audio channel count ${channels} (1 or 2 expected)`);
    }
    const frames = decoder.frames ?? null;
    const report = (decoded: number) =>
      progress?.({ sampleRate: decoder.sampleRate, frames, decoded });
    report(0);
    let reported = performance.now();
    // Samples go straight into per-channel buffers sized to the declared length.
    // A file without a declared length, or with more frames, grows the buffers.
    let data = Array.from({ length: channels }, () => new Float32Array(frames ?? 0));
    let length = 0;
    for (let samples = decoder.nextChunk(); samples !== undefined; samples = decoder.nextChunk()) {
      const count = samples.length / channels;
      if (length + count > (data[0]?.length ?? 0)) {
        const capacity = Math.max(length + count, Math.ceil(length * 1.5), 65536);
        data = data.map((channel) => {
          const grown = new Float32Array(capacity);
          grown.set(channel.subarray(0, length));
          return grown;
        });
      }
      for (let frame = 0; frame < count; frame++) {
        for (let channel = 0; channel < channels; channel++) {
          const sample = samples[frame * channels + channel];
          if (!Number.isFinite(sample)) throw new Error('Audio contains a non-finite sample');
          // Keep the existing DSP amplitude scale without rounding or clipping samples.
          data[channel][length + frame] = sample * FULL_SCALE;
        }
      }
      length += count;
      if (performance.now() - reported >= PROGRESS_INTERVAL_MS) {
        report(length);
        reported = performance.now();
      }
    }
    report(length);
    data = data.map((channel) => (channel.length === length ? channel : channel.slice(0, length)));
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
