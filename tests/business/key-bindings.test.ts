import { describe, expect, it } from 'vitest';
import { commandForKey, shortcutLabel, SHORTCUTS } from '../../src/input/bindings';
import en from '../../src/i18n/en.json';
import zh from '../../src/i18n/zh.json';
import ja from '../../src/i18n/ja.json';
import ko from '../../src/i18n/ko.json';
import { createI18n } from 'vue-i18n';

describe('shared keyboard bindings', () => {
  it('distinguishes project, clipboard, navigation and snap-bypass modifiers', () => {
    const match = (key: string, modifiers: KeyboardEventInit = {}) =>
      commandForKey(new KeyboardEvent('keydown', { key, ...modifiers }));
    expect(match('s', { ctrlKey: true })).toBe('save-project');
    expect(match('S', { metaKey: true, shiftKey: true })).toBe('export-wos');
    expect(match('s')).toBe('clip-number-up');
    expect(match('s', { altKey: true })).toBeUndefined();
    expect(match('ArrowLeft', { shiftKey: true })).toBe('cursor-left-tick');
    expect(match('Enter', { altKey: true })).toBe('place-breakpoint-free');
    expect(match('Enter')).toBe('place-breakpoint');
    expect(match('+', { shiftKey: true })).toBe('zoom-in');
    expect(match('z', { isComposing: true })).toBeUndefined();
    expect(shortcutLabel('save-project')).toBe('Ctrl/Cmd+S');
  });
  it('has no conflicting bindings and provides translated help for every action', () => {
    const seen = new Set<string>();
    for (const item of SHORTCUTS)
      for (const binding of item.bindings)
        for (const key of binding.keys) {
          const id = JSON.stringify([
            key,
            binding.primary ?? false,
            binding.shift ?? false,
            binding.alt ?? false,
          ]);
          expect(seen.has(id)).toBe(false);
          seen.add(id);
        }
    for (const locale of ['en', 'zh', 'ja', 'ko']) {
      const { global } = createI18n({ legacy: false, locale, messages: { en, zh, ja, ko } });
      for (const item of SHORTCUTS) expect(global.t(item.label)).not.toBe(item.label);
    }
  });
});
