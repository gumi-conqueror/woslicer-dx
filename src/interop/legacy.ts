import { inject, provide, type InjectionKey } from 'vue';
import { readWos, writeWos } from '@gumi-conqueror/wos-file';
import { errorMessage } from '../core/messages';
import { buildBmseClipboard, parseBmseClipboard } from '../core/formats/bmse';
import { currentTrack, markersBeyondWos, projectFromWos, projectToWos } from '../project/codec';
import type { Platform } from '../platform/contracts';
import type { EditorStore } from '../slicing/editor-store';
import type { WorkspaceAudio } from '../workspace/workspace';

/**
 * Exchange with the formats of the original tools: WOS settings files of
 * woslicer and the BMSE clipboard. Each function works on the current track.
 * Opening a WOS file as a new project replaces the workspace and is
 * `newProjectFromWos` in the workspace.
 */
export function createLegacyInterop(
  platform: Platform,
  editor: EditorStore,
  audio: WorkspaceAudio,
) {
  /** Imports timing and cuts into the current project in one undo step, keeping its identity and media. */
  async function importWosSettings(): Promise<void> {
    const revision = editor.docRevision;
    try {
      const file = await platform.openFile('wos');
      if (!file || audio.closed() || revision !== editor.docRevision) return;
      const data = readWos(file.bytes);
      const wos = projectFromWos(data, file.name);
      const imported = currentTrack(wos).slicing;
      editor.transact((draft) => {
        draft.timing = { ...wos.timing };
        const { slicing } = currentTrack(draft, editor.currentTrackId);
        slicing.fadeoutMs = imported.fadeoutMs;
        slicing.noisegateDb = imported.noisegateDb;
        slicing.markers = imported.markers;
        delete slicing.markerKeys;
      });
      editor.setStatus('importedWosSettings', {
        file: file.name,
        bpm: wos.timing.bpm,
        shift: wos.timing.shiftTicks,
      });
    } catch (error) {
      if (!audio.closed())
        editor.setStatus('wosLoadFailed', { message: errorMessage(error) }, true);
    }
  }
  async function saveWos(): Promise<void> {
    const version = audio.generation();
    try {
      const bytes = writeWos(projectToWos(editor.document, editor.currentTrackId));
      const dropped = markersBeyondWos(editor.document, editor.currentTrackId);
      const name = `${editor.source?.name ?? 'untitled'}.wos`;
      if ((await platform.saveFile('wos', name, bytes)) && version === audio.generation())
        if (dropped)
          editor.setStatus(
            [
              { key: 'savedWos', params: { file: name } },
              { key: 'wosMarkersDropped', params: { count: dropped } },
            ],
            true,
          );
        else editor.setStatus('savedWos', { file: name });
    } catch (error) {
      if (version === audio.generation())
        editor.setStatus('wosSaveFailed', { message: errorMessage(error) }, true);
    }
  }
  async function bmseOut(): Promise<void> {
    if (!editor.ticks.length) {
      editor.setStatus('noMarkersToCopy', true);
      return;
    }
    try {
      await platform.writeClipboard(
        buildBmseClipboard(editor.ticks, {
          startNumber: editor.clipStartNumber,
          numbering: editor.useFfNumbering ? 'restricted' : 'extended',
        }),
      );
      editor.setStatus('bmseClipboardOut', {
        count: editor.ticks.length,
        start: editor.clipStartNumber,
      });
    } catch (error) {
      editor.setStatus('bmseReadFailed', { message: errorMessage(error) }, true);
    }
  }
  async function bmseIn(): Promise<void> {
    const version = audio.generation();
    try {
      const parsed = parseBmseClipboard(await platform.readClipboard());
      if (version !== audio.generation()) return;
      const legal = parsed.ticks.filter(editor.legalTick);
      editor.setTicks(legal, []);
      editor.setStatus('bmseClipboardImported', { count: legal.length });
    } catch (error) {
      if (version === audio.generation())
        editor.setStatus('bmseReadFailed', { message: errorMessage(error) }, true);
    }
  }
  return { importWosSettings, saveWos, bmseIn, bmseOut };
}
export type LegacyInterop = ReturnType<typeof createLegacyInterop>;
export const legacyInteropKey: InjectionKey<LegacyInterop> = Symbol('legacy-interop');
export function provideLegacyInterop(interop: LegacyInterop): void {
  provide(legacyInteropKey, interop);
}
export function useLegacyInterop(): LegacyInterop {
  const interop = inject(legacyInteropKey);
  if (!interop) throw new Error('LegacyInterop provider is missing');
  return interop;
}
