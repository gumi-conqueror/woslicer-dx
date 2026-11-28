import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNativeHid, nativeClockOffset } from '../../src/platform/input/native-hid';
import { createWebHid } from '../../src/platform/input/web-hid';
import { decodeYuanconReport, YUANCON_FILTER } from '../../src/input/yuancon/protocol';
import type { HidEvent } from '../../src/platform/input/contracts';

const ipc = vi.hoisted(() => {
  class Channel {
    onmessage: (value: unknown) => void = () => {};
  }
  return { Channel, invoke: vi.fn() };
});
vi.mock('@tauri-apps/api/core', () => ipc);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  ipc.invoke.mockReset();
});

describe('native HID transport', () => {
  it('uses the shortest clock round trip instead of IPC delivery time', async () => {
    const times = [100, 120, 130, 132, 140, 148, 150, 170, 180, 184];
    const native = [1010, 1031, 1044, 1060, 1082];
    const offset = await nativeClockOffset(
      () => Promise.resolve(native.shift() ?? 0),
      () => times.shift() ?? 0,
    );
    expect(offset).toBe(-900);
  });
  it('normalizes native and WebHID reports to the same decoder without losing a complete short press', async () => {
    const nativeEvents: HidEvent[] = [];
    const webEvents: HidEvent[] = [];
    let channel: InstanceType<typeof ipc.Channel> | undefined;
    ipc.invoke.mockImplementation(
      (command: string, args?: { events?: InstanceType<typeof ipc.Channel> }) => {
        if (command === 'input_clock') return Promise.resolve(performance.now() + 1000);
        if (command === 'yuancon_devices')
          return Promise.resolve([{ id: 'listed', name: 'YuanCon' }]);
        if (command === 'yuancon_connect') {
          channel = args?.events;
          return Promise.resolve('session');
        }
        return Promise.resolve(undefined);
      },
    );
    class Device extends EventTarget {
      vendorId = 0x1ccf;
      productId = 0x8048;
      collections = [{ usagePage: 1, usage: 4 }];
      opened = false;
      open() {
        this.opened = true;
        return Promise.resolve();
      }
      close() {
        this.opened = false;
        return Promise.resolve();
      }
    }
    const device = new Device();
    const hid = Object.assign(new EventTarget(), {
      requestDevice: () => Promise.resolve([device]),
    });
    vi.stubGlobal('navigator', { hid });
    const signal = new AbortController().signal;
    const backend = createNativeHid();
    expect(await backend.list?.()).toEqual([{ id: 'listed', name: 'YuanCon' }]);
    const nativeConnection = await backend.open(
      'listed',
      (event) => nativeEvents.push(event),
      signal,
    );
    const webConnection = await createWebHid(YUANCON_FILTER).open(
      undefined,
      (event) => webEvents.push(event),
      signal,
    );
    if (!channel) throw new Error('Missing native channel');
    let sequence = 0;
    for (const [keys, direction] of [
      [0, 0],
      [1, 32767],
      [0, 32767],
      [64, -32767],
      [0, 0],
    ]) {
      const bytes = new Uint8Array(15);
      const data = new DataView(bytes.buffer);
      data.setUint8(0, keys ?? 0);
      data.setInt16(4, direction ?? 0, true);
      channel.onmessage({
        kind: 'report',
        sequence: ++sequence,
        timeMs: performance.now() + 1000,
        reportId: 6,
        data: [...bytes],
      });
      device.dispatchEvent(
        Object.defineProperties(new Event('inputreport'), {
          device: { value: device },
          reportId: { value: 6 },
          data: { value: data },
        }),
      );
    }
    const decode = (events: HidEvent[]) =>
      events.flatMap((event) =>
        event.kind === 'report' ? [decodeYuanconReport(event.reportId, event.data)] : [],
      );
    expect(decode(nativeEvents)).toEqual(decode(webEvents));
    expect(decode(nativeEvents)).toEqual([
      { keys: 0, direction: 0 },
      { keys: 1, direction: 1 },
      { keys: 0, direction: 1 },
      { keys: 64, direction: -1 },
      { keys: 0, direction: 0 },
    ]);
    channel.onmessage({ kind: 'report', sequence: 9, timeMs: 1000, reportId: 6, data: [] });
    expect(nativeEvents.at(-1)?.kind).toBe('disconnected');
    await nativeConnection?.close();
    await webConnection?.close();
    expect(ipc.invoke).toHaveBeenLastCalledWith('yuancon_disconnect', { id: 'session' });
    expect(device.opened).toBe(false);
  });
});
