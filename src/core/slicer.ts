import { renderSlice as renderAudio, sliceWave } from './audio/slice.js';
import { gateAudio } from './audio/gate.js';
import type { PcmChannel } from './wav.js';

export interface SourceAudio {
  sampleRate: number;
  channels: number;
  length: number;
  data: PcmChannel[];
}
export interface SliceParams {
  start: number;
  end: number;
  fadeoutMs: number;
  noisegateDb: number;
}
export interface RenderedSlice {
  channelsData: Int16Array[];
  sampleRate: number;
  length: number;
}
export function safeGet(src: SourceAudio, channel: number, index: number): number {
  return index >= 0 && index < src.length ? (src.data[channel]?.[index] ?? 0) : 0;
}
export function renderSlice(src: SourceAudio, params: SliceParams): RenderedSlice {
  const result = renderAudio({
    channels: src.data,
    sampleRate: src.sampleRate,
    sourceLength: src.length,
    start: params.start,
    end: params.end,
    sustainMs: params.fadeoutMs,
    gateDb: params.noisegateDb,
  });
  return {
    channelsData: [...result.channels],
    sampleRate: result.sampleRate,
    length: result.length,
  };
}
/** Adapt the host's in-place interface to the pure gate. */
export function applyCut(
  channelsData: Int16Array[],
  length: number,
  db: number,
  tailFrames: number,
): number {
  if (tailFrames !== 11025) throw new RangeError('Unsupported gate tail length');
  const result = gateAudio(
    channelsData.map((channel) => channel.subarray(0, length)),
    db,
  );
  channelsData.forEach((channel, index) => {
    channel.fill(0);
    const output = result.channels[index];
    if (output) channel.set(output.subarray(0, channel.length));
  });
  return result.length;
}
export function renderSliceToWav(src: SourceAudio, params: SliceParams): Uint8Array {
  const result = renderSlice(src, params);
  return sliceWave({
    channels: result.channelsData,
    sampleRate: result.sampleRate,
    length: result.length,
  });
}
