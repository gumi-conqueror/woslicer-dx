<script setup lang="ts">
import { ElDialog } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { SHORTCUTS, CALIBRATION_TAP, CANCEL, formatBindings } from '../shortcuts';
const open = defineModel<boolean>({ required: true });
const { t } = useI18n();
const groups = ['project', 'edit', 'playback', 'navigation', 'output'] as const;
</script>
<template>
  <ElDialog
    v-model="open"
    :title="t('menu.guide')"
    width="min(840px, 95vw)"
    append-to-body
    destroy-on-close
  >
    <div class="help-content">
      <h3>{{ t('help.workflow') }}</h3>
      <p>{{ t('help.workflowBody') }}</p>
      <h3>{{ t('help.workspace') }}</h3>
      <p>{{ t('help.workspaceBody') }}</p>
      <h3>{{ t('help.mouse') }}</h3>
      <p>{{ t('help.mouseBody', { cancel: formatBindings(CANCEL) }) }}</p>
      <h3>{{ t('help.keyboard') }}</h3>
      <p>{{ t('help.keyboardScope') }}</p>
      <section
        v-for="group in groups"
        :key="group"
      >
        <h4>{{ t(`help.groups.${group}`) }}</h4>
        <dl>
          <template
            v-for="shortcut in SHORTCUTS.filter((item) => item.group === group)"
            :key="shortcut.command"
          >
            <dt>{{ t(shortcut.label) }}</dt>
            <dd><kbd>{{ formatBindings(shortcut.bindings) }}</kbd></dd>
          </template>
        </dl>
      </section>
      <h3>{{ t('chrome.calibrationTitle') }}</h3>
      <p>
        {{
          t('help.calibrationBody', {
            keys: formatBindings(CALIBRATION_TAP),
            cancel: formatBindings(CANCEL),
          })
        }}
      </p>
    </div>
  </ElDialog>
</template>
<style scoped>
.help-content {
  max-height: 65vh;
  overflow-y: auto;
  padding-right: 12px;
  line-height: 1.65;
}
h3 {
  margin: 18px 0 6px;
  color: var(--el-text-color-primary);
}
h3:first-child {
  margin-top: 0;
}
h4 {
  margin: 16px 0 6px;
  color: var(--el-color-primary);
}
p {
  margin: 0 0 12px;
}
dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  margin: 0;
}
dt,
dd {
  margin: 0;
  padding: 5px 8px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
dd {
  text-align: right;
}
kbd {
  font: inherit;
  font-variant-numeric: tabular-nums;
}
</style>
