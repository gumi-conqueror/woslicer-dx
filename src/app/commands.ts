import { GRID_DENSITIES, gridStepTicks } from '../core/gridlines';
import { latencySamples } from '../core/calibration';
import {
  MEASURE_TICKS,
  resolveBreakpointTick,
  sampleToTickNearest,
  tickToSampleExport,
} from '../core/timebase';
import { formatRate, stepPlaybackRate } from '../core/rate';
import { RECORDING_SEEK_SECONDS, type RecordingInput } from '../input/recording';
import type { EditorStore } from '../slicing/editor-store';
import { FIELD_RANGES } from '../project/schema';
import type { Workspace } from '../workspace/workspace';
import type { Playback } from '../playback';
import { visibleDialog } from '../input/context';

/** The editor state that command availability reads. */
export type CommandState = Pick<
  EditorStore,
  'document' | 'track' | 'source' | 'ticks' | 'selectedTicks' | 'canUndo' | 'canRedo'
>;
/** Help groups, in the order the help dialog shows them. */
export const COMMAND_GROUPS = ['project', 'edit', 'playback', 'navigation', 'output'] as const;
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

/** Application actions that commands open; the app shell supplies them. */
export interface CommandHosts {
  close(): void | Promise<void>;
  about(): void | Promise<void>;
  help(): void | Promise<void>;
  troubleshoot?(): void | Promise<void>;
  openDataFolder?(): void | Promise<void>;
  calibrate(): void | Promise<void>;
  toggleRecording?(): void;
  connectYuancon?(): void;
  openWheel?(): void;
  inputSettings?(): void;
  openProject(): void | Promise<void>;
  newProjectFromWos(): void | Promise<void>;
  /** An app-owned dialog or lock is open. Visible dialogs always block commands. */
  modalOpen?(): boolean;
  /** Shows a command failure. Every input source reports through it. */
  report(error: unknown): void;
}
interface CommandContext {
  editor: EditorStore;
  workspace: Workspace;
  playback: Playback;
  hosts: CommandHosts;
}
interface CommandDefinition<Args> {
  /** Message key of the menu, help and wheel label. */
  label: string;
  group: CommandGroup;
  /** Availability for menus and the wheel. Execution keeps each feature's own guard and message. */
  enabled?(state: CommandState): boolean;
  // Feature actions may return a value, such as whether anything changed; commands ignore it.
  run(context: CommandContext, args: Args): unknown;
}

/** Recording needs audio. */
export function canRecord(state: Pick<CommandState, 'source'>): boolean {
  return state.source !== null;
}
const hasSource = (state: CommandState) => state.source !== null;
const hasMarkers = (state: CommandState) => state.ticks.length > 0;

/**
 * Every application command. Menus, shortcuts, controllers, YuanCon and the
 * command wheel run commands only through `createCommands().run`. Bindings and
 * wheel layouts store these ids; rename one only together with a migration.
 */
