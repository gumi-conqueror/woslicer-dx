import { inject, provide, type InjectionKey } from 'vue';
import { BAND_NAMES } from '../core/bands';
import { errorMessage } from '../core/messages';
import { gridStepTicks } from '../core/gridlines';
import type { EditorStore } from '../slicing/editor-store';
import type { WorkspaceAudio } from '../workspace/workspace';

export function createDetection(editor: EditorStore, audio: WorkspaceAudio) {
  /** Band analysis and both detectors report a failure the same way; stale results stay silent. */
  function reportFailure(error: unknown, version: number): void {
    if (audio.generation() === version)
      editor.setStatus('detectionFailed', { message: errorMessage(error) }, true);
  }
  let analysisTask: { generation: number; task: Promise<void> } | null = null;
  function ensureBands(): Promise<void> {
    const worker = audio.currentEngine(),
      source = editor.source,
      version = audio.generation();
    if (!worker || !source || editor.bandAnalysis) return Promise.resolve();
    if (analysisTask?.generation === version) return analysisTask.task;
    editor.bandBusy = true;
    editor.setStatus('analyzingBands');
    const task = worker
      .bands()
      .then((analysis) => {
        if (audio.generation() === version) editor.setBandAnalysis(analysis);
      })
      .catch((error) => {
        reportFailure(error, version);
      })
      .finally(() => {
        if (audio.generation() === version) editor.bandBusy = false;
        if (analysisTask?.generation === version) analysisTask = null;
      });
    analysisTask = { generation: version, task };
    return task;
  }
  async function detect(): Promise<void> {
    const version = audio.generation(),
      worker = audio.currentEngine();
    if (!editor.source || !worker) {
      editor.setStatus('bandDetectNeedsSource', true);
      return;
    }
    if (editor.bandBusy && !analysisTask) return;
    const settings = editor.bandDetection;
    const bands = BAND_NAMES.filter((name) => settings.bands[name]);
    if (!bands.length) {
      editor.setStatus('bandDetectSelectBand', true);
      return;
    }
    await ensureBands();
    const base = editor.timeBase;
    if (version !== audio.generation() || !editor.bandAnalysis || !base) return;
    const revision = editor.docRevision;
    const start = editor.selectionStartTick,
      end = editor.selectionEndTick;
    const cell = gridStepTicks(editor.grid),
      threshold = settings.thresholdDb;
    editor.bandBusy = true;
    try {
      const result = await worker.detect({
        bands,
        thresholdDb: threshold,
        grid: cell,
        minGapTicks: cell * settings.minGapUnits,
        fromTick: start === null || end === null ? 0 : Math.min(start, end),
        toTick: start === null || end === null ? editor.timelineTicks : Math.max(start, end),
        base,
        existing: new Set(editor.ticks),
        snap: settings.snap,
      });
      // An edit or source replacement while detecting invalidates its captured time base.
      if (audio.generation() !== version || editor.docRevision !== revision) return;
      const legal = result.ticks.filter(editor.legalTick);
      const count = editor.addTicks(legal);
      editor.bandEstimate = count;
      editor.setStatus(count ? 'bandDetectCuts' : 'bandDetectZero', {
        count,
        bands: bands.join('/'),
        threshold,
      });
    } catch (error) {
      reportFailure(error, version);
    } finally {
      if (audio.generation() === version) editor.bandBusy = false;
    }
  }
  async function edgeDetect(): Promise<void> {
    const worker = audio.currentEngine(),
      base = editor.timeBase,
      version = audio.generation(),
      revision = editor.docRevision;
    if (!worker || !base) {
      editor.setStatus('edgeDetectionNeedsSource', true);
      return;
    }
    if (editor.bandBusy) return;
    editor.bandBusy = true;
    try {
      const ticks = await worker.edges(base);
      if (version !== audio.generation() || revision !== editor.docRevision) return;
      const legal = ticks.filter(editor.legalTick);
      editor.setTicks(legal, []);
      editor.setStatus('edgeDetectionCandidates', { count: legal.length });
    } catch (error) {
      reportFailure(error, version);
    } finally {
      if (audio.generation() === version) editor.bandBusy = false;
    }
  }
  return { ensureBands, detect, edgeDetect };
}
export type Detection = ReturnType<typeof createDetection>;
export const detectionKey: InjectionKey<Detection> = Symbol('detection');
export function provideDetection(detection: Detection): void {
  provide(detectionKey, detection);
}
export function useDetection(): Detection {
  const detection = inject(detectionKey);
  if (!detection) throw new Error('Detection provider is missing');
  return detection;
}
