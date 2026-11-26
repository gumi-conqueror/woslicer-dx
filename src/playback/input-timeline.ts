interface Segment {
  time: number;
  sample: number;
  samplesPerMs: number;
  end?: { time: number; sample: number };
}
const INPUT_HISTORY_MS = 30_000;

/** Recent transport boundaries map queued input to the position heard at capture. */
export function createInputTimeline() {
  const segments: Segment[] = [];
  return {
    reset() {
      segments.length = 0;
    },
    record(time: number, previousSample: number, sample: number, samplesPerMs: number) {
      const previous = segments.at(-1);
      if (previous) previous.end = { time, sample: previousSample };
      segments.push({ time, sample, samplesPerMs });
      while (segments[1] && segments[1].time < time - INPUT_HISTORY_MS) segments.shift();
    },
    at(
      time: number,
      current: { time: number; sample: number },
    ): { sample: number; playing: boolean } | null {
      if (!Number.isFinite(time) || time < current.time - INPUT_HISTORY_MS) return null;
      time = Math.min(time, current.time);
      let segment: Segment | undefined;
      for (const candidate of segments) {
        if (candidate.time > time) break;
        segment = candidate;
      }
      if (!segment) return null;
      const end = segment.end ?? current;
      return {
        sample:
          segment.samplesPerMs === 0
            ? segment.sample
            : Math.max(segment.sample, end.sample - (end.time - time) * segment.samplesPerMs),
        playing: segment.samplesPerMs !== 0,
      };
    },
  };
}
