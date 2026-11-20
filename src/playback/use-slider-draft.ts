import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from 'vue';

export interface SliderDraft {
  draft: Ref<number | null>;
  displayValue: ComputedRef<number>;
  onUpdate: (value: number | number[]) => void;
  commit: () => void;
  reset: () => void;
}

// Drag updates preview monitoring; release commits one document edit.
// The helper manages slider positions only; unit conversion stays with the
// caller. Each call creates an independent draft.
export function useSliderDraft(
  readValue: () => number,
  commitValue: (value: number) => void,
  previewValue?: (value: number | null) => void,
): SliderDraft {
  const draft = ref<number | null>(null);
  const displayValue = computed(() => draft.value ?? readValue());
  function onUpdate(value: number | number[]): void {
    if (typeof value === 'number' && Number.isFinite(value)) {
      draft.value = value;
      previewValue?.(value);
    }
  }
  function commit(): void {
    const target = draft.value ?? readValue();
    draft.value = null;
    commitValue(target);
    previewValue?.(null);
  }
  function reset(): void {
    draft.value = null;
    previewValue?.(null);
  }
  watch(readValue, reset);
  onScopeDispose(reset, true);
  return { draft, displayValue, onUpdate, commit, reset };
}
