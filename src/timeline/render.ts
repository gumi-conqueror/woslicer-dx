import type { EditorStore } from '../slicing/editor-store';
import type { Palette } from '../ui/palette';
import { MEASURE_TICKS, sampleToTick, tickToSample } from '../core/timebase';
import { gridLineTicks, gridStepTicks, measureLabelStep } from '../core/gridlines';
import { peakRange } from '../core/peaks';
import { drawBandEnvelope, drawWaveLane } from './waveform';
import { FULL_SCALE } from '../core/audio/pcm';

export const RULER_HEIGHT = 28;
export const OVERVIEW_HEIGHT = 36;
export type TimelineSnapshot = Pick<
  EditorStore,
  | 'timeBase'
  | 'timelineTicks'
  | 'ticks'
  | 'markerKeys'
  | 'previewTicks'
  | 'source'
  | 'peaks'
  | 'grid'
  | 'scrollTick'
  | 'pxPerTick'
  | 'rmsVisible'
  | 'bandsVisible'
  | 'bandAnalysis'
  | 'selectedTicks'
  | 'selectionStartTick'
  | 'selectionEndTick'
  | 'cursorTick'
  | 'playheadSample'
>;
export interface Ghost {
  ticks: readonly number[];
  delta: number;
}
export interface CanvasSize {
  width: number;
  height: number;
  dpr: number;
}

export function setupCanvas(
  canvas: HTMLCanvasElement,
  { width, height, dpr }: CanvasSize,
): CanvasRenderingContext2D | null {
  const pixelWidth = Math.max(1, Math.round(width * dpr)),
    pixelHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext('2d');
  context?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return context;
}
function vertical(context: CanvasRenderingContext2D, x: number, top: number, bottom: number): void {
  context.beginPath();
  context.moveTo(x + 0.5, top);
  context.lineTo(x + 0.5, bottom);
  context.stroke();
}
function hatch(
  context: CanvasRenderingContext2D,
  x: number,
  width: number,
  height: number,
  palette: Readonly<Palette>,
): void {
  if (x >= width) return;
  const left = Math.max(0, x);
  context.save();
  context.beginPath();
  context.rect(left, 0, width - left, height);
  context.clip();
  context.fillStyle = palette.panel;
  context.fillRect(left, 0, width - left, height);
  context.strokeStyle = palette.hatch;
  context.lineWidth = 2;
  context.beginPath();
  for (let offset = left - height; offset < width; offset += 12) {
    context.moveTo(offset, height);
    context.lineTo(offset + height, 0);
  }
  context.stroke();
  context.restore();
  context.strokeStyle = palette.danger;
  vertical(context, Math.floor(x), 0, height);
}

export function drawRuler(
  context: CanvasRenderingContext2D,
  state: TimelineSnapshot,
  width: number,
  palette: Readonly<Palette>,
): void {
  context.fillStyle = palette.panel;
  context.fillRect(0, 0, width, RULER_HEIGHT);
  context.font = '10px Consolas, monospace';
  context.textBaseline = 'middle';
  context.lineWidth = 1;
  const labelStep = measureLabelStep(state.pxPerTick * MEASURE_TICKS);
  for (const line of gridLineTicks(
    state.scrollTick,
    state.scrollTick + width / state.pxPerTick,
    gridStepTicks(state.grid),
    state.pxPerTick,
  )) {
    const x = (line.tick - state.scrollTick) * state.pxPerTick;
    context.strokeStyle = line.isMeasure ? palette.text2 : palette.text3;
    vertical(context, x, line.isMeasure ? 10 : 18, RULER_HEIGHT);
    const measure = line.tick / MEASURE_TICKS;
    if (line.isMeasure && measure % labelStep === 0) {
      context.fillStyle = palette.text2;
      context.fillText(String(measure + 1).padStart(3, '0'), x + 3, 12);
    }
  }
}

/** The timeline canvas, drawn bottom to top. Each layer sets its own drawing state. */
export function drawTimeline(
  context: CanvasRenderingContext2D,
  state: TimelineSnapshot,
  size: CanvasSize,
  palette: Readonly<Palette>,
): void {
  context.clearRect(0, 0, size.width, size.height);
  drawBackground(context, size, palette);
  drawGrid(context, state, size, palette);
  drawAudioEnd(context, state, size, palette);
  drawTrack(context, state, { top: 0, height: size.height }, size, palette);
  drawMarkers(context, state, size, palette);
  drawSelection(context, state, size, palette);
}

function drawBackground(
  context: CanvasRenderingContext2D,
  { width, height }: CanvasSize,
  palette: Readonly<Palette>,
): void {
  context.fillStyle = palette.surface1;
  context.fillRect(0, 0, width, height);
}

