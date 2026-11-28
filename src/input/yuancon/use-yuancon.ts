import { computed, onUnmounted, shallowRef, watch } from 'vue';
import { createYuanconBackend } from '../../platform/input';
import type {
  HidBackend,
  HidChoice,
  HidConnection,
  HidEvent,
} from '../../platform/input/contracts';
import { decodeYuanconReport, YUANCON_FILTER, type YuanconState } from './protocol';

export function useYuancon(
  onState: (state: YuanconState | null, time: number) => void,
  backend: HidBackend = createYuanconBackend(YUANCON_FILTER),
) {
  const available = backend.available;
  const nativePicker = !!backend.list;
  const connected = shallowRef(false);
  const connecting = shallowRef(false);
  const inverted = shallowRef(false);
  const choices = shallowRef<HidChoice[]>([]);
  const selected = shallowRef('');
  const raw = shallowRef<YuanconState | null>(null);
  const error = shallowRef('');
  const state = computed<YuanconState | null>(() => {
    const value = raw.value;
    if (!value || !inverted.value) return value;
    return {
      keys: value.keys,
      direction: value.direction === 0 ? 0 : value.direction === 1 ? -1 : 1,
    };
  });
  let connection: HidConnection | null = null;
  let controller: AbortController | null = null;
  let generation = 0;
  let disposed = false;

  function fail(cause: unknown): void {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
  async function disconnect(): Promise<void> {
    generation++;
    controller?.abort();
    controller = null;
    const previous = connection;
    connection = null;
    connected.value = false;
    connecting.value = false;
    raw.value = null;
    onState(null, performance.now());
    try {
      await previous?.close();
    } catch (cause: unknown) {
      fail(cause);
    }
  }
  function receive(event: HidEvent): void {
    if (event.kind === 'disconnected') {
      if (event.message) error.value = event.message;
      void disconnect();
      return;
    }
    const next = decodeYuanconReport(event.reportId, event.data);
    if (!next) {
      error.value = 'recording.unsupportedReport';
      raw.value = null;
      onState(null, event.time);
      return;
    }
    if (!raw.value || raw.value.keys !== next.keys || raw.value.direction !== next.direction)
      raw.value = next;
    error.value = '';
    onState(state.value, event.time);
  }
  async function refresh(): Promise<void> {
    if (!backend.list || connected.value || connecting.value) return;
    const token = generation;
    try {
      const devices = await backend.list();
      if (disposed || token !== generation) return;
      choices.value = devices;
      selected.value = devices.length === 1 ? (devices[0]?.id ?? '') : '';
      error.value = devices.length ? '' : 'recording.noDevices';
    } catch (cause: unknown) {
      if (!disposed && token === generation) fail(cause);
    }
  }
  async function connect(): Promise<void> {
    if (!available || connecting.value || connected.value) return;
    const token = ++generation;
    const abort = new AbortController();
    controller = abort;
    connecting.value = true;
    error.value = '';
    try {
      if (backend.list && !selected.value) {
        const devices = await backend.list();
        if (disposed || token !== generation) return;
        choices.value = devices;
        selected.value = devices.length === 1 ? (devices[0]?.id ?? '') : '';
        if (!selected.value) {
          error.value = devices.length ? 'recording.selectDevice' : 'recording.noDevices';
          return;
        }
      }
      const opened = await backend.open(
        selected.value || undefined,
        (event) => {
          if (!disposed && token === generation) receive(event);
        },
        abort.signal,
      );
      if (disposed || token !== generation) {
        await opened?.close();
        return;
      }
      connection = opened;
      connected.value = !!opened;
    } catch (cause: unknown) {
      if (!disposed && token === generation) fail(cause);
    } finally {
      if (token === generation) connecting.value = false;
    }
  }
  watch(inverted, () => onState(null, performance.now()), { flush: 'sync' });
  onUnmounted(() => {
    disposed = true;
    void disconnect();
  });
  return {
    available,
    nativePicker,
    connected,
    connecting,
    inverted,
    state,
    choices,
    selected,
    error,
    connect,
    disconnect,
    refresh,
  };
}
export type YuanconConnection = ReturnType<typeof useYuancon>;
