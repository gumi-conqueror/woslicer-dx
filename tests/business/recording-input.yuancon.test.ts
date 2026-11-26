import { describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { useYuancon, type YuanconConnection } from '../../src/input/yuancon/use-yuancon';
import type { HidBackend, HidConnection, HidEvent } from '../../src/platform/input/contracts';

function fixture(backend: HidBackend) {
  let connection: YuanconConnection | undefined;
  const onState = vi.fn();
  const wrapper = mount(
    defineComponent({
      setup() {
        connection = useYuancon(onState, backend);
        return () => h('div');
      },
    }),
  );
  if (!connection) throw new Error('Missing connection owner');
  return { connection, wrapper, onState };
}
describe('YuanCon connection lifetime', () => {
  it('closes a pending device when its owner is unmounted and rejects late reports', async () => {
    let finish: ((connection: HidConnection) => void) | undefined;
    let receive: ((event: HidEvent) => void) | undefined;
    let openingSignal: AbortSignal | undefined;
    const close = vi.fn(() => Promise.resolve());
    const owner = fixture({
      available: true,
      open(_id, callback, signal) {
        receive = callback;
        openingSignal = signal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    });
    const opening = owner.connection.connect();
    owner.wrapper.unmount();
    expect(openingSignal?.aborted).toBe(true);
    if (!finish || !receive) throw new Error('Device did not start opening');
    finish({ close });
    await opening;
    expect(close).toHaveBeenCalledOnce();
    const calls = owner.onState.mock.calls.length;
    receive({
      kind: 'report',
      time: performance.now(),
      reportId: 6,
      data: new DataView(new ArrayBuffer(15)),
    });
    expect(owner.onState).toHaveBeenCalledTimes(calls);
    expect(owner.connection.connected.value).toBe(false);
  });
  it('requires a choice for multiple native devices and clears state on disconnect', async () => {
    let receive: ((event: HidEvent) => void) | undefined;
    const close = vi.fn(() => Promise.resolve());
    const open = vi.fn((_id: string | undefined, callback: (event: HidEvent) => void) => {
      receive = callback;
      return Promise.resolve({ close });
    });
    const owner = fixture({
      available: true,
      list: () =>
        Promise.resolve([
          { id: 'a', name: 'First' },
          { id: 'b', name: 'Second' },
        ]),
      open,
    });
    await owner.connection.connect();
    expect(open).not.toHaveBeenCalled();
    expect(owner.connection.error.value).toBe('recording.selectDevice');
    owner.connection.selected.value = 'b';
    await owner.connection.connect();
    expect(open.mock.calls[0]?.[0]).toBe('b');
    if (!receive) throw new Error('Device did not connect');
    const data = new DataView(new ArrayBuffer(15));
    data.setUint8(0, 64);
    receive({ kind: 'report', time: 10, reportId: 6, data });
    expect(owner.connection.state.value?.keys).toBe(64);
    receive({ kind: 'disconnected', message: 'Unplugged' });
    await flushPromises();
    expect(owner.connection.connected.value).toBe(false);
    expect(owner.connection.state.value).toBeNull();
    expect(owner.connection.error.value).toBe('Unplugged');
    expect(close).toHaveBeenCalledOnce();
    owner.wrapper.unmount();
  });
});
