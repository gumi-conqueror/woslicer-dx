import { describe, expect, it } from 'vitest';
import {
  APP_COMMANDS,
  COMMANDS,
  commandEnabled,
  type AppCommand,
  type CommandState as MenuEditorState,
} from '../../src/app/commands';
import { APPLICATION_MENU } from '../../src/app/menu';

const track = (media: unknown) => ({ media }) as unknown as MenuEditorState['track'];
const tracks = (count: number) =>
  ({
    tracks: Array.from({ length: count }, () => ({ slicing: { markers: [] } })),
  }) as unknown as MenuEditorState['document'];
const state = (overrides: Partial<MenuEditorState> = {}): MenuEditorState => ({
  track: track(null),
  document: tracks(1),
  source: null,
  ticks: [],
  selectedTicks: [],
  canUndo: false,
  canRedo: false,
  ...overrides,
});
const withSource = state({
  source: { name: 'a' } as unknown as MenuEditorState['source'],
  ticks: [12],
});
const busy = state({ ticks: [12], selectedTicks: [12], track: track({}) });

const table: ReadonlyArray<readonly [AppCommand, MenuEditorState, boolean]> = [
  // Always available: project replacement, explicit save, close, view helpers.
  ['open-project', state(), true],
  ['new-project-wos', busy, true],
  ['save-project', busy, true],
  ['close-project', busy, true],
  ['zoom-in', busy, true],
  ['zoom-out', busy, true],
  ['about', busy, true],
  ['help', busy, true],
  ['troubleshoot', busy, true],
  ['open-data-folder', busy, true],
  ['connect-yuancon', state(), true],
  ['toggle-recording', state(), false],
  ['toggle-recording', withSource, true],
  ['calibrate', state(), false],
  ['calibrate', withSource, true],
  ['open-audio', state(), true],
  ['import-wos', state(), true],
  ['export-wos', state(), true],
  // Relink needs audio on the track.
  ['relink-audio', state(), false],
  ['relink-audio', busy, true],
  // Exports need a decoded source and at least one cut.
  ['export-slice', state(), false],
  ['export-slice', state({ source: { name: 'a' } as unknown as MenuEditorState['source'] }), false],
  ['export-slice', withSource, true],
  ['export-all', withSource, true],
  // History availability mirrors the editor.
  ['undo', state({ canUndo: true }), true],
  ['undo', withSource, false],
  ['redo', state({ canRedo: true }), true],
  // Selection helpers need markers.
  ['select-all', withSource, true],
  ['select-all', state(), false],
  ['copy-selection', withSource, true],
  ['clear-markers', withSource, true],
  ['clear-markers', state(), false],
  ['cut-selection', state({ ticks: [12], selectedTicks: [12] }), true],
  ['cut-selection', state(), false],
  ['paste-selection', state(), true],
  // Playback, recording and marker placement need audio.
  ['play-pause', state(), false],
  ['play-pause', withSource, true],
  ['preview', state(), false],
  ['preview-previous', withSource, true],
  ['seek-backward', withSource, true],
  ['recording-tap', withSource, true],
  ['seek-forward', state(), false],
  ['place-marker', state(), false],
  ['place-marker-free', withSource, true],
  // Marker-wide edits need markers.
  ['shift-markers-earlier', state(), false],
  ['shift-markers-later', withSource, true],
  ['copy-bmse', state(), false],
  ['paste-bmse', state(), true],
  ['measure-paste', state(), true],
  ['open-wheel', state(), true],
  // A project keeps at least one track.
  ['add-track', state(), true],
  ['input-settings', state(), true],
  ['export-all-tracks', state(), false],
  ['remove-track', state(), false],
  ['remove-track', state({ document: tracks(2) }), true],
];

describe('command availability rules', () => {
  it('covers every command that has a rule', () => {
    const ids = new Set(table.map(([id]) => id));
    for (const id of APP_COMMANDS)
      if ('enabled' in COMMANDS[id]) expect(ids.has(id), id).toBe(true);
    for (const group of APPLICATION_MENU)
      for (const item of group.commands) expect(ids.has(item.id), item.id).toBe(true);
  });
  it.each(table)('enables %s per the shared rule', (id, editorState, expected) => {
    expect(commandEnabled(id, editorState)).toBe(expected);
  });
});