export const COMMANDS = {
  'open-project': {
    label: 'menu.openProject',
    group: 'project',
    run: ({ hosts }) => hosts.openProject(),
  },
  'save-project': {
    label: 'menu.saveProject',
    group: 'project',
    run: ({ workspace }) => workspace.saveProject(),
  },
  'relink-audio': {
    label: 'menu.relinkAudio',
    group: 'project',
    enabled: (state) => state.track.media !== null,
    run: ({ workspace }) => workspace.relinkAudio(),
  },
  'open-audio': {
    label: 'menu.openAudio',
    group: 'project',
    run: ({ workspace }) => workspace.openAudio(),
  },
  'add-track': {
    label: 'menu.addTrack',
    group: 'project',
    run: ({ workspace }) => workspace.addTrack(),
  },
  'remove-track': {
    label: 'menu.removeTrack',
    group: 'project',
    enabled: (state) => state.document.tracks.length > 1,
    run: ({ workspace }) => workspace.removeTrack(),
  },
  'previous-track': {
    label: 'help.previousTrack',
    group: 'navigation',
    run: ({ workspace }) => workspace.stepTrack(-1),
  },
  'next-track': {
    label: 'help.nextTrack',
    group: 'navigation',
    run: ({ workspace }) => workspace.stepTrack(1),
  },
  'new-project-wos': {
    label: 'menu.newProjectWos',
    group: 'project',
    run: ({ hosts }) => hosts.newProjectFromWos(),
  },
  'import-wos': {
    label: 'menu.importWos',
    group: 'project',
    run: ({ workspace }) => workspace.importWosSettings(),
  },
  'export-wos': {
    label: 'menu.exportWos',
    group: 'project',
    run: ({ workspace }) => workspace.saveWos(),
  },
  'close-project': { label: 'chrome.close', group: 'project', run: ({ hosts }) => hosts.close() },
  help: { label: 'menu.guide', group: 'project', run: ({ hosts }) => hosts.help() },
  troubleshoot: {
    label: 'menu.troubleshoot',
    group: 'project',
    run: ({ hosts }) => hosts.troubleshoot?.(),
  },
  'open-data-folder': {
    label: 'menu.openDataFolder',
    group: 'project',
    run: ({ hosts }) => hosts.openDataFolder?.(),
  },
  about: { label: 'menu.about', group: 'project', run: ({ hosts }) => hosts.about() },
  calibrate: {
    label: 'chrome.calibrate',
    group: 'playback',
    enabled: hasSource,
    run: ({ hosts }) => hosts.calibrate(),
  },
  'connect-yuancon': {
    label: 'recording.controller',
    group: 'playback',
    run: ({ hosts }) => hosts.connectYuancon?.(),
  },
  'input-settings': {
    label: 'menu.inputSettings',
    group: 'navigation',
    run: ({ hosts }) => hosts.inputSettings?.(),
  },
  'open-wheel': {
    label: 'input.wheel',
    group: 'navigation',
    run: ({ hosts }) => hosts.openWheel?.(),
  },
  undo: {
    label: 'menu.undo',
    group: 'edit',
    enabled: (state) => state.canUndo,
    run: ({ editor, workspace }) =>
      editor.setStatus(workspace.actions.undo() ? 'undo' : 'nothingToUndo'),
  },
  redo: {
    label: 'menu.redo',
    group: 'edit',
    enabled: (state) => state.canRedo,
    run: ({ editor, workspace }) =>
      editor.setStatus(workspace.actions.redo() ? 'redo' : 'nothingToRedo'),
  },
  'copy-selection': {
    label: 'menu.copySelection',
    group: 'edit',
    enabled: hasMarkers,
    run: ({ workspace }) => workspace.actions.copySelection(),
  },
  'cut-selection': {
    label: 'menu.cutSelection',
    group: 'edit',
    enabled: (state) => state.selectedTicks.length > 0,
    run: ({ workspace }) => workspace.actions.cutSelection(),
  },
  'paste-selection': {
    label: 'menu.pasteSelection',
    group: 'edit',
    run: ({ workspace }) => workspace.actions.pasteSelection(),
  },
  'measure-paste': {
    label: 'help.measurePaste',
    group: 'edit',
    run: ({ workspace }) => workspace.actions.measurePaste(),
  },
  'select-all': {
    label: 'menu.selectAll',
    group: 'edit',
    enabled: hasMarkers,
    run: ({ workspace }) => workspace.actions.selectAll(),
  },
  'clear-selection': {
    label: 'help.clearSelection',
    group: 'edit',
    run: ({ workspace }) => workspace.actions.clearSelection(),
  },
  'clear-markers': {
    label: 'menu.clearMarkers',
    group: 'edit',
    enabled: hasMarkers,
    run: ({ editor, workspace }) => {
      workspace.actions.clearMarkers();
      editor.setStatus('allMarkersCleared');
    },
  },
  'toggle-marker': {
    label: 'help.toggleMarker',
    group: 'edit',
    run: ({ workspace }) => workspace.actions.toggleMarker(),
  },
  'place-marker': {
    label: 'help.placeBreakpoint',
    group: 'edit',
    enabled: hasSource,
    run: (context) => placeMarker(context, false),
  },
  'place-marker-free': {
    label: 'help.placeBreakpointFree',
    group: 'edit',
    enabled: hasSource,
    run: (context) => placeMarker(context, true),
  },
  'shift-markers-earlier': {
    label: 'help.shiftAllMinus',
    group: 'edit',
    enabled: hasMarkers,
    run: ({ workspace }) => workspace.actions.shiftAll(-1),
  },
  'shift-markers-later': {
    label: 'help.shiftAllPlus',
    group: 'edit',
    enabled: hasMarkers,
    run: ({ workspace }) => workspace.actions.shiftAll(1),
  },
  'play-pause': {
    label: 'help.playPause',
    group: 'playback',
    enabled: hasSource,
    run: ({ editor, playback }) => {
      playback.togglePlayPause();
      editor.setStatus(editor.playing ? 'playing' : 'paused');
    },
  },
  preview: {
    label: 'help.preview',
    group: 'playback',
    enabled: hasSource,
    run: ({ playback }) => playback.previewSlice(),
  },
  'preview-previous': {
    label: 'help.previewPrevious',
    group: 'playback',
    enabled: hasSource,
    run: ({ playback }) => playback.previewSlice(true),
  },
  'rate-down': { label: 'help.rateDown', group: 'playback', run: (c) => stepRate(c, -1) },
  'rate-up': { label: 'help.rateUp', group: 'playback', run: (c) => stepRate(c, 1) },
  'toggle-recording': {
    label: 'recording.mode',
    group: 'playback',
    enabled: canRecord,
    run: ({ editor, hosts }) => {
      if (canRecord(editor)) hosts.toggleRecording?.();
    },
  },
  'recording-tap': {
    label: 'recording.tap',
    group: 'playback',
    enabled: canRecord,
    run: (context, input?: RecordingInput) => placeMarker(context, false, 'playhead', input),
  },
  'seek-backward': {
    label: 'recording.backward',
    group: 'playback',
    enabled: canRecord,
    run: (context) => seekBy(context, -RECORDING_SEEK_SECONDS),
  },
  'seek-forward': {
    label: 'recording.forward',
    group: 'playback',
    enabled: canRecord,
    run: (context) => seekBy(context, RECORDING_SEEK_SECONDS),
  },
  'zoom-in': {
    label: 'menu.zoomIn',
    group: 'navigation',
    run: ({ editor }) => editor.zoomAt(editor.cursorTick, 1.25),
  },
  'zoom-out': {
    label: 'menu.zoomOut',
    group: 'navigation',
    run: ({ editor }) => editor.zoomAt(editor.cursorTick, 0.8),
  },
  'grid-down': { label: 'help.gridDown', group: 'navigation', run: (c) => stepGrid(c, -1) },
  'grid-up': { label: 'help.gridUp', group: 'navigation', run: (c) => stepGrid(c, 1) },
  'cursor-left-grid': {
    label: 'help.cursorLeftGrid',
    group: 'navigation',
    run: ({ editor }) => editor.setCursorTick(editor.cursorTick - gridStepTicks(editor.grid)),
  },
  'cursor-right-grid': {
    label: 'help.cursorRightGrid',
    group: 'navigation',
    run: ({ editor }) => editor.setCursorTick(editor.cursorTick + gridStepTicks(editor.grid)),
  },
  'cursor-left-tick': {
    label: 'help.cursorLeftTick',
    group: 'navigation',
    run: ({ editor }) => editor.setCursorTick(editor.cursorTick - 1),
  },
  'cursor-right-tick': {
    label: 'help.cursorRightTick',
    group: 'navigation',
    run: ({ editor }) => editor.setCursorTick(editor.cursorTick + 1),
  },
  'cursor-previous-measure': {
    label: 'help.cursorUpMeasure',
    group: 'navigation',
    run: ({ editor }) => editor.setCursorTick(editor.cursorTick - MEASURE_TICKS),
  },
  'cursor-next-measure': {
    label: 'help.cursorDownMeasure',
    group: 'navigation',
    run: ({ editor }) => editor.setCursorTick(editor.cursorTick + MEASURE_TICKS),
  },
  'export-slice': {
    label: 'menu.exportSlice',
    group: 'output',
    enabled: (state) => hasSource(state) && hasMarkers(state),
    run: ({ workspace }) => workspace.exportSlice(),
  },
  'export-all': {
    label: 'menu.exportAll',
    group: 'output',
    enabled: (state) => hasSource(state) && hasMarkers(state),
    run: ({ workspace }) => workspace.exportAll(),
  },
  'export-all-tracks': {
    label: 'menu.exportAllTracks',
    group: 'output',
    enabled: (state) => state.document.tracks.some((track) => track.slicing.markers.length > 0),
    run: ({ workspace }) => workspace.exportAllTracks(),
  },
  'copy-bmse': {
    label: 'help.bmseOut',
    group: 'output',
    enabled: hasMarkers,
    run: ({ workspace }) => workspace.bmseOut(),
  },
  'paste-bmse': {
    label: 'help.bmseIn',
    group: 'output',
    run: ({ workspace }) => workspace.bmseIn(),
  },
  'clip-number-down': {
    label: 'help.clipNumberDown',
    group: 'output',
    run: (c) => changeClipNumber(c, -1),
  },
  'clip-number-up': {
    label: 'help.clipNumberUp',
    group: 'output',
    run: (c) => changeClipNumber(c, 1),
  },
  'toggle-ff': {
    label: 'help.toggleFf',
    group: 'output',
    run: ({ editor }) => {
      editor.setOutputOptions({ useFfNumbering: !editor.useFfNumbering });
      editor.setStatus('ffNumberingRule', { state: editor.useFfNumbering ? 'on' : 'off' });
    },
  },
} satisfies Record<string, CommandDefinition<never>>;

