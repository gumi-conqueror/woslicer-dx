import { suggestOnsets } from './audio/onsets.js';
import type { SourceAudio } from './slicer.js';
import type { TimeBase } from './timebase.js';

/** Adapt source channels and timeline units to the onset detector. */
export function detectEdges(src: SourceAudio, base: TimeBase, gridTicks: number): number[] {
  return suggestOnsets({
    channels: src.data.map((channel) => channel.subarray(0, src.length)),
    timebase: { tempo: base.bpm, shift: base.shift, sampleRate: base.sampleRate },
    grid: gridTicks,
  });
}
