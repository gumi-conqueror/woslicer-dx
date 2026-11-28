import { onBeforeUnmount } from 'vue';

/** A wheel gesture ends this long after its last notch. */
const WHEEL_REST_MS = 400;

/**
 * Makes one wheel gesture one edit. Call `notch` for each wheel notch: `commit`
 * runs once after the wheel rests, or when the component unmounts first.
 * `cancel` ends the gesture without a commit.
 */
export function useWheelGesture(commit: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  function cancel(): void {
    clearTimeout(timer);
    timer = undefined;
  }
  function notch(): void {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      commit();
    }, WHEEL_REST_MS);
  }
  onBeforeUnmount(() => {
    if (timer === undefined) return;
    cancel();
    commit();
  });
  return { notch, cancel };
}