function drawGrid(
  context: CanvasRenderingContext2D,
  state: TimelineSnapshot,
  { width, height }: CanvasSize,
  palette: Readonly<Palette>,
): void {
  context.lineWidth = 1;
  for (const line of gridLineTicks(
    state.scrollTick,
    state.scrollTick + width / state.pxPerTick,
    gridStepTicks(state.grid),
    state.pxPerTick,
  )) {
    context.strokeStyle = line.isMeasure ? palette.surface3 : palette.surface2;
    vertical(context, (line.tick - state.scrollTick) * state.pxPerTick, 0, height);
  }
}

/** Hatches the area after the end of the audio, where markers cannot go. */
function drawAudioEnd(
  context: CanvasRenderingContext2D,
  state: TimelineSnapshot,
  { width, height }: CanvasSize,
  palette: Readonly<Palette>,
): void {
  if (!state.source || !state.timeBase) return;
  const endTick = sampleToTick(state.source.length, state.timeBase);
  hatch(context, (endTick - state.scrollTick) * state.pxPerTick, width, height, palette);
}

type TrackDrawing = Pick<
  TimelineSnapshot,
  | 'source'
  | 'peaks'
  | 'timeBase'
  | 'timelineTicks'
  | 'scrollTick'
  | 'pxPerTick'
  | 'rmsVisible'
  | 'bandsVisible'
  | 'bandAnalysis'
>;
const BAND_STYLES = [
  ['low', 'bandLow', []],
  ['mid', 'bandMid', [4, 2]],
  ['high', 'bandHigh', []],
] as const;

/**
 * One track's channels: center lines, waveforms and band envelopes inside the
 * given vertical area. A multi-track view calls this once per track.
 */
function drawTrack(
  context: CanvasRenderingContext2D,
  track: TrackDrawing,
  area: { top: number; height: number },
  { width, dpr }: CanvasSize,
  palette: Readonly<Palette>,
): void {
  const { source, timeBase } = track;
  if (!source || !timeBase) return;
  const view = { width, dpr, scrollTick: track.scrollTick, pxPerTick: track.pxPerTick, timeBase };
  const bands = track.bandsVisible ? track.bandAnalysis : null;
  const channelHeight = area.height / source.channels;
  context.lineWidth = 1;
  for (let channel = 0; channel < source.channels; channel++) {
    const channelArea = {
      center: area.top + channelHeight * (channel + 0.5),
      halfHeight: Math.max(0, channelHeight / 2 - 4),
    };
    context.strokeStyle = palette.surface3;
    context.beginPath();
    context.moveTo(0, channelArea.center + 0.5);
    context.lineTo(width, channelArea.center + 0.5);
    context.stroke();
    // The second channel uses the bright variants; band overlays dim the waveform.
    const second = channel > 0;
    const data = source.floatData[channel];
    if (data && track.peaks)
      drawWaveLane(
        context,
        view,
        data,
        channelArea,
        bands
          ? {
              outer: second ? palette.waveBrightDim : palette.waveDim,
              rms: second ? palette.waveRmsBrightDim : palette.waveRmsDim,
            }
          : {
              outer: second ? palette.waveBright : palette.wave,
              rms: second ? palette.waveRmsBright : palette.waveRms,
            },
        track.rmsVisible,
      );
    if (!bands) continue;
    for (const [name, color, dash] of BAND_STYLES) {
      const peaks = bands[name].peaks[channel];
      if (peaks)
        drawBandEnvelope(
          context,
          view,
          { peaks, length: source.length, color: palette[color], dash },
          channelArea,
        );
    }
  }
}

/** Marker lines with their head triangles and recorded key labels. */
function drawMarkers(
  context: CanvasRenderingContext2D,
  state: TimelineSnapshot,
  { width, height }: CanvasSize,
  palette: Readonly<Palette>,
): void {
  const toTick = state.scrollTick + width / state.pxPerTick;
  context.lineWidth = 1;
  const recordedKeys = new Map(state.markerKeys.map((entry) => [entry.tick, entry.keys]));
  context.font = '11px "WOS UI en", Consolas, monospace';
  context.textBaseline = 'top';
  let labelRight = -Infinity;
  for (const tick of state.previewTicks ?? state.ticks) {
    if (tick < state.scrollTick || tick > toTick) continue;
    const x = (tick - state.scrollTick) * state.pxPerTick;
    const color = state.selectedTicks.includes(tick) ? palette.selection : palette.accent;
    context.strokeStyle = context.fillStyle = color;
    vertical(context, x, 0, height);
    context.beginPath();
    context.moveTo(x - 4, 0);
    context.lineTo(x + 4, 0);
    context.lineTo(x, 6);
    context.closePath();
    context.fill();
    const keys = recordedKeys.get(tick);
    // A label that would overlap the previous label is skipped.
    if (keys?.length && x >= labelRight) {
      const label = keys.join('+');
      const labelWidth = label.length * 7 + 4;
      context.fillStyle = palette.panel;
      context.fillRect(x + 3, 8, labelWidth, 15);
      context.fillStyle = color;
      context.fillText(label, x + 5, 10);
      labelRight = x + labelWidth + 8;
    }
  }
}

