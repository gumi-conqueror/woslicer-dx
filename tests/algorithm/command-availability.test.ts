import { describe, expect, it } from 'vitest';
import {
  menuCommandEnabled,
  MENU_COMMANDS,
  type MenuCommand,
  type MenuEditorState,
} from '../../src/app/menu';
import { APP_COMMANDS } from '../../src/app/command-types';

const document = (media: unknown) =>
  ({ tracks: [{ media }] }) as unknown as MenuEditorState['document'];
const state = (overrides: Partial<MenuEditorState> = {}): MenuEditorState => ({
  document: document(null),
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
const busy = state({ ticks: [12], selectedTicks: [12], document: document({}) });

const table: ReadonlyArray<readonly [MenuCommand, MenuEditorState, boolean]> = [
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
];

describe('menu availability rules', () => {
  it('covers every menu command and nothing else in the rule table', () => {
    const ids = new Set(table.map(([id]) => id));
    for (const id of MENU_COMMANDS) expect(ids.has(id)).toBe(true);
    for (const id of table.map(([id]) => id)) expect(MENU_COMMANDS).toContain(id);
  });
  it.each(table)('enables %s per the shared rule', (id, editorState, expected) => {
    expect(menuCommandEnabled(id, editorState)).toBe(expected);
  });
  it('keeps menu commands inside the application command set', () => {
    for (const id of MENU_COMMANDS) expect(APP_COMMANDS).toContain(id);
  });
});
