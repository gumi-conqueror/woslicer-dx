import type { AppCommand } from './commands';

interface MenuGroup {
  label: string;
  mnemonic: string;
  /** `null` draws a line between groups of commands. */
  commands: readonly ({ id: AppCommand; mnemonic: string } | null)[];
}

/** Menu structure: groups, order and mnemonics. Labels and availability come from the commands. */
export const APPLICATION_MENU = [
  {
    label: 'menu.project',
    mnemonic: 'p',
    commands: [
      { id: 'open-audio', mnemonic: 'a' },
      { id: 'open-project', mnemonic: 'o' },
      { id: 'save-project', mnemonic: 's' },
      null,
      { id: 'new-project-wos', mnemonic: 'n' },
      { id: 'import-wos', mnemonic: 'i' },
      { id: 'export-wos', mnemonic: 'w' },
      null,
      { id: 'export-slice', mnemonic: 'e' },
      { id: 'export-all', mnemonic: 'x' },
      null,
      { id: 'close-project', mnemonic: 'c' },
    ],
  },
  {
    label: 'menu.edit',
    mnemonic: 'e',
    commands: [
      { id: 'undo', mnemonic: 'u' },
      { id: 'redo', mnemonic: 'r' },
      null,
      { id: 'cut-selection', mnemonic: 't' },
      { id: 'copy-selection', mnemonic: 'c' },
      { id: 'paste-selection', mnemonic: 'p' },
      null,
      { id: 'measure-cut', mnemonic: 'x' },
      { id: 'measure-copy', mnemonic: 'm' },
      { id: 'measure-paste', mnemonic: 'v' },
      null,
      { id: 'select-all', mnemonic: 'a' },
      { id: 'clear-markers', mnemonic: 'd' },
      null,
      { id: 'link-markers-all-tracks', mnemonic: 'l' },
      { id: 'unlink-markers', mnemonic: 'k' },
      { id: 'relink-markers', mnemonic: 'i' },
      { id: 'toggle-shared-markers', mnemonic: 'h' },
    ],
  },
  {
    label: 'menu.track',
    mnemonic: 'k',
    commands: [
      { id: 'add-track', mnemonic: 'a' },
      { id: 'rename-track', mnemonic: 'r' },
      { id: 'remove-track', mnemonic: 'd' },
      null,
      { id: 'move-track-up', mnemonic: 'u' },
      { id: 'move-track-down', mnemonic: 'w' },
      null,
      { id: 'previous-track', mnemonic: 'p' },
      { id: 'next-track', mnemonic: 'n' },
      null,
      { id: 'toggle-track-mute', mnemonic: 'm' },
      { id: 'toggle-track-solo', mnemonic: 's' },
      null,
      { id: 'relink-audio', mnemonic: 'l' },
    ],
  },
  {
    label: 'menu.view',
    mnemonic: 'v',
    commands: [
      { id: 'zoom-in', mnemonic: 'i' },
      { id: 'zoom-out', mnemonic: 'o' },
      { id: 'zoom-fit', mnemonic: 'f' },
    ],
  },
  {
    label: 'menu.tools',
    mnemonic: 't',
    commands: [
      { id: 'toggle-recording', mnemonic: 'r' },
      null,
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
      null,
      // The web version hides the data folder; troubleshooting keeps the group.
      { id: 'troubleshoot', mnemonic: 't' },
      { id: 'open-data-folder', mnemonic: 'd' },
      null,
      { id: 'about', mnemonic: 'a' },
    ],
  },
] as const satisfies readonly MenuGroup[];

/** The context menu of a track row; `null` draws a line between groups. */
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
  null,
  'link-markers-all-tracks',
  'unlink-markers',
  'relink-markers',
] as const satisfies readonly (AppCommand | null)[];
