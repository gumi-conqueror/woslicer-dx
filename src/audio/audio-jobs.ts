import { FULL_SCALE, type SourceAudio } from '../core/audio/pcm';
import { errorMessage } from '../core/messages';
import { suggestOnsets } from '../core/audio/onsets';
import type { TimeBase } from '../core/timebase';
import { decodeAudio, type DecodeProgress } from './decode';
import { estimateTempo } from '../core/tempo';
import { buildPeakCache, type PeakCache } from '../core/peaks';
import { analyzeBands, type BandAnalysis } from '../core/bands';
import { renderSlice, type SliceParams } from '../core/audio/slice';
import { encodePcm16 } from '../core/formats/wave';

import { detectBandCuts, type DetectRequest, type DetectResult } from '../core/banddetect';
export type DetectionParams = Omit<DetectRequest, 'analysis'>;

export type AudioRequest =
  | { kind: 'decode'; id: number; name: string; bytes: Uint8Array }
  | { kind: 'bands'; id: number }
  | { kind: 'edges'; id: number; base: TimeBase }
  | { kind: 'tempo'; id: number }
  | { kind: 'detect'; id: number; params: DetectionParams }
  | { kind: 'slice'; id: number; params: SliceParams };
export type AudioReply =
  | {
      kind: 'decoded';
      id: number;
      source: SourceAudio;
      floatData: Float32Array[];
      peaks: PeakCache;
    }
  | { kind: 'bands'; id: number; analysis: BandAnalysis }
  | { kind: 'slice'; id: number; bytes: Uint8Array }
  | { kind: 'detected'; id: number; result: DetectResult }
  | { kind: 'edges'; id: number; ticks: number[] }
  | { kind: 'tempo'; id: number; bpm: number | null }
  | { kind: 'error'; id: number; message: string };
export type DecodedAudio = Extract<AudioReply, { kind: 'decoded' }>;
/** An interim message of a decode request; the request stays open. */
export interface DecodingProgress {
  kind: 'decoding';
  id: number;
  progress: DecodeProgress;
}
export interface AudioEngine {
  decode(
    name: string,
    bytes: Uint8Array,
    progress?: (value: DecodeProgress) => void,
  ): Promise<DecodedAudio>;
  bands(): Promise<BandAnalysis>;
  detect(params: DetectionParams): Promise<DetectResult>;
  slice(params: SliceParams): Promise<Uint8Array>;
  edges(base: TimeBase): Promise<number[]>;
  /** The estimated tempo of the decoded audio in BPM, or null without a clear beat. */
  tempo(): Promise<number | null>;
  dispose(): void;
}
/**
 * Pure worker-side dispatcher, also exercised directly by DSP integration tests.
 * `progress` receives the interim messages of decode requests.
 */
export function createAudioProcessor(
  progress?: (message: DecodingProgress) => void,
): (request: AudioRequest) => Promise<AudioReply> {
  let source: SourceAudio | null = null;
  let analysis: BandAnalysis | null = null;
  return async (request) => {
    try {
      switch (request.kind) {
        case 'decode': {
          source = await decodeAudio(request.bytes, (value) =>
            progress?.({ kind: 'decoding', id: request.id, progress: value }),
          );
          analysis = null;
          return {
            kind: 'decoded',
            id: request.id,
            source,
            floatData: source.data.map((channel) =>
              Float32Array.from(channel, (sample) => sample / FULL_SCALE),
            ),
            peaks: buildPeakCache(source.data),
          };
        }
        case 'bands': {
          if (!source) throw new Error('No source loaded');
          analysis ??= analyzeBands(source.data, source.sampleRate);
          return { kind: 'bands', id: request.id, analysis };
        }
        case 'tempo': {
          if (!source) throw new Error('No source loaded');
          const bpm = estimateTempo(source.data, source.sampleRate, source.length);
          return { kind: 'tempo', id: request.id, bpm };
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
          const slice = renderSlice(source, request.params);
          return {
            kind: 'slice',
            id: request.id,
            bytes: encodePcm16(slice.channels, slice.sampleRate),
          };
        }
      }
    } catch (error) {
      return {
        kind: 'error',
        id: request.id,
        message: errorMessage(error),
      };
    }
  };
}
