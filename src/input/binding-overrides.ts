import { shallowRef, watch } from 'vue';
import { defineStore } from 'pinia';
import {
  applyBindingOverrides,
  BINDINGS,
  bindingId,
  type Binding,
  type BindingOverride,
  type KeyChord,
} from './bindings';
import { GAMEPAD_CONTROLS, type GamepadControl } from './gamepad';

/** Local preference key; the value is `{ version: 1, overrides }`. Only changed rows are stored. */
const STORAGE_KEY = 'woslicer.bindings';
const STORAGE_VERSION = 1;
export type RebindableDevice = 'keyboard' | 'gamepad';
type Overrides = Readonly<Record<string, BindingOverride>>;

/** Keys that open menus, move focus or cancel; users cannot bind them. */
export function reservedKey(chord: KeyChord, mnemonics: readonly string[]): boolean {
  const key = chord.key ?? chord.code ?? '';
  if (['Tab', 'Escape', 'Alt', 'Control', 'Shift', 'Meta', 'Process'].includes(key)) return true;
  return !!chord.alt && !chord.primary && mnemonics.includes(key.toLowerCase());
}
/** The Menu button opens the menu and cancels recording; users cannot bind it. */
export function reservedControl(control: GamepadControl): boolean {
  return control === 'menu';
}

function sameChord(a: KeyChord, b: KeyChord): boolean {
  return (
    (a.code ?? a.key?.toLowerCase()) === (b.code ?? b.key?.toLowerCase()) &&
    !!a.primary === !!b.primary &&
    !!a.alt === !!b.alt &&
    (a.shift === 'either' || b.shift === 'either' || !!a.shift === !!b.shift)
  );
}
function chordValue(value: unknown): KeyChord | null {
  if (typeof value !== 'object' || value === null) return null;
  const chord: Record<string, unknown> = { ...value };
  const key = typeof chord.key === 'string' ? chord.key : undefined;
  const code = typeof chord.code === 'string' ? chord.code : undefined;
  if (!key === !code || (key ?? code ?? '').length > 32) return null;
  return {
    ...(key === undefined ? { code } : { key }),
    ...(chord.primary === true ? { primary: true } : {}),
    ...(chord.alt === true ? { alt: true } : {}),
    ...(chord.shift === true || chord.shift === 'either' ? { shift: chord.shift } : {}),
  };
}
const CONTROL_IDS = new Set<string>(GAMEPAD_CONTROLS.map((item) => item.id));
function controlValue(value: unknown): GamepadControl | null {
  return typeof value === 'string' && CONTROL_IDS.has(value)
    ? (GAMEPAD_CONTROLS.find((item) => item.id === value)?.id ?? null)
    : null;
}

/** Validates stored overrides once; rows that no longer exist are dropped. */
export function parseOverrides(value: unknown): Record<string, BindingOverride> {
  const result: Record<string, BindingOverride> = {};
  if (typeof value !== 'object' || value === null || !('version' in value)) return result;
  if (value.version !== STORAGE_VERSION || !('overrides' in value)) return result;
  const stored = value.overrides;
  if (typeof stored !== 'object' || stored === null) return result;
  const ids = new Set(BINDINGS.map(bindingId));
  const entries: [string, unknown][] = Object.entries(stored);
  for (const [id, entry] of entries) {
    if (!ids.has(id) || typeof entry !== 'object' || entry === null) continue;
    const fields: Record<string, unknown> = { ...entry };
    const override: BindingOverride = {};
    if (Array.isArray(fields.keyboard)) {
      const chords: unknown[] = fields.keyboard;
      override.keyboard = chords.flatMap((chord) => chordValue(chord) ?? []);
    }
    if (Array.isArray(fields.gamepad)) {
      const controls: unknown[] = fields.gamepad;
      override.gamepad = controls.flatMap((control) => controlValue(control) ?? []);
    }
    result[id] = override;
  }
  return result;
}

/**
 * The user's key and controller bindings. A new binding takes its control
 * away from any other row of the same layer, so one control runs one command.
 */
export const useBindingOverrides = defineStore('binding-overrides', () => {
  let storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = null;
  try {
    storage = globalThis.localStorage ?? null;
  } catch {
    storage = null;
  }
  function load(): Overrides {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      return raw ? parseOverrides(JSON.parse(raw)) : {};
    } catch {
      return {};
    }
  }
  const overrides = shallowRef<Overrides>(load());
  applyBindingOverrides(overrides.value);
  // Lookups must see a change at once: the next key press already uses it.
  watch(
    overrides,
    (value) => {
      applyBindingOverrides(value);
      try {
        if (Object.keys(value).length)
          storage?.setItem(
            STORAGE_KEY,
            JSON.stringify({ version: STORAGE_VERSION, overrides: value }),
          );
        else storage?.removeItem(STORAGE_KEY);
      } catch {
        /* Private browsing may deny persistence; bindings still apply until the page closes. */
      }
    },
    { flush: 'sync' },
  );
  function keyboard(row: Binding): readonly KeyChord[] {
    return overrides.value[bindingId(row)]?.keyboard ?? row.keyboard ?? [];
  }
  function gamepad(row: Binding): readonly GamepadControl[] {
    return overrides.value[bindingId(row)]?.gamepad ?? row.gamepad ?? [];
  }
  function current(row: Binding, device: RebindableDevice) {
    const override = overrides.value[bindingId(row)];
    return device === 'keyboard'
      ? (override?.keyboard ?? row.keyboard ?? [])
      : (override?.gamepad ?? row.gamepad ?? []);
  }
  /** Binds one control to a row, replacing its controls of that device. */
  function assign(
    row: Binding,
    device: RebindableDevice,
    control: KeyChord | GamepadControl,
  ): void {
    const next: Record<string, BindingOverride> = { ...overrides.value };
    for (const other of BINDINGS) {
      if (other.layer !== row.layer || bindingId(other) === bindingId(row)) continue;
      const controls = current(other, device);
      const kept =
        device === 'keyboard'
          ? controls.filter(
              (item) =>
                typeof item !== 'object' ||
                typeof control !== 'object' ||
                !sameChord(item, control),
            )
          : controls.filter((item) => item !== control);
      if (kept.length !== controls.length)
        next[bindingId(other)] = { ...next[bindingId(other)], [device]: kept };
    }
    next[bindingId(row)] = { ...next[bindingId(row)], [device]: [control] };
    overrides.value = next;
  }
  function clear(row: Binding, device: RebindableDevice): void {
    overrides.value = {
      ...overrides.value,
      [bindingId(row)]: { ...overrides.value[bindingId(row)], [device]: [] },
    };
  }
  /** Restores the default controls of one row and device. */
  function restore(row: Binding, device: RebindableDevice): void {
    const next: Record<string, BindingOverride> = { ...overrides.value };
    const entry = { ...next[bindingId(row)] };
    delete entry[device];
    if (entry.keyboard || entry.gamepad) next[bindingId(row)] = entry;
    else delete next[bindingId(row)];
    overrides.value = next;
  }
  function restoreAll(): void {
    overrides.value = {};
  }
  /** The row and device waiting for its next control, while the user records one. */
  const capture = shallowRef<{ row: Binding; device: RebindableDevice } | null>(null);
  return { overrides, current, keyboard, gamepad, assign, clear, restore, restoreAll, capture };
});