export type AppCommand = keyof typeof COMMANDS;
/** The arguments a command declares; only `recording-tap` takes any. */
export type CommandArgs<C extends AppCommand> = Parameters<(typeof COMMANDS)[C]['run']>[1];
/** `blocked`: a dialog was open. `failed`: the command threw and was reported. */
export type CommandResult = 'done' | 'blocked' | 'failed';

const definitions: Readonly<Record<AppCommand, CommandDefinition<RecordingInput | undefined>>> =
  COMMANDS;
export function isAppCommand(value: unknown): value is AppCommand {
  return typeof value === 'string' && Object.hasOwn(COMMANDS, value);
}
export const APP_COMMANDS: readonly AppCommand[] = Object.keys(COMMANDS).filter(isAppCommand);
export function commandLabel(id: AppCommand): string {
  return definitions[id].label;
}
export function commandGroup(id: AppCommand): CommandGroup {
  return definitions[id].group;
}
export function commandEnabled(id: AppCommand, state: CommandState): boolean {
  return definitions[id].enabled?.(state) ?? true;
}

export function createCommands(options: {
  editor: EditorStore;
  workspace: Workspace;
  playback: Playback;
  hosts: CommandHosts;
}) {
  const context: CommandContext = options;
  const { hosts } = options;
  /** The one execution entry. A dialog blocks every source; failures are reported here. */
  async function run<C extends AppCommand>(id: C, args?: CommandArgs<C>): Promise<CommandResult> {
    if (visibleDialog() || hosts.modalOpen?.()) return 'blocked';
    try {
      await definitions[id].run(context, args);
      return 'done';
    } catch (error: unknown) {
      hosts.report(error);
      return 'failed';
    }
  }
  return { run };
}
export type RunCommand = ReturnType<typeof createCommands>['run'];

