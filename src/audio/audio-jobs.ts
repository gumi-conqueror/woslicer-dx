import type { DecodedWav } from '../core/wav';
import { suggestOnsets } from '../core/audio/onsets';
import type { TimeBase } from '../core/timebase';
import { decodeAudio } from './decode';
import { buildPeakCache, type PeakCache } from '../core/peaks';
import { analyzeBands, type BandAnalysis } from '../core/bands';
import { renderSliceToWav, type SliceParams } from '../core/slicer';

import { detectBandCuts, type DetectRequest, type DetectResult } from '../core/banddetect';
export type DetectionParams = Omit<DetectRequest, 'analysis'>;

export type AudioRequest =
  | { kind: 'decode'; id: number; name: string; bytes: Uint8Array }
  | { kind: 'bands'; id: number }
  | { kind: 'edges'; id: number; base: TimeBase }
  | { kind: 'detect'; id: number; params: DetectionParams }
  | { kind: 'slice'; id: number; params: SliceParams };
export type AudioReply =
  | {
      kind: 'decoded';
      id: number;
      source: DecodedWav;
      floatData: Float32Array[];
      peaks: PeakCache;
    }
  | { kind: 'bands'; id: number; analysis: BandAnalysis }
  | { kind: 'slice'; id: number; bytes: Uint8Array }
  | { kind: 'detected'; id: number; result: DetectResult }
  | { kind: 'edges'; id: number; ticks: number[] }
  | { kind: 'error'; id: number; message: string };
export type DecodedAudio = Extract<AudioReply, { kind: 'decoded' }>;
export interface AudioEngine {
  decode(name: string, bytes: Uint8Array): Promise<DecodedAudio>;
  bands(): Promise<BandAnalysis>;
  detect(params: DetectionParams): Promise<DetectResult>;
  slice(params: SliceParams): Promise<Uint8Array>;
  edges(base: TimeBase): Promise<number[]>;
  dispose(): void;
}
/** Pure worker-side dispatcher, also exercised directly by DSP integration tests. */
export function createAudioProcessor(): (request: AudioRequest) => Promise<AudioReply> {
  let source: DecodedWav | null = null;
  let analysis: BandAnalysis | null = null;
  return async (request) => {
    try {
      switch (request.kind) {
        case 'decode': {
          source = await decodeAudio(request.bytes);
          analysis = null;
          return {
            kind: 'decoded',
            id: request.id,
            source,
            floatData: source.data.map((channel) =>
              Float32Array.from(channel, (sample) => sample / 32768),
            ),
            peaks: buildPeakCache(source.data),
          };
        }
        case 'bands': {
          if (!source) throw new Error('No source loaded');
          analysis ??= analyzeBands(source.data, source.sampleRate);
          return { kind: 'bands', id: request.id, analysis };
        }
        case 'edges': {
          if (!source) throw new Error('No source loaded');
          // The legacy edge detector compares adjacent 4-tick windows.
          const channels = source.data.map((channel) => channel.subarray(0, source?.length));
          const ticks = suggestOnsets({ channels, timebase: request.base, grid: 4 });
          return { kind: 'edges', id: request.id, ticks };
        }
        case 'detect': {
          if (!source) throw new Error('No source loaded');
          analysis ??= analyzeBands(source.data, source.sampleRate);
          return {
            kind: 'detected',
            id: request.id,
            result: detectBandCuts({ ...request.params, analysis }),
          };
        }
        case 'slice': {
          if (!source) throw new Error('No source loaded');
          return { kind: 'slice', id: request.id, bytes: renderSliceToWav(source, request.params) };
        }
      }
    } catch (error) {
      return {
        kind: 'error',
        id: request.id,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
