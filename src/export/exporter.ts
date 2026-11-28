import { inject, provide, type InjectionKey } from 'vue';
import { sliceFileName, sliceRanges } from '../core/slices';
import { errorMessage } from '../core/messages';
import { portableStem } from '../platform/file-names';
import type { Platform, OutputFile } from '../platform/contracts';
import type { EditorStore } from '../slicing/editor-store';
import type { WorkspaceAudio } from '../workspace/workspace';
import { currentTrack } from '../project/codec';
import { defaultSelection, exportJobs, markerRows, type ExportJob } from './export-plan';

export function createExporter(platform: Platform, editor: EditorStore, audio: WorkspaceAudio) {
  /**
   * The slices of one track's audio, or why it has none to export. By default
   * the track's own markers cut it; an export job can give other markers and a
   * suffix for the base name.
   */
  function trackSlices(trackId: string, assertCurrent: () => void, job?: ExportJob) {
    const source = editor.sessions.get(trackId)?.source ?? null;
    const worker = audio.engine(trackId);
    const base = editor.timeBaseOf(trackId);
    const track = currentTrack(editor.document, trackId);
    if (!source || !worker || !base) return { kind: 'no-source' as const };
    const ticks = job?.ticks ?? track.slicing.markers;
    if (!ticks.length) return { kind: 'no-markers' as const };
    const { fadeoutMs, noisegateDb } = editor.sliceProcessingOf(trackId);
    const name = track.output.baseName;
    const baseName = portableStem(job?.suffix ? `${name}_${job.suffix}` : name, 'slice');
    const { ranges, skipped } = sliceRanges(ticks, base, source.length);
    async function fileAt(index: number): Promise<OutputFile | null> {
      assertCurrent();
      const range = ranges.find((item) => item.index === index);
      if (!range || !worker) return null;
      const bytes = await worker.slice({
        start: range.start,
        end: range.end,
        fadeoutMs,
        noisegateDb,
      });
      assertCurrent();
      return { name: sliceFileName(baseName, index), bytes };
    }
    return { kind: 'ready' as const, ticks, baseName, ranges, skipped, fileAt };
  }

  /** Runs one export with the shared lock, cancellation and failure report. */
  async function exclusive(task: (assertCurrent: () => void) => Promise<void>): Promise<void> {
    if (editor.exportLock) return;
    const version = audio.generation();
    function assertCurrent(): void {
      if (audio.generation() !== version) throw new DOMException('Export cancelled', 'AbortError');
    }
    editor.exportLock = true;
    try {
      await task(assertCurrent);
    } catch (error) {
      if (audio.generation() === version)
        editor.setStatus('exportFailed', { message: errorMessage(error) }, true);
    } finally {
      if (audio.generation() === version) editor.exportLock = false;
    }
  }

  async function run(single: boolean): Promise<void> {
    await exclusive(async (assertCurrent) => {
      const slices = trackSlices(editor.track.trackId, assertCurrent);
      if (slices.kind === 'no-source') {
        editor.setStatus('nothingToExportNoSource', true);
        return;
      }
      if (slices.kind === 'no-markers') {
        editor.setStatus('nothingToExportNoMarkers', true);
        return;
      }
      const { ticks, ranges, skipped, baseName, fileAt } = slices;
      editor.setStatus('exportingSlices', { count: single ? 1 : ticks.length });
      if (single) {
        let index = ticks.findIndex((t) => t >= editor.cursorTick);
        if (index < 0) index = ticks.length - 1;
        const file = await fileAt(index);
        if (file && (await platform.saveFile('wav', file.name, file.bytes))) {
          assertCurrent();
          editor.setStatus('exportedSingle', { file: file.name });
        }
        return;
      }
      async function* files(): AsyncGenerator<OutputFile> {
        for (const range of ranges) {
          const file = await fileAt(range.index);
          if (file) yield file;
        }
      }
      const count = await platform.exportFiles(files(), `${baseName}.zip`);
      assertCurrent();
      if (count !== null)
        editor.setStatus([
          { key: 'exportedSlicesTo', params: { count, directory: baseName } },
          ...(skipped ? [{ key: 'exportSkippedBeyond' as const, params: { count: skipped } }] : []),
        ]);
    });
  }

  /**
   * Exports export jobs into one archive or folder named after the project:
   * the audio of a track cut at a set of markers each. Each job uses its
   * track's base name and numbering; equal file names stop the export before writing.
   */
  async function exportTracks(plan: readonly ExportJob[]): Promise<void> {
    await exclusive(async (assertCurrent) => {
      const jobs = plan.map((job) => trackSlices(job.trackId, assertCurrent, job));
      const ready = jobs.filter((job) => job.kind === 'ready');
      const withoutAudio = jobs.filter((job) => job.kind === 'no-source').length;
      if (!ready.length) {
        editor.setStatus('nothingToExportNoMarkers', true);
        return;
      }
      const names = new Set<string>();
      for (const job of ready)
        for (const range of job.ranges) {
          const name = sliceFileName(job.baseName, range.index);
          if (names.has(name)) {
            editor.setStatus('exportNameConflict', { name }, true);
            return;
          }
          names.add(name);
        }
      editor.setStatus('exportingSlices', { count: names.size });
      async function* files(): AsyncGenerator<OutputFile> {
        for (const job of ready)
          for (const range of job.ranges) {
            const file = await job.fileAt(range.index);
            if (file) yield file;
          }
      }
      const directory = portableStem(editor.document.name, 'slices');
      const count = await platform.exportFiles(files(), `${directory}.zip`);
      assertCurrent();
      if (count === null) return;
      const skipped = ready.reduce((sum, job) => sum + job.skipped, 0);
      editor.setStatus([
        { key: 'exportedSlicesTo', params: { count, directory } },
        ...(skipped ? [{ key: 'exportSkippedBeyond' as const, params: { count: skipped } }] : []),
        ...(withoutAudio
          ? [{ key: 'exportTracksWithoutAudio' as const, params: { count: withoutAudio } }]
          : []),
      ]);
    });
  }
  /** Exports every track's audio cut at its own markers. */
  function exportAllTracks(): Promise<void> {
    const { tracks } = editor.document;
    const rows = markerRows(tracks);
    return exportTracks(exportJobs(tracks, rows, defaultSelection(rows)));
  }
  return {
    exportAll: () => run(false),
    exportSlice: () => run(true),
    exportAllTracks,
    exportTracks,
  };
}
export type Exporter = ReturnType<typeof createExporter>;
export const exporterKey: InjectionKey<Exporter> = Symbol('exporter');
export function provideExporter(exporter: Exporter): void {
  provide(exporterKey, exporter);
}
export function useExporter(): Exporter {
  const exporter = inject(exporterKey);
  if (!exporter) throw new Error('Exporter provider is missing');
  return exporter;
}
