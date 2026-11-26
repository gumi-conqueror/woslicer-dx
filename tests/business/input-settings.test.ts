import { afterEach, expect, it } from 'vitest';
import { createPinia } from 'pinia';
import { nextTick } from 'vue';
import {
  BINDINGS,
  bindingId,
  gamepadBinding,
  keyBinding,
  shortcutLabel,
  applyBindingOverrides,
} from '../../src/input/bindings';
import {
  parseOverrides,
  reservedKey,
  useBindingOverrides,
} from '../../src/input/binding-overrides';

afterEach(() => {
  localStorage.clear();
  applyBindingOverrides({});
});
const row = (id: string) => {
  const found = BINDINGS.find((binding) => bindingId(binding) === id);
  if (!found) throw new Error(id);
  return found;
};
const press = (key: string) => new KeyboardEvent('keydown', { key });

it('moves a key to its new command, keeps it on this device and restores defaults', async () => {
  const overrides = useBindingOverrides(createPinia());
  overrides.assign(row('edit/undo'), 'keyboard', { key: 'z' });
  expect(keyBinding(press('z'), 'edit')?.command).toBe('undo');
  // The key left its previous command.
  expect(shortcutLabel('toggle-marker')).toBe('');
  expect(shortcutLabel('undo')).toBe('Z');
  overrides.assign(row('edit/undo'), 'gamepad', 'x');
  expect(gamepadBinding('x', 'edit')?.command).toBe('undo');
  await nextTick();
  // A new app start reads the stored bindings.
  const reopened = useBindingOverrides(createPinia());
  expect(keyBinding(press('z'), 'edit')?.command).toBe('undo');
  reopened.restore(row('edit/undo'), 'keyboard');
  expect(shortcutLabel('undo')).toBe('Ctrl/Cmd+Z');
  // Toggle marker stays without Z until its own default is restored.
  expect(shortcutLabel('toggle-marker')).toBe('');
  reopened.restoreAll();
  await nextTick();
  expect(shortcutLabel('toggle-marker')).toBe('Z');
  expect(gamepadBinding('x', 'edit')?.command).toBe('toggle-marker');
  expect(localStorage.getItem('woslicer.bindings')).toBeNull();
});

it('binds recording keys by position and clears a binding', () => {
  const overrides = useBindingOverrides(createPinia());
  overrides.assign(row('recording/recording-tap/1'), 'keyboard', { code: 'KeyJ' });
  const tap = keyBinding(new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ' }), 'recording');
  expect(tap?.args?.keys).toEqual([1]);
  overrides.clear(row('recording/recording-tap/1'), 'keyboard');
  expect(keyBinding(new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ' }), 'recording')).toBe(
    undefined,
  );
});

it('reads only valid stored bindings and reserves menu keys', () => {
  expect(
    parseOverrides({
      version: 1,
      overrides: {
        'edit/undo': { keyboard: [{ key: 'u' }, { bad: 1 }], gamepad: ['x', 'turbo'] },
        'edit/gone': { keyboard: [{ key: 'q' }] },
      },
    }),
  ).toEqual({ 'edit/undo': { keyboard: [{ key: 'u' }], gamepad: ['x'] } });
  expect(parseOverrides({ version: 2, overrides: {} })).toEqual({});
  expect(reservedKey({ key: 'Tab' }, ['p'])).toBe(true);
  expect(reservedKey({ key: 'p', alt: true }, ['p'])).toBe(true);
  expect(reservedKey({ key: 'p', alt: true, primary: true }, ['p'])).toBe(false);
  expect(reservedKey({ key: 'j' }, ['p'])).toBe(false);
});
