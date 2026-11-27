import type { AppCommand } from './commands';

interface MenuGroup {
  label: string;
  mnemonic: string;
  commands: readonly { id: AppCommand; mnemonic: string }[];
}

/** Menu structure: groups, order and mnemonics. Labels and availability come from the commands. */
export const APPLICATION_MENU = [
  {
    label: 'menu.project',
    mnemonic: 'p',
    commands: [
      { id: 'open-project', mnemonic: 'o' },
      { id: 'save-project', mnemonic: 's' },
      { id: 'open-audio', mnemonic: 'a' },
      { id: 'new-project-wos', mnemonic: 'n' },
      { id: 'import-wos', mnemonic: 'i' },
      { id: 'export-wos', mnemonic: 'w' },
      { id: 'close-project', mnemonic: 'c' },
      { id: 'export-slice', mnemonic: 'e' },
      { id: 'export-all', mnemonic: 'x' },
    ],
  },
  {
    label: 'menu.edit',
    mnemonic: 'e',
    commands: [
      { id: 'undo', mnemonic: 'u' },
      { id: 'redo', mnemonic: 'r' },
      { id: 'select-all', mnemonic: 'a' },
      { id: 'clear-markers', mnemonic: 'd' },
      { id: 'copy-selection', mnemonic: 'c' },
      { id: 'cut-selection', mnemonic: 't' },
      { id: 'paste-selection', mnemonic: 'p' },
    ],
  },
  {
    label: 'menu.track',
    mnemonic: 'k',
    commands: [
      { id: 'add-track', mnemonic: 'a' },
      { id: 'rename-track', mnemonic: 'r' },
      { id: 'remove-track', mnemonic: 'd' },
      { id: 'move-track-up', mnemonic: 'u' },
      { id: 'move-track-down', mnemonic: 'w' },
      { id: 'previous-track', mnemonic: 'p' },
      { id: 'next-track', mnemonic: 'n' },
      { id: 'toggle-track-mute', mnemonic: 'm' },
      { id: 'toggle-track-solo', mnemonic: 's' },
      { id: 'relink-audio', mnemonic: 'l' },
      { id: 'export-all-tracks', mnemonic: 'x' },
    ],
  },
  {
    label: 'menu.view',
    mnemonic: 'v',
    commands: [
      { id: 'zoom-in', mnemonic: 'i' },
      { id: 'zoom-out', mnemonic: 'o' },
    ],
  },
  {
    label: 'menu.tools',
    mnemonic: 't',
    commands: [
      { id: 'toggle-recording', mnemonic: 'r' },
      { id: 'connect-yuancon', mnemonic: 'y' },
      { id: 'calibrate', mnemonic: 'c' },
      { id: 'input-settings', mnemonic: 'i' },
    ],
  },
  {
    label: 'menu.help',
    mnemonic: 'h',
    commands: [
      { id: 'help', mnemonic: 'g' },
      { id: 'troubleshoot', mnemonic: 't' },
      { id: 'open-data-folder', mnemonic: 'd' },
      { id: 'about', mnemonic: 'a' },
    ],
  },
] as const satisfies readonly MenuGroup[];

/** The context menu of a track row; `null` separates groups. */
export const TRACK_MENU = [
  'add-track',
  'rename-track',
  'remove-track',
  null,
  'move-track-up',
  'move-track-down',
  null,
  'toggle-track-mute',
  'toggle-track-solo',
  null,
  'open-audio',
  'relink-audio',
  null,
  'export-all',
  'export-all-tracks',
] as const satisfies readonly (AppCommand | null)[];