function drawSelection(
  context: CanvasRenderingContext2D,
  state: TimelineSnapshot,
  { height }: CanvasSize,
  palette: Readonly<Palette>,
): void {
  if (state.selectionStartTick === null || state.selectionEndTick === null) return;
  const first = Math.min(state.selectionStartTick, state.selectionEndTick),
    last = Math.max(state.selectionStartTick, state.selectionEndTick);
  const x = (first - state.scrollTick) * state.pxPerTick,
    span = (last - first) * state.pxPerTick;
  context.lineWidth = 1;
  context.fillStyle = palette.selectionFill;
  context.fillRect(x, 0, span, height);
  context.strokeStyle = palette.selection;
  context.strokeRect(x + 0.5, 0.5, span, height - 1);
}

export function drawOverlay(
  context: CanvasRenderingContext2D,
  state: TimelineSnapshot,
  size: CanvasSize,
  palette: Readonly<Palette>,
  ghost?: Ghost,
): void {
  const { width, height } = size;
  context.clearRect(0, 0, width, height);
  context.lineWidth = 1;
  if (ghost && ghost.delta !== 0) {
    context.fillStyle = palette.ghost;
    for (const tick of ghost.ticks)
      context.fillRect((tick + ghost.delta - state.scrollTick) * state.pxPerTick - 1, 0, 2, height);
  }
  if (state.timeBase) {
    const tick = sampleToTick(state.playheadSample, state.timeBase);
    const x = (tick - state.scrollTick) * state.pxPerTick;
    if (x >= -2 && x <= width + 2) {
      context.strokeStyle = context.fillStyle = palette.playhead;
      vertical(context, x, 0, height);
      context.beginPath();
      context.moveTo(x - 5, 0);
      context.lineTo(x + 5, 0);
      context.lineTo(x, 8);
      context.closePath();
      context.fill();
    }
  }
  context.save();
  context.strokeStyle = palette.accent;
  context.setLineDash([4, 4]);
  vertical(context, (state.cursorTick - state.scrollTick) * state.pxPerTick, 0, height);
  context.restore();
}

/**
 * A track's whole-length thumbnail. `viewportWidth` draws the visible range of
 * the timeline over it; other tracks pass `null`.
 */
export function drawOverview(
  context: CanvasRenderingContext2D,
  state: Pick<
    TimelineSnapshot,
    'source' | 'peaks' | 'timeBase' | 'scrollTick' | 'pxPerTick' | 'timelineTicks'
  >,
  width: number,
  viewportWidth: number | null,
  palette: Readonly<Palette>,
): void {
  context.fillStyle = palette.panel;
  context.fillRect(0, 0, width, OVERVIEW_HEIGHT);
  context.lineWidth = 1;
  const source = state.source,
    cache = state.peaks,
    base = state.timeBase;
  if (source && cache && base) {
    const laneHeight = OVERVIEW_HEIGHT / source.channels;
    context.fillStyle = palette.wave;
    for (let lane = 0; lane < source.channels; lane++) {
      for (let x = 0; x < width; x += 2) {
        const first = tickToSample((x / width) * state.timelineTicks, base),
          last = tickToSample(((x + 2) / width) * state.timelineTicks, base);
        if (last <= 0 || first >= source.length) continue;
        const range = peakRange(cache, source.length, first, last);
        const middle = laneHeight * (lane + 0.5),
          half = laneHeight / 2 - 2;
        const top = middle - (range.max / FULL_SCALE) * half,
          bottom = middle - (range.min / FULL_SCALE) * half;
        context.fillRect(x, top, 2, Math.max(1, bottom - top));
      }
    }
    hatch(
      context,
      (sampleToTick(source.length, base) / state.timelineTicks) * width,
      width,
      OVERVIEW_HEIGHT,
      palette,
    );
  }
  if (viewportWidth === null) return;
  const left = (state.scrollTick / state.timelineTicks) * width,
    span = Math.max(2, (viewportWidth / state.pxPerTick / state.timelineTicks) * width);
  context.fillStyle = palette.viewportFill;
  context.fillRect(left, 0, span, OVERVIEW_HEIGHT);
  context.strokeStyle = palette.accent;
  context.strokeRect(left + 0.5, 0.5, span, OVERVIEW_HEIGHT - 1);
}
