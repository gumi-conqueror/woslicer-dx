import type { EditorStore } from '../slicing/editor-store';

export type MenuEditorState = Pick<
  EditorStore,
  'document' | 'source' | 'ticks' | 'selectedTicks' | 'canUndo' | 'canRedo' | 'limited'
>;

// The visible menu is also the source of its command type and input validation.
export const APPLICATION_MENU = [
  {
    label: 'menu.project',
    mnemonic: 'p',
    commands: [
      { id: 'open-project', key: 'menu.openProject', mnemonic: 'o' },
      // Limited projects still save: the opened file's bytes are written unchanged.
      { id: 'save-project', key: 'menu.saveProject', mnemonic: 's' },
      { id: 'relink-audio', key: 'menu.relinkAudio', mnemonic: 'r' },
      { id: 'open-audio', key: 'menu.openAudio', mnemonic: 'a' },
      { id: 'new-project-wos', key: 'menu.newProjectWos', mnemonic: 'n' },
      { id: 'import-wos', key: 'menu.importWos', mnemonic: 'i' },
      { id: 'import-legacy', key: 'menu.importLegacy', mnemonic: 'l' },
      { id: 'export-wos', key: 'menu.exportWos', mnemonic: 'w' },
      { id: 'close-project', key: 'chrome.close', mnemonic: 'c' },
      { id: 'export-slice', key: 'menu.exportSlice', mnemonic: 'e' },
      { id: 'export-all', key: 'menu.exportAll', mnemonic: 'x' },
    ],
  },
  {
    label: 'menu.edit',
    mnemonic: 'e',
    commands: [
      { id: 'undo', key: 'menu.undo', mnemonic: 'u' },
      { id: 'redo', key: 'menu.redo', mnemonic: 'r' },
      { id: 'select-all', key: 'menu.selectAll', mnemonic: 'a' },
      { id: 'clear-markers', key: 'menu.clearMarkers', mnemonic: 'd' },
      { id: 'select-copy', key: 'menu.copySelection', mnemonic: 'c' },
      { id: 'select-cut', key: 'menu.cutSelection', mnemonic: 't' },
      { id: 'select-paste', key: 'menu.pasteSelection', mnemonic: 'p' },
    ],
  },
  {
    label: 'menu.view',
    mnemonic: 'v',
    commands: [
      { id: 'zoom-in', key: 'menu.zoomIn', mnemonic: 'i' },
      { id: 'zoom-out', key: 'menu.zoomOut', mnemonic: 'o' },
    ],
  },
  {
    label: 'menu.tools',
    mnemonic: 't',
    commands: [
      { id: 'toggle-recording', key: 'recording.mode', mnemonic: 'r' },
      { id: 'connect-yuancon', key: 'recording.controller', mnemonic: 'y' },
      { id: 'calibrate', key: 'chrome.calibrate', mnemonic: 'c' },
    ],
  },
  {
    label: 'menu.help',
    mnemonic: 'h',
    commands: [
      { id: 'help', key: 'menu.guide', mnemonic: 'g' },
      { id: 'troubleshoot', key: 'menu.troubleshoot', mnemonic: 't' },
      { id: 'open-data-folder', key: 'menu.openDataFolder', mnemonic: 'd' },
      { id: 'about', key: 'menu.about', mnemonic: 'a' },
    ],
  },
] as const;

export type MenuCommand = (typeof APPLICATION_MENU)[number]['commands'][number]['id'];
export const MENU_COMMANDS = APPLICATION_MENU.flatMap((group) =>
  group.commands.map((item) => item.id),
);

export function isMenuCommand(value: unknown): value is MenuCommand {
  return typeof value === 'string' && MENU_COMMANDS.some((command) => command === value);
}

/**
 * Menu availability reflects the workspace guards; commands also validate at
 * their mutation boundary because shortcuts and toolbars bypass this menu.
 */
export function menuCommandEnabled(id: MenuCommand, editor: MenuEditorState): boolean {
  switch (id) {
    case 'open-project':
    case 'new-project-wos':
    case 'save-project':
    case 'close-project':
    case 'zoom-in':
    case 'zoom-out':
    case 'about':
    case 'help':
    case 'troubleshoot':
    case 'open-data-folder':
    case 'connect-yuancon':
      return true;
    case 'toggle-recording':
      return editor.source !== null && !editor.limited;
    case 'calibrate':
      return editor.source !== null;
    case 'open-audio':
    case 'import-wos':
    case 'import-legacy':
    case 'export-wos':
      return !editor.limited;
    case 'relink-audio':
      return editor.document.media.length > 0 && !editor.limited;
    case 'export-slice':
    case 'export-all':
      return editor.source !== null && editor.ticks.length > 0;
    case 'undo':
      return editor.canUndo;
    case 'redo':
      return editor.canRedo;
    case 'select-all':
    case 'select-copy':
      return editor.ticks.length > 0;
    case 'clear-markers':
      return editor.ticks.length > 0 && !editor.limited;
    case 'select-cut':
      return editor.selectedTicks.length > 0 && !editor.limited;
    case 'select-paste':
      return !editor.limited;
    default: {
      const exhaustive: never = id;
      return exhaustive;
    }
  }
}
