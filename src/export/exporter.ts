import { sliceFileName, sliceRanges } from '../core/slices';
import { errorMessage } from '../core/messages';
import { portableStem } from '../platform/file-names';
import type { Platform, OutputFile } from '../platform/contracts';
import type { AudioEngine } from '../audio/audio-jobs';
import type { EditorStore } from '../slicing/editor-store';

export function createExporter(
  platform: Platform,
  editor: EditorStore,
  engine: () => AudioEngine | null,
  generation: () => number,
) {
  async function run(single: boolean): Promise<void> {
    const s = editor;
    if (s.exportLock) return;
    const source = s.source;
    const worker = engine();
    if (!source || !worker) {
      editor.setStatus('nothingToExportNoSource', true);
      return;
    }
    const renderSlice = worker.slice.bind(worker);
    const ticks = s.ticks;
    if (!ticks.length) {
      editor.setStatus('nothingToExportNoMarkers', true);
      return;
    }
    const version = generation();
    const base = { bpm: s.doc.bpm, shift: s.doc.shift, sampleRate: source.sampleRate };
    const fadeoutMs = s.doc.fadeoutMs;
    const noisegateDb = s.noisegateEnabled ? s.doc.noisegateDb : 0;
    const baseName = portableStem(s.baseName, 'slice');
    const { ranges, skipped } = sliceRanges(ticks, base, source.length);
    function assertCurrent(): void {
      if (generation() !== version) throw new DOMException('Export cancelled', 'AbortError');
    }
    async function fileAt(index: number): Promise<OutputFile | null> {
      assertCurrent();
      const range = ranges.find((item) => item.index === index);
      if (!range) return null;
      const bytes = await renderSlice({
        start: range.start,
        end: range.end,
        fadeoutMs,
        noisegateDb,
      });
      assertCurrent();
      return { name: sliceFileName(baseName, index), bytes };
    }
    editor.exportLock = true;
    editor.setStatus('exportingSlices', { count: single ? 1 : ticks.length });
    try {
      if (single) {
        let index = ticks.findIndex((t) => t >= s.cursorTick);
        if (index < 0) index = ticks.length - 1;
        const file = await fileAt(index);
        if (file && (await platform.saveFile('wav', file.name, file.bytes))) {
          assertCurrent();
          editor.setStatus('exportedSingle', { file: file.name });
        }
      } else {
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
            ...(skipped
              ? [{ key: 'exportSkippedBeyond' as const, params: { count: skipped } }]
              : []),
          ]);
      }
    } catch (error) {
      if (generation() === version)
        editor.setStatus('exportFailed', { message: errorMessage(error) }, true);
    } finally {
      if (generation() === version) editor.exportLock = false;
    }
  }
  return { exportAll: () => run(false), exportSlice: () => run(true) };
}
