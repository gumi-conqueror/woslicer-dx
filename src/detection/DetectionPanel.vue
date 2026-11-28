<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { BAND_NAMES, type BandName } from '../core/bands';
import { useEditorStore } from '../slicing/editor-store';
import { useDetection } from './detection';
import NumberField from '../ui/NumberField.vue';

const { t } = useI18n();
const editor = useEditorStore();
const detection = useDetection();
// Rise threshold accepted only when a finite number within 0–120 dB.
const threshold = computed({
  get: () => editor.bandDetection.thresholdDb,
  set: (value: number | undefined) => {
    if (value !== undefined && Number.isFinite(value) && value >= 0 && value <= 120)
      editor.setBandDetection({ thresholdDb: value });
  },
});
// The settings are track data: each change is one undoable edit.
const selectedBands = computed({
  get: () => BAND_NAMES.filter((band) => editor.bandDetection.bands[band]),
  set: (bands: BandName[]) => {
    editor.setBandDetection({
      bands: {
        low: bands.includes('low'),
        mid: bands.includes('mid'),
        high: bands.includes('high'),
      },
    });
  },
});
const bandLabels = { low: 'chrome.bandLow', mid: 'chrome.bandMid', high: 'chrome.bandHigh' };
// Selection range text for the scope line; null means the whole track.
const range = computed(() =>
  editor.selectionStartTick === null || editor.selectionEndTick === null
    ? null
    : `${Math.min(editor.selectionStartTick, editor.selectionEndTick)}–${Math.max(editor.selectionStartTick, editor.selectionEndTick)}`,
);
// Keep decoded bands available whenever detection becomes visible with a source present.
watch(
  () => [editor.bandsVisible, editor.source],
  () => {
    if (editor.bandsVisible && editor.source) void detection.ensureBands();
  },
);
</script>

<template>
  <section
    class="detection-panel"
    :aria-label="t('chrome.bandDetect')"
    data-testid="detection-panel"
  >
    <!-- visibility toggles: overlay bands and RMS on the timeline -->
    <el-checkbox v-model="editor.bandsVisible">{{ t('chrome.bands') }}</el-checkbox>
    <el-checkbox v-model="editor.rmsVisible">{{ t('chrome.titleRms') }}</el-checkbox>
    <!-- band detection form: bands, rise threshold, minimum gap, snap, scope, actions -->
    <el-form
      label-position="top"
      size="small"
    >
      <el-form-item :label="t('chrome.bandDetect')">
        <el-checkbox-group v-model="selectedBands">
          <el-checkbox
            v-for="band in BAND_NAMES"
            :key="band"
            :value="band"
            >{{ t(bandLabels[band]) }}</el-checkbox
          >
        </el-checkbox-group>
      </el-form-item>
      <el-form-item :label="t('chrome.riseLabel')">
        <NumberField
          v-model="threshold"
          :min="0"
          :max="120"
          :step="1"
          :aria-label="t('chrome.riseLabel')"
        />
      </el-form-item>
      <el-form-item :label="t('chrome.minGapLabel')">
        <el-select
          :model-value="editor.bandDetection.minGapUnits"
          :aria-label="t('chrome.minGapLabel')"
          @update:model-value="(units: number) => editor.setBandDetection({ minGapUnits: units })"
        >
          <el-option
            v-for="n in [1, 2, 4, 8]"
            :key="n"
            :value="n"
            :label="t(`chrome.gap${n}Grid`)"
          />
        </el-select>
      </el-form-item>
      <el-checkbox
        :model-value="editor.bandDetection.snap"
        @update:model-value="(snap: unknown) => editor.setBandDetection({ snap: snap === true })"
        >{{ t('chrome.bandSnapLabel') }}</el-checkbox
      >
      <!-- scope readout and detect actions -->
      <p class="scope">
        {{ range ? `${t('status.bandDetectInSelection')}: ${range}` : t('chrome.bandScopeWhole') }}
      </p>
      <el-button
        type="primary"
        :loading="editor.bandBusy"
        :disabled="!editor.source || !selectedBands.length"
        @click="detection.detect()"
        >{{ t(editor.bandBusy ? 'chrome.detecting' : 'chrome.detect') }}</el-button
      >
      <el-button
        :disabled="!editor.source || editor.bandBusy"
        @click="detection.edgeDetect()"
        >{{ t('chrome.edgeDetect') }}</el-button
      >
    </el-form>
  </section>
</template>

<style scoped>
/* Panel layout: stacked controls with even gaps. */
.detection-panel {
  display: grid;
  gap: 8px;
  padding: 12px;
}

/* Scope hint line under the form items. */
.scope {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