/** Moves the playhead by whole seconds within the source; the cursor follows it. */
function seekBy({ editor, playback }: CommandContext, seconds: number): void {
  const source = editor.source;
  if (!source) return;
  const sample = Math.max(
    0,
    Math.min(source.length, playback.currentSample() + seconds * source.sampleRate),
  );
  playback.seekSample(sample);
  if (editor.timeBase) editor.setCursorTick(sampleToTickNearest(sample, editor.timeBase));
}
function placeMarker(
  { editor, workspace, playback }: CommandContext,
  bypassSnap: boolean,
  position: 'cursor' | 'playhead' = 'cursor',
  input?: RecordingInput,
): void {
  const source = editor.source,
    base = editor.timeBase;
  if (!source || !base) {
    editor.setStatus('loadBeforeBreakPoint', true);
    return;
  }
  const captured =
    input?.time === undefined
      ? { sample: playback.currentSample(), playing: editor.playing }
      : playback.positionAt(input.time);
  if (!captured) return;
  const sample = Math.max(
    0,
    captured.sample -
      (captured.playing ? latencySamples(editor.tapOffsetMs, source.sampleRate) : 0),
  );
  const rawTick =
    editor.playing || position === 'playhead'
      ? sampleToTickNearest(sample, base)
      : editor.cursorTick;
  const tick = resolveBreakpointTick(rawTick, editor.snap, gridStepTicks(editor.grid), bypassSnap);
  if (!editor.legalTick(tick)) {
    editor.setStatus('cutBeyondEnd', true);
    return;
  }
  editor.setCursorTick(tick);
  if (!editor.playing && position === 'cursor') playback.seekSample(tickToSampleExport(tick, base));
  if (workspace.actions.setMarker(tick, true, input?.keys))
    editor.setStatus('breakPointAtTick', { tick });
  else
    editor.setStatus('breakPointAlreadyAtTick', {
      measure: Math.floor(tick / MEASURE_TICKS) + 1,
      tick,
    });
}
function stepRate({ editor, playback }: CommandContext, direction: -1 | 1): void {
  const step = stepPlaybackRate(editor.playbackRate, direction);
  playback.setRate(step.rate);
  editor.setStatus(
    step.clamped ? (direction < 0 ? 'alreadySlowest' : 'alreadyFastest') : 'playbackRate',
    { rate: formatRate(step.rate) },
  );
}
function stepGrid({ editor }: CommandContext, direction: -1 | 1): void {
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
function changeClipNumber({ editor }: CommandContext, direction: -1 | 1): void {
  editor.setOutputOptions({
    clipStartNumber: Math.max(
      FIELD_RANGES.clipStartNumber.min,
      Math.min(FIELD_RANGES.clipStartNumber.max, editor.clipStartNumber + direction),
    ),
  });
  editor.setStatus('clipStartNumber', { number: editor.clipStartNumber });
}
