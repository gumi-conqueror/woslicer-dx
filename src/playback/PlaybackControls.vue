<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue';
import { ElButton, ElCheckbox, ElOption, ElSelect } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { useEditorStore } from '../slicing/editor-store';
import { CUE_MODES, type CueMode } from '../project/schema';
import { PLAYBACK_RATES, formatRate } from '../core/rate';
import { ampToDb, dbToAmp, dbToSlider, sliderToDb, VOLUME_SLIDER_RANGE_DB } from '../core/volume';
import { usePlayback } from './index';
import VolumeSlider from './VolumeSlider.vue';
import { shortcutLabel } from '../input/bindings';
import AppIcon from '../ui/AppIcon.vue';
import { useInputState } from '../input/state';
const input = useInputState();
const emit = defineEmits<{ command: [command: 'toggle-recording'] }>();
function toggleRecording(event: MouseEvent): void {
  emit('command', 'toggle-recording');
  if (event.detail > 0 && event.currentTarget instanceof HTMLElement) event.currentTarget.blur();
}

const editor = useEditorStore();
const playback = usePlayback();
const { t } = useI18n();
// The current source remains playable while its replacement loads.
const disabled = computed(() => !editor.source);
// The store keeps linear amplitudes; sliders show a 0..100 position over a -60..0 dB fader.
const volume = computed(() => dbToSlider(ampToDb(editor.volume)));
const cueVolume = computed(() => dbToSlider(ampToDb(editor.cueVolume)));
// Drags preview the live audio route; release or a resting wheel commits one document edit.
const masterSlider = useTemplateRef<InstanceType<typeof VolumeSlider>>('masterSlider');
const cueSlider = useTemplateRef<InstanceType<typeof VolumeSlider>>('cueSlider');
/** One wheel notch moves a volume slider by 1 dB. */
const WHEEL_STEP = dbToSlider(-VOLUME_SLIDER_RANGE_DB + 1);
watch(
  () => [editor.docRevision, editor.documentGeneration, editor.source],
  () => {
    masterSlider.value?.reset();
    cueSlider.value?.reset();
  },
  { flush: 'sync' },
);
// Cue monitor modes offered by the select.
const cueLabels: Record<CueMode, string> = {
  off: 'chrome.cueOff',
  cowbell: 'chrome.cueCowbell',
  triangle: 'chrome.cueTriangle',
  metronome: 'chrome.cueMetronome',
};
const cues = CUE_MODES.map((value) => ({ value, label: cueLabels[value] }));
// Select payloads are narrowed before they reach playback or the store.
function setRate(value: unknown): void {
  if (typeof value === 'number') playback.setRate(value);
}
function setCue(value: unknown): void {
  const mode = CUE_MODES.find((item) => item === value);
  if (mode) editor.cueMode = mode;
}
// Slider tooltip: the dB fader value for the hovered position.
const formatVolume = (position: number) => `${sliderToDb(position).toFixed(1)} dB`;
</script>

<template>
  <div
    class="playback-controls"
    role="group"
    :aria-label="t('chrome.titlePlay')"
  >
    <ElButton
      class="recording-toggle"
      :disabled="disabled"
      :type="input.recording ? 'danger' : 'default'"
      :aria-pressed="input.recording"
      :title="t('recording.modeHint')"
      @click="toggleRecording"
    >
      <AppIcon name="record" />{{ t('recording.mode') }}
    </ElButton>
    <!-- transport: play/pause and stop -->
    <ElButton
      :disabled="disabled"
      :type="editor.playing ? 'primary' : 'default'"
      :aria-pressed="editor.playing"
      :title="`${t('chrome.titlePlay')} (${shortcutLabel('play-pause')})`"
      @click="playback.togglePlayPause()"
      ><AppIcon :name="editor.playing ? 'pause' : 'play'" />{{ t('chrome.play') }}</ElButton
    >
    <ElButton
      :disabled="disabled"
      @click="playback.stop()"
      ><AppIcon name="stop" />{{ t('chrome.stop') }}</ElButton
    >
    <!-- Drag previews the live audio route; release creates one document edit. -->
    <VolumeSlider
      ref="masterSlider"
      :value="volume"
      :wheel-step="WHEEL_STEP"
      :format-tooltip="formatVolume"
      :label="t('chrome.titleVolume')"
      @preview="
        (position) =>
          editor.setVolumePreview(position === null ? null : dbToAmp(sliderToDb(position)))
      "
      @commit="(position) => editor.setVolume(dbToAmp(sliderToDb(position)))"
    />
    <!-- playback rate select (monitoring only) -->
    <label class="control-label"
      >{{ t('chrome.rateLabel') }}
      <ElSelect
        class="rate-select"
        :model-value="editor.playbackRate"
        :aria-label="t('chrome.titleRate')"
        @update:model-value="setRate"
      >
        <ElOption
          v-for="rate in PLAYBACK_RATES"
          :key="rate"
          :value="rate"
          :label="formatRate(rate)"
        />
      </ElSelect>
    </label>
    <!-- cue monitor mode select -->
    <label class="control-label"
      >{{ t('chrome.cueLabel') }}
      <ElSelect
        class="cue-select"
        :model-value="editor.cueMode"
        :aria-label="t('chrome.cueLabel')"
        @update:model-value="setCue"
      >
        <ElOption
          v-for="cue in cues"
          :key="cue.value"
          :value="cue.value"
          :label="t(cue.label)"
        />
      </ElSelect>
    </label>
    <!-- cue volume: same protocol as the master slider, independent draft -->
    <VolumeSlider
      ref="cueSlider"
      :value="cueVolume"
      :wheel-step="WHEEL_STEP"
      :format-tooltip="formatVolume"
      :label="t('chrome.titleCueVolume')"
      @preview="
        (position) =>
          editor.setCueVolumePreview(position === null ? null : dbToAmp(sliderToDb(position)))
      "
      @commit="(position) => editor.setCueVolume(dbToAmp(sliderToDb(position)))"
    />
    <!-- follow playhead toggle (session preference on the editor store) -->
    <ElCheckbox
      v-model="editor.followPlayhead"
      :title="t('chrome.titleFollow')"
      >{{ t('chrome.follow') }}</ElCheckbox
    >
  </div>
</template>

<style scoped>
/* Playback strip: one wrapping row of transport, sliders and selects. */
.playback-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  min-width: 0;
}
.playback-controls :deep(.app-icon) {
  width: 13px;
  height: 13px;
  margin-right: 6px;
}

/* Override Element Plus adjacent-button margin inside the strip. */
.playback-controls :deep(.el-button + .el-button) {
  margin-left: 0;
}

/* Volume sliders share one fixed width between transport and selects. */
.volume-slider {
  width: 90px;
  flex: 0 0 90px;
  margin: 0 6px;
}

/* Inline label wrapping each select. */
.control-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

/* Fixed widths keep the strip layout stable while wrapping. */
.rate-select {
  width: 90px;
}
.cue-select {
  width: 120px;
}
</style>
