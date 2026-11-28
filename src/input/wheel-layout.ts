import { shallowRef, watch } from 'vue';
import { defineStore } from 'pinia';
import { isAppCommand, type AppCommand } from '../commands/commands';
import { DEFAULT_WHEELS, WHEEL_SLOTS, type WheelSlots } from './wheel';

/** Local preference key; the value is `{ version: 1, wheels }`. Absent means the defaults. */
const STORAGE_KEY = 'woslicer.wheels';
const STORAGE_VERSION = 1;
export const MAX_WHEELS = 4;

/** Commands that a wheel slot can hold: every command that runs without arguments. */
export function wheelCommand(value: unknown): value is AppCommand {
  return isAppCommand(value) && value !== 'recording-tap' && value !== 'open-wheel';
}

/** Validates stored wheels once; unknown commands become empty slots. */
export function parseWheels(value: unknown): WheelSlots[] | null {
  if (typeof value !== 'object' || value === null || !('version' in value) || !('wheels' in value))
    return null;
  if (value.version !== STORAGE_VERSION || !Array.isArray(value.wheels)) return null;
  const wheels: unknown[] = value.wheels;
  if (wheels.length < 1 || wheels.length > MAX_WHEELS) return null;
  const parsed: WheelSlots[] = [];
  for (const wheel of wheels) {
    if (!Array.isArray(wheel) || wheel.length !== WHEEL_SLOTS) return null;
    const slots: unknown[] = wheel;
    parsed.push(slots.map((slot) => (wheelCommand(slot) ? slot : null)));
  }
  return parsed;
}

function same(a: readonly WheelSlots[], b: readonly WheelSlots[]): boolean {
  return (
    a.length === b.length &&
    a.every((wheel, index) => wheel.every((slot, i) => slot === b[index]?.[i]))
  );
}

/** The user's command wheel layouts, kept in local preferences. */
export const useWheelLayout = defineStore('wheel-layout', () => {
  let storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = null;
  try {
    storage = globalThis.localStorage ?? null;
  } catch {
    storage = null;
  }
  function load(): readonly WheelSlots[] {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      return (raw && parseWheels(JSON.parse(raw))) || DEFAULT_WHEELS;
    } catch {
      return DEFAULT_WHEELS;
    }
  }
  const wheels = shallowRef<readonly WheelSlots[]>(load());
  watch(wheels, (value) => {
    try {
      if (same(value, DEFAULT_WHEELS)) storage?.removeItem(STORAGE_KEY);
      else
        storage?.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, wheels: value }));
    } catch {
      /* Private browsing may deny persistence; the layout still applies until the page closes. */
    }
  });
  function setSlot(page: number, slot: number, command: AppCommand | null): void {
    if (command !== null && !wheelCommand(command)) return;
    wheels.value = wheels.value.map((wheel, index) =>
      index === page ? wheel.map((current, i) => (i === slot ? command : current)) : wheel,
    );
  }
  function addWheel(): void {
    if (wheels.value.length < MAX_WHEELS)
      wheels.value = [...wheels.value, Array.from({ length: WHEEL_SLOTS }, () => null)];
  }
  function removeWheel(page: number): void {
    if (wheels.value.length > 1) wheels.value = wheels.value.filter((_, index) => index !== page);
  }
  function reset(): void {
    wheels.value = DEFAULT_WHEELS;
  }
  return { wheels, setSlot, addWheel, removeWheel, reset };
});
