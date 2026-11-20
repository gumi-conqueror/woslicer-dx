import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { afterEach, expect, it, vi } from 'vitest';
import WindowTitlebar from '../../src/app/components/WindowTitlebar.vue';
import en from '../../src/i18n/en.json';

const native = vi.hoisted(() => ({
  minimize: vi.fn(async () => {}),
  toggleMaximize: vi.fn(async () => {}),
  isMaximized: vi.fn(() => Promise.resolve(false)),
  startDragging: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  destroy: vi.fn(async () => {}),
  onResized: vi.fn<(handler: () => void) => Promise<() => void>>(),
  onCloseRequested: vi.fn<(handler: () => void) => Promise<() => void>>(),
}));
const cleanup = vi.hoisted(() => vi.fn());
vi.mock('../../src/platform/desktop-window', () => ({ getDesktopWindow: () => native }));
afterEach(() => vi.resetAllMocks());

async function render(beforeClose = vi.fn(() => Promise.resolve(true))) {
  native.isMaximized.mockResolvedValue(false);
  native.onResized.mockResolvedValue(cleanup);
  native.onCloseRequested.mockResolvedValue(cleanup);
  const wrapper = mount(WindowTitlebar, {
    props: { beforeClose },
    global: {
      plugins: [createPinia(), createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  });
  await flushPromises();
  return wrapper;
}

it('drags only from the title region and reflects native maximize changes', async () => {
  const wrapper = await render();
  try {
    await wrapper.get('.window-drag-region').trigger('mousedown', { button: 0, detail: 1 });
    expect(native.startDragging).toHaveBeenCalledOnce();
    await wrapper.get('.window-drag-region').trigger('mousedown', { button: 2 });
    expect(native.startDragging).toHaveBeenCalledOnce();
    await wrapper.get('.window-drag-region').trigger('mousedown', { button: 0, detail: 2 });
    expect(native.toggleMaximize).toHaveBeenCalledOnce();
    native.isMaximized.mockResolvedValue(true);
    native.onResized.mock.calls[0]?.[0]();
    await flushPromises();
    expect(wrapper.find('[aria-label="Restore window"]').exists()).toBe(true);
    await wrapper.get('[aria-label="Minimize window"]').trigger('click');
    expect(native.minimize).toHaveBeenCalledOnce();
    expect(native.startDragging).toHaveBeenCalledOnce();
  } finally {
    wrapper.unmount();
  }
  expect(cleanup).toHaveBeenCalledTimes(2);
});

it('keeps the window open on cancellation and waits for approval before destroying it', async () => {
  let approve: (value: boolean) => void = () => {};
  const beforeClose = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        approve = resolve;
      }),
  );
  const wrapper = await render(beforeClose);
  try {
    await wrapper.get('[aria-label="Exit application"]').trigger('click');
    expect(native.close).toHaveBeenCalledOnce();
    const closeRequested = native.onCloseRequested.mock.calls[0]?.[0];
    if (!closeRequested) throw new Error('Missing native close listener');
    closeRequested();
    closeRequested();
    expect(beforeClose).toHaveBeenCalledOnce();
    expect(native.destroy).not.toHaveBeenCalled();
    approve(false);
    await flushPromises();
    expect(native.destroy).not.toHaveBeenCalled();
    closeRequested();
    approve(true);
    await flushPromises();
    expect(native.destroy).toHaveBeenCalledOnce();
  } finally {
    wrapper.unmount();
  }
});

it('reports a failed recovery write and leaves the window available for another close request', async () => {
  const failure = new Error('Recovery write failed');
  const beforeClose = vi.fn(() => Promise.resolve(true)).mockRejectedValueOnce(failure);
  const wrapper = await render(beforeClose);
  try {
    const closeRequested = native.onCloseRequested.mock.calls[0]?.[0];
    if (!closeRequested) throw new Error('Missing native close listener');
    closeRequested();
    await flushPromises();
    expect(native.destroy).not.toHaveBeenCalled();
    expect(wrapper.emitted('error')).toEqual([[failure]]);
    closeRequested();
    await flushPromises();
    expect(native.destroy).toHaveBeenCalledOnce();
  } finally {
    wrapper.unmount();
  }
});
