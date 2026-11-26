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
      { id: 'relink-audio', mnemonic: 'r' },
      { id: 'open-audio', mnemonic: 'a' },
      { id: 'add-track', mnemonic: 'k' },
      { id: 'remove-track', mnemonic: 'm' },
      { id: 'new-project-wos', mnemonic: 'n' },
      { id: 'import-wos', mnemonic: 'i' },
      { id: 'export-wos', mnemonic: 'w' },
      { id: 'close-project', mnemonic: 'c' },
      { id: 'export-slice', mnemonic: 'e' },
      { id: 'export-all', mnemonic: 'x' },
      { id: 'export-all-tracks', mnemonic: 'l' },
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
