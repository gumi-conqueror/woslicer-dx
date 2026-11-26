import { mount } from '@vue/test-utils';
import { createPinia, disposePinia } from 'pinia';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import ApplicationMenu from '../../src/app/components/ApplicationMenu.vue';
import { setupI18n } from '../../src/i18n/setup';

describe('classic menu navigation', () => {
  it('opens with Alt then letters, skips disabled items, restores focus and preserves other Alt combinations', async () => {
    const pinia = createPinia();
    const localization = setupI18n(pinia, { storage: null, locales: ['en'] });
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    const wrapper = mount(ApplicationMenu, {
      attachTo: document.body,
      global: { plugins: [pinia, localization.i18n] },
    });
    const key = async (name: string, options: KeyboardEventInit = {}, type = 'keydown') => {
      const event = new KeyboardEvent(type, {
        key: name,
        bubbles: true,
        cancelable: true,
        ...options,
      });
      (document.activeElement ?? window).dispatchEvent(event);
      await nextTick();
      return event;
    };
    try {
      await key('Alt');
      await key('Alt', {}, 'keyup');
      expect(document.activeElement?.textContent).toBe('Project');
      await key('e');
      // Empty history and selection leave only Paste enabled in Edit.
      expect(document.activeElement?.getAttribute('data-command')).toBe('paste-selection');
      await key('Escape');
      await key('Escape');
      expect(document.activeElement).toBe(field);
      await key('v', { altKey: true });
      await key('i');
      expect(wrapper.emitted('command')).toEqual([['zoom-in']]);
      await key('Alt');
      expect((await key('Enter', { altKey: true })).defaultPrevented).toBe(false);
      await key('Alt', {}, 'keyup');
      expect(document.activeElement).toBe(field);
      expect((await key('p', { altKey: true, ctrlKey: true })).defaultPrevented).toBe(false);
      await wrapper.setProps({ disabled: true });
      expect((await key('h', { altKey: true })).defaultPrevented).toBe(false);
    } finally {
      wrapper.unmount();
      field.remove();
      localization.stop();
      disposePinia(pinia);
    }
  });
});
