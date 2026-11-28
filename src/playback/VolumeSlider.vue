<script setup lang="ts">
import { ElSlider } from 'element-plus';
import { useWheelGesture } from '../ui/wheel-gesture';
import { useSliderDraft } from './use-slider-draft';

/**
 * A volume slider. Dragging previews the level and commits it on release. The
 * mouse wheel moves it by `wheelStep` per notch and commits after the wheel
 * rests, so one wheel gesture is one undo step.
 */
const props = withDefaults(
  defineProps<{
    value: number;
    min?: number;
    max?: number;
    step?: number;
    wheelStep: number;
    label: string;
    formatTooltip?: (value: number) => string;
  }>(),
  { min: 0, max: 100, step: 1, formatTooltip: undefined },
);
const emit = defineEmits<{ preview: [value: number | null]; commit: [value: number] }>();
const { displayValue, onUpdate, commit, reset } = useSliderDraft(
  () => props.value,
  (value) => emit('commit', value),
  (value) => emit('preview', value),
);
const gesture = useWheelGesture(commit);
function wheel(event: WheelEvent): void {
  if (event.deltaY === 0) return;
  const next = displayValue.value + (event.deltaY < 0 ? props.wheelStep : -props.wheelStep);
  onUpdate(Math.max(props.min, Math.min(props.max, next)));
  gesture.notch();
}
defineExpose({ reset });
</script>
<template>
  <span
    class="volume-slider"
    @wheel.prevent="wheel"
  >
    <ElSlider
      :model-value="displayValue"
      :min="min"
      :max="max"
      :step="step"
      :format-tooltip="formatTooltip"
      :aria-label="label"
      :title="label"
      @update:model-value="onUpdate"
      @change="commit"
    />
  </span>
</template>
<style scoped>
.volume-slider {
  display: inline-flex;
  align-items: center;
}
.volume-slider :deep(.el-slider) {
  width: 100%;
}
</style>
