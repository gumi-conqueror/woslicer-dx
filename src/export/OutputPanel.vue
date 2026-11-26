<script setup lang="ts">
import { shortcutLabel } from '../app/shortcuts';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorkspace } from '../workspace/workspace';
import { FIELD_RANGES, inRange } from '../project/schema';
const { t } = useI18n();
const workspace = useWorkspace();
const editor = workspace.editor;
// Output fields written through editor transactions.
const clipStart = computed({
  get: () => editor.clipStartNumber,
  set: (value: number | undefined) => {
    if (
      value !== undefined &&
      Number.isInteger(value) &&
      inRange(value, FIELD_RANGES.clipStartNumber)
    )
      editor.setOutputOptions({ clipStartNumber: value });
  },
});
const baseName = computed({
  get: () => editor.baseName,
  set: (value: string) => editor.setOutputOptions({ baseName: value }),
});
const gateEnabled = computed({
  get: () => editor.noisegateEnabled,
  set: (value: boolean) => editor.setNoisegateEnabled(value),
});
const ffNumbering = computed({
  get: () => editor.useFfNumbering,
  set: (value: boolean) => editor.setOutputOptions({ useFfNumbering: value }),
});
const fade = computed({
  get: () => editor.doc.fadeoutMs,
  set: (value: number | undefined) => {
    if (value !== undefined) editor.setDocumentOptions({ fadeoutMs: value });
  },
});
const gate = computed({
  get: () => editor.doc.noisegateDb,
  set: (value: number | undefined) => {
    if (value !== undefined) editor.setDocumentOptions({ noisegateDb: value });
  },
});
</script>

<template>
  <section
    class="output-panel"
    :aria-label="t('chrome.tabOutput')"
    data-testid="output-panel"
  >
    <!-- output fields: base name, fade, gate, clip start numbering -->
    <el-form
      label-position="top"
      size="small"
    >
      <el-form-item :label="t('chrome.baseNameLabel')"
        ><el-input
          v-model="baseName"
          :maxlength="120"
          :aria-label="t('chrome.baseNameLabel')"
      /></el-form-item>
      <el-form-item :label="t('chrome.fadeLabel')"
        ><el-input-number
          v-model="fade"
          :min="FIELD_RANGES.fadeoutMs.min"
          :max="FIELD_RANGES.fadeoutMs.max"
          :precision="0"
          :aria-label="t('chrome.fadeLabel')"
      /></el-form-item>
      <el-form-item :label="t('chrome.gateLabel')"
        ><el-input-number
          v-model="gate"
          :min="FIELD_RANGES.noisegateDb.min"
          :max="FIELD_RANGES.noisegateDb.max"
          :step="1"
          :aria-label="t('chrome.gateLabel')"
        /><el-checkbox v-model="gateEnabled">{{
          t('chrome.gateCheckbox')
        }}</el-checkbox></el-form-item
      >
      <el-form-item :label="t('chrome.clipStartNoLabel')"
        ><el-input-number
          v-model="clipStart"
          :min="FIELD_RANGES.clipStartNumber.min"
          :max="FIELD_RANGES.clipStartNumber.max"
          :precision="0"
          :aria-label="t('chrome.clipStartNoLabel')"
      /></el-form-item>
      <el-checkbox v-model="ffNumbering">{{ t('chrome.ffNumberingLabel') }}</el-checkbox>
    </el-form>
    <!-- export actions: export all, slice at cursor, save/import settings, BMSE out/in -->
    <div class="output-actions">
      <el-button
        type="primary"
        :loading="editor.exportLock"
        :disabled="!editor.source || !editor.ticks.length"
        @click="workspace.exportAll()"
        >{{ t('chrome.export') }}</el-button
      >
      <el-button
        :disabled="!editor.source || !editor.ticks.length || editor.exportLock"
        @click="workspace.exportSlice()"
        >{{ t('chrome.exportSliceAtCursor') }}</el-button
      >
      <el-button
        :title="shortcutLabel('export-wos')"
        @click="workspace.saveWos()"
        >{{ t('chrome.saveWos') }}</el-button
      >
      <el-button @click="workspace.importWosSettings()">{{ t('menu.importWos') }}</el-button>
      <el-button
        :disabled="!editor.ticks.length"
        :title="shortcutLabel('bmse-out')"
        @click="workspace.bmseOut()"
        >{{ t('chrome.bmseOut') }}</el-button
      >
      <el-button
        :title="shortcutLabel('bmse-in')"
        @click="workspace.bmseIn()"
        >{{ t('chrome.bmseIn') }}</el-button
      >
    </div>
  </section>
</template>

<style scoped>
/* Panel padding. */
.output-panel {
  padding: 12px;
}

/* Export actions stacked vertically; strip adjacent-button margin. */
.output-actions {
  display: grid;
  gap: 8px;
}
.output-actions :deep(.el-button) {
  margin-left: 0;
}
</style>
