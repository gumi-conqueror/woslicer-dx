import { Channel, invoke } from '@tauri-apps/api/core';
import { z } from 'zod';
import type { HidBackend } from './contracts';

const choiceSchema = z.array(z.object({ id: z.string(), name: z.string() }));
const eventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('report'),
    sequence: z.number().int().positive(),
    timeMs: z.number().finite().nonnegative(),
    reportId: z.number().int().min(0).max(255),
    data: z.array(z.number().int().min(0).max(255)).max(4095),
  }),
  z.object({ kind: z.literal('disconnected'), message: z.string().nullable() }),
]);

/** The shortest round trip gives the least queue-contaminated clock estimate. */
export async function nativeClockOffset(
  clock: () => Promise<number>,
  now = () => performance.now(),
): Promise<number> {
  let shortest = Infinity;
  let offset = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    const start = now();
    const native = await clock();
    const end = now();
    if (end - start < shortest) {
      shortest = end - start;
      offset = (start + end) / 2 - native;
    }
  }
  return offset;
}

export function createNativeHid(): HidBackend {
  return {
    available: true,
    async list() {
      return choiceSchema.parse(await invoke<unknown>('yuancon_devices'));
    },
    async open(id, receive, signal) {
      if (!id) throw new Error('Select a YuanCon controller');
      const offset = await nativeClockOffset(async () =>
        z
          .number()
          .finite()
          .nonnegative()
          .parse(await invoke<unknown>('input_clock')),
      );
      signal.throwIfAborted();
      const channel = new Channel<unknown>();
      let lastSequence = 0;
      channel.onmessage = (value) => {
        if (signal.aborted) return;
        const parsed = eventSchema.safeParse(value);
        if (!parsed.success) {
          receive({ kind: 'disconnected', message: 'Invalid native HID event' });
          return;
        }
        const event = parsed.data;
        if (event.kind === 'disconnected')
          receive({ kind: 'disconnected', message: event.message ?? undefined });
        else {
          if (event.sequence !== lastSequence + 1) {
            receive({ kind: 'disconnected', message: 'Native HID event sequence interrupted' });
            return;
          }
          lastSequence = event.sequence;
          const bytes = Uint8Array.from(event.data);
          receive({
            kind: 'report',
            reportId: event.reportId,
            data: new DataView(bytes.buffer),
            time: event.timeMs + offset,
          });
        }
      };
      const session = z
        .string()
        .parse(await invoke<unknown>('yuancon_connect', { id, events: channel }));
      const connection = {
        async close() {
          await invoke('yuancon_disconnect', { id: session });
        },
      };
      if (signal.aborted) {
        await connection.close();
        signal.throwIfAborted();
      }
      return connection;
    },
  };
}
