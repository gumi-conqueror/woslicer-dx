import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { defineComponent, h, nextTick } from 'vue';
import { providePlayback } from '../../src/playback';
import { silentPlayback } from '../support/app';
import TimelineEditor from '../../src/timeline/TimelineEditor.vue';
import { setupI18n } from '../../src/i18n/setup';
import { useEditorStore } from '../../src/slicing/editor-store';
import { provideCommandRunner } from '../../src/app/commands';
import { createEmptyTrack } from '../../src/project/codec';

afterEach(() => {
  document.body.innerHTML = '';
});

function mountTimeline() {
  const pinia = createPinia();
  const localization = setupI18n(pinia, { storage: null, locales: ['en'] });
  const editor = useEditorStore(pinia);
  editor.transact((draft) => {
    draft.tracks.push(createEmptyTrack('second', 'Second'));
  });
  const run = vi.fn(() => Promise.resolve('done' as const));
  const Host = defineComponent({
    setup() {
      providePlayback(silentPlayback());
      provideCommandRunner(run);
      return () => h(TimelineEditor, { loading: null });
    },
  });
  const wrapper = mount(Host, {
    attachTo: document.body,
    global: { plugins: [pinia, localization.i18n] },
  });
  return { wrapper, editor, run, dispose: () => localization.stop() };
}

it('opens the track menu on the right-clicked track and runs the chosen command', async () => {
  const { wrapper, editor, run, dispose } = mountTimeline();
  try {
    const headers = wrapper.findAll('.track-header');
    expect(headers).toHaveLength(2);
    await headers[1]?.trigger('contextmenu', { clientX: 40, clientY: 30 });
    await flushPromises();
    expect(editor.track.trackId).toBe('second');
    const menu = document.querySelector('[role="menu"][aria-label="Track menu"]');
    expect(menu).not.toBeNull();
    const remove = menu?.querySelector<HTMLButtonElement>('[data-command="remove-track"]');
    expect(remove?.disabled).toBe(false);
    remove?.click();
    await nextTick();
    expect(run).toHaveBeenCalledWith('remove-track');
    expect(document.querySelector('[aria-label="Track menu"]')).toBeNull();
  } finally {
    wrapper.unmount();
    dispose();
  }
});

it('closes the track menu with Escape without running a command', async () => {
  const { wrapper, run, dispose } = mountTimeline();
  try {
    await wrapper.findAll('.track-header')[0]?.trigger('contextmenu', { clientX: 10, clientY: 10 });
    await flushPromises();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(document.querySelector('[aria-label="Track menu"]')).toBeNull();
    expect(run).not.toHaveBeenCalled();
  } finally {
    wrapper.unmount();
    dispose();
  }
});
