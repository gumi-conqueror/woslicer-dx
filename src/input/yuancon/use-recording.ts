import { onMounted, onUnmounted, watch } from 'vue';
import { useYuancon } from './use-yuancon';
import type { YuanconState } from './protocol';
import { createYuanconReader } from './recording';
import { routeYuancon } from '../router';
import { useInputState } from '../state';
import type { AppCommand, RecordingInput } from '../../commands/commands';

export function useYuanconRecording(options: {
  active: () => boolean;
  onCommand: (command: AppCommand, input?: RecordingInput) => void;
}) {
  const input = useInputState();
  const read = createYuanconReader();
  let last: YuanconState | null = null;
  let acceptedAfter = performance.now();
  let timer: ReturnType<typeof setInterval> | undefined;
  function enabled(): boolean {
    return options.active() && !document.hidden && document.hasFocus();
  }
  function dispatch(state: YuanconState | null, time: number): void {
    const controls = read(state, time, enabled());
    if (controls.length) input.device = 'yuancon';
    for (const action of routeYuancon(controls, time))
      if (action.kind === 'command') options.onCommand(action.command, action.args);
  }
  const connection = useYuancon((state, time) => {
    if (!state) {
      last = null;
      read(null, time, false);
      return;
    }
    if (time < acceptedAfter) return;
    last = state;
    dispatch(state, time);
  });
  function suspend(): void {
    acceptedAfter = performance.now();
    last = null;
    read(null, acceptedAfter, false);
    const state = connection.state.value;
    if (enabled() && state?.keys === 0 && state.direction === 0) {
      last = state;
      read(state, acceptedAfter, true);
    }
  }
  watch([options.active, connection.inverted], suspend, { flush: 'sync' });
  watch(
    connection.connected,
    (connected) => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      suspend();
      if (connected) timer = setInterval(() => dispatch(last, performance.now()), 25);
      else if (input.device === 'yuancon') input.device = 'keyboard';
    },
    { flush: 'sync' },
  );
  onMounted(() => {
    window.addEventListener('blur', suspend);
    window.addEventListener('focus', suspend);
    document.addEventListener('visibilitychange', suspend);
    document.addEventListener('focusin', suspend);
  });
  onUnmounted(() => {
    if (timer !== undefined) clearInterval(timer);
    window.removeEventListener('blur', suspend);
    window.removeEventListener('focus', suspend);
    document.removeEventListener('visibilitychange', suspend);
    document.removeEventListener('focusin', suspend);
  });
  return connection;
}
