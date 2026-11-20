import { GRID_DENSITIES, gridStepTicks } from '../core/gridlines';
import { latencySamples } from '../core/calibration';
import {
  MEASURE_TICKS,
  resolveBreakpointTick,
  sampleToTickNearest,
  tickToSampleExport,
} from '../core/timebase';
import { formatRate, stepPlaybackRate } from '../core/rate';
import type { AppCommand } from './command-types';
import { commandForKey } from './shortcuts';
import type { EditorStore } from '../slicing/editor-store';
import type { Workspace } from '../workspace/workspace';
import type { Playback } from '../playback';

interface CommandOptions {
  editor: EditorStore;
  workspace: Workspace;
  playback: Playback;
  onClose: () => void | Promise<void>;
  onAbout: () => void | Promise<void>;
  onHelp: () => void | Promise<void>;
  onCalibrate: () => void | Promise<void>;
  onOpenProject?: () => void | Promise<void>;
  onNewProjectFromWos?: () => void | Promise<void>;
}

export function createCommands({
  editor,
  workspace,
  playback,
  onClose,
  onAbout,
  onHelp,
  onCalibrate,
  onOpenProject = () => workspace.openProject(),
  onNewProjectFromWos = () => workspace.newProjectFromWos(),
}: CommandOptions) {
  const { actions } = workspace;
  async function execute(command: AppCommand): Promise<void> {
    switch (command) {
      case 'open-project':
        await onOpenProject();
        return;
      case 'new-project-wos':
        await onNewProjectFromWos();
        return;
      case 'save-project':
        return workspace.saveProject();
      case 'relink-audio':
        return workspace.relinkAudio();
      case 'open-audio':
        return workspace.openAudio();
      case 'import-wos':
        return workspace.importWosSettings();
      case 'import-legacy':
        return workspace.importLegacyRecovery();
      case 'export-wos':
        return workspace.saveWos();
      case 'export-slice':
        await workspace.exportSlice();
        return;
      case 'export-all':
        await workspace.exportAll();
        return;
      case 'undo':
        editor.setStatus(actions.undo() ? 'undo' : 'nothingToUndo');
        return;
      case 'redo':
        editor.setStatus(actions.redo() ? 'redo' : 'nothingToRedo');
        return;
      case 'select-copy':
        actions.copySelection();
        return;
      case 'select-cut':
        actions.cutSelection();
        return;
      case 'select-paste':
        actions.pasteSelection();
        return;
      case 'select-all':
        actions.selectAll();
        return;
      case 'clear-markers':
        actions.clearMarkers();
        editor.setStatus('allMarkersCleared');
        return;
      case 'close-project':
        await onClose();
        return;
      case 'zoom-in':
        editor.zoomAt(editor.cursorTick, 1.25);
        return;
      case 'zoom-out':
        editor.zoomAt(editor.cursorTick, 0.8);
        return;
      case 'help':
        await onHelp();
        return;
      case 'calibrate':
        await onCalibrate();
        return;
      case 'about':
        await onAbout();
        return;
      case 'play-pause':
        playback.togglePlayPause();
        editor.setStatus(editor.playing ? 'playing' : 'paused');
        return;
      case 'preview':
        playback.previewSlice();
        return;
      case 'preview-previous':
        playback.previewSlice(true);
        return;
      case 'grid-down':
        stepGrid(-1);
        return;
      case 'grid-up':
        stepGrid(1);
        return;
      case 'bmse-out':
        await workspace.bmseOut();
        return;
      case 'bmse-in':
        await workspace.bmseIn();
        return;
      case 'clear-selection':
        actions.clearSelection();
        return;
      case 'clip-number-down':
        changeClipNumber(-1);
        return;
      case 'clip-number-up':
        changeClipNumber(1);
        return;
      case 'toggle-ff':
        editor.setOutputOptions({ useFfNumbering: !editor.useFfNumbering });
        editor.setStatus('ffNumberingRule', { state: editor.useFfNumbering ? 'on' : 'off' });
        return;
      case 'toggle-marker':
        actions.toggleMarker();
        return;
      case 'place-breakpoint-free':
        placeBreakpoint(true);
        return;
      case 'place-breakpoint':
        placeBreakpoint(false);
        return;
      case 'rate-down':
        stepRate(-1);
        return;
      case 'rate-up':
        stepRate(1);
        return;
      case 'shift-all-minus':
        actions.shiftAll(-1);
        return;
      case 'shift-all-plus':
        actions.shiftAll(1);
        return;
      case 'measure-paste':
        actions.measurePaste();
        return;
      case 'cursor-left-tick':
        editor.setCursorTick(editor.cursorTick - 1);
        return;
      case 'cursor-right-tick':
        editor.setCursorTick(editor.cursorTick + 1);
        return;
      case 'cursor-left-grid':
        editor.setCursorTick(editor.cursorTick - gridStepTicks(editor.grid));
        return;
      case 'cursor-right-grid':
        editor.setCursorTick(editor.cursorTick + gridStepTicks(editor.grid));
        return;
      case 'cursor-up-measure':
        editor.setCursorTick(editor.cursorTick - MEASURE_TICKS);
        return;
      case 'cursor-down-measure':
        editor.setCursorTick(editor.cursorTick + MEASURE_TICKS);
        return;
      default: {
        const exhaustive: never = command;
        return exhaustive;
      }
    }
  }
  function placeBreakpoint(bypassSnap = false): void {
    const source = editor.source;
    if (!source) {
      editor.setStatus('loadBeforeBreakPoint', true);
      return;
    }
    const base = { bpm: editor.doc.bpm, shift: editor.doc.shift, sampleRate: source.sampleRate };
    const sample = Math.max(
      0,
      playback.currentSample() - latencySamples(editor.tapOffsetMs, source.sampleRate),
    );
    const rawTick = editor.playing ? sampleToTickNearest(sample, base) : editor.cursorTick;
    const tick = resolveBreakpointTick(
      rawTick,
      editor.snap,
      gridStepTicks(editor.grid),
      bypassSnap,
    );
    if (!editor.legalTick(tick)) {
      editor.setStatus('cutBeyondEnd', true);
      return;
    }
    editor.setCursorTick(tick);
    if (!editor.playing) playback.seekSample(tickToSampleExport(tick, base));
    if (actions.setMarker(tick, true)) editor.setStatus('breakPointAtTick', { tick });
    else
      editor.setStatus('breakPointAlreadyAtTick', {
        measure: Math.floor(tick / MEASURE_TICKS) + 1,
        tick,
      });
  }
  function stepRate(direction: -1 | 1): void {
    const step = stepPlaybackRate(editor.playbackRate, direction);
    playback.setRate(step.rate);
    editor.setStatus(
      step.clamped ? (direction < 0 ? 'alreadySlowest' : 'alreadyFastest') : 'playbackRate',
      { rate: formatRate(step.rate) },
    );
  }
  function stepGrid(direction: -1 | 1): void {
    const index = GRID_DENSITIES.indexOf(editor.grid);
    const next =
      GRID_DENSITIES[
        Math.max(0, Math.min(GRID_DENSITIES.length - 1, (index < 0 ? 2 : index) + direction))
      ];
    if (next !== undefined) {
      editor.grid = next;
      editor.setStatus('gridPerMeasure', { grid: next });
    }
  }
  function changeClipNumber(direction: -1 | 1): void {
    editor.setOutputOptions({
      clipStartNumber: Math.max(0, Math.min(9999, editor.clipStartNumber + direction)),
    });
    editor.setStatus('clipStartNumber', { number: editor.clipStartNumber });
  }
  async function run(command: AppCommand): Promise<void> {
    try {
      await execute(command);
    } catch (error: unknown) {
      editor.setStatus(
        'loadFailed',
        { message: error instanceof Error ? error.message : String(error) },
        true,
      );
    }
  }
  function onKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing || event.key === 'Process') return;
    const target = event.target;
    if (
      target instanceof Element &&
      (target.closest(
        'input,textarea,select,[contenteditable="true"],[role="dialog"],[role="listbox"],[role="slider"],[role="tablist"]',
      ) ||
        ((event.key === ' ' || event.key === 'Enter') && target.closest('button,[role="button"]')))
    )
      return;
    if (
      typeof document !== 'undefined' &&
      Array.from(document.querySelectorAll('[role="dialog"]')).some(
        (dialog) => dialog.getClientRects().length > 0,
      )
    )
      return;
    const command = commandForKey(event);
    if (!command) return;
    event.preventDefault();
    void run(command);
  }
  return { execute, onKeyDown, placeBreakpoint, stepRate };
}
