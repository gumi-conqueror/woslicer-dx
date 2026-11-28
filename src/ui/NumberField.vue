<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElInputNumber } from 'element-plus';
import { useWheelGesture } from './wheel-gesture';

/**
 * A number box. One notch of the mouse wheel, or the up or down key, moves the
 * value to the next multiple of `step`: with a step of 0.1, 120.37 goes up to
 * 120.4 and down to 120.3. Typed values keep their digits. A wheel gesture
 * commits once after the wheel rests, so it is one undo step. Other attributes
 * go to the Element Plus number input.
 */
const model = defineModel<number | undefined>({ required: true });
const props = withDefaults(defineProps<{ step?: number; min?: number; max?: number }>(), {
  step: 1,
  min: -Infinity,
  max: Infinity,
});
/** The value of a wheel gesture that is not committed yet. */
const draft = ref<number | null>(null);
const shown = computed(() => draft.value ?? model.value);
const gesture = useWheelGesture(() => {
  if (draft.value !== null) commit(draft.value);
});
function commit(value: number | undefined): void {
  gesture.cancel();
  draft.value = null;
  model.value = value;
}
// An edit from elsewhere, such as undo, ends a wheel gesture.
watch(model, () => {
  gesture.cancel();
  draft.value = null;
});

/** The number to step from: the wheel gesture, else typed text that is not committed yet. */
function current(event: Event): number | undefined {
  // The box draws a new draft later, so its text can be one notch behind.
  if (draft.value !== null) return draft.value;
  const text =
    event.currentTarget instanceof HTMLElement
      ? event.currentTarget.querySelector('input')?.value.trim()
      : undefined;
  const typed = text ? Number(text) : Number.NaN;
  return Number.isFinite(typed) ? typed : shown.value;
}
/** The next multiple of the step in the direction, inside the limits. */
function stepped(value: number, direction: -1 | 1): number {
  const units = value / props.step;
  const nearest = Math.round(units);
  // Binary fractions put a multiple such as 120.4 slightly off its place.
  const onMultiple = Math.abs(units - nearest) < 1e-6;
  const next = onMultiple
    ? nearest + direction
    : direction > 0
      ? Math.ceil(units)
      : Math.floor(units);
  const [, fraction = ''] = String(props.step).split('.');
  const result = Number((next * props.step).toFixed(fraction.length));
  return Math.max(props.min, Math.min(props.max, result));
}
function wheel(event: WheelEvent): void {
  const value = current(event);
  if (event.deltaY === 0 || value === undefined) return;
  draft.value = stepped(value, event.deltaY < 0 ? 1 : -1);
  gesture.notch();
}
function arrow(event: KeyboardEvent, direction: -1 | 1): void {
  const value = current(event);
  if (value !== undefined) commit(stepped(value, direction));
}
</script>
<template>
  <!-- The key listeners capture, so the number input does not also step by itself. -->
  <ElInputNumber
    :model-value="shown"
    :step="step"
    :min="min"
    :max="max"
    @update:model-value="commit"
    @wheel.prevent="wheel"
    @keydown.up.capture.prevent.stop="arrow($event, 1)"
    @keydown.down.capture.prevent.stop="arrow($event, -1)"
  />
</template>
