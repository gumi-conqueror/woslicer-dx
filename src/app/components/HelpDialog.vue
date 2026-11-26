<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElButton, ElDialog } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { SHORTCUTS, CALIBRATION_TAP, CANCEL, formatBindings, gamepadShortcut } from '../shortcuts';
import { GAMEPAD_MENU_SHORTCUTS } from '../gamepad-controls';
import { APPLICATION_MENU } from '../menu';
import GamepadIcon from '../../ui/GamepadIcon.vue';
import UninstallGuide from './UninstallGuide.vue';
import RecordingGuide from './RecordingGuide.vue';
const open = defineModel<boolean>({ required: true });
const { t } = useI18n();
const groups = ['project', 'edit', 'playback', 'navigation', 'output'] as const;
// This choice belongs to the guide. Actual input activity must never change it.
const guideDevice = ref<'keyboard' | 'gamepad' | 'yuancon'>('keyboard');
const sections = computed(() =>
  groups
    .map((group) => ({
      group,
      shortcuts: SHORTCUTS.filter(
        (item) =>
          item.group === group &&
          (guideDevice.value === 'keyboard' ||
            (guideDevice.value === 'gamepad' && gamepadShortcut(item.command))),
      ),
    }))
    .filter((section) => section.shortcuts.length),
);
</script>
<template>
  <ElDialog
    v-model="open"
    :title="t('menu.guide')"
    width="min(840px, 95vw)"
    append-to-body
    destroy-on-close
  >
    <div
      class="help-content"
      data-gamepad-scroll
    >
      <div
        class="guide-switch"
        role="group"
        :aria-label="t('input.guideChoice')"
      >
        <span>{{ t('input.guideChoice') }}</span>
        <ElButton
          :aria-pressed="guideDevice === 'keyboard'"
          :type="guideDevice === 'keyboard' ? 'primary' : 'default'"
          @click="guideDevice = 'keyboard'"
          >{{ t('input.keyboard') }}</ElButton
        >
        <ElButton
          :aria-pressed="guideDevice === 'gamepad'"
          :type="guideDevice === 'gamepad' ? 'primary' : 'default'"
          @click="guideDevice = 'gamepad'"
          >{{ t('input.xbox') }}</ElButton
        >
        <ElButton
          :aria-pressed="guideDevice === 'yuancon'"
          :type="guideDevice === 'yuancon' ? 'primary' : 'default'"
          @click="guideDevice = 'yuancon'"
          >{{ t('input.yuancon') }}</ElButton
        >
      </div>
      <h3>{{ t('help.workflow') }}</h3>
      <p>{{ t('help.workflowBody') }}</p>
      <p>{{ t('help.audioFormats') }}</p>
      <h3>{{ t('help.workspace') }}</h3>
      <p>{{ t('help.workspaceBody') }}</p>
      <template v-if="guideDevice === 'keyboard'">
        <h3>{{ t('help.mouse') }}</h3>
        <p>{{ t('help.mouseBody', { cancel: formatBindings(CANCEL) }) }}</p>
        <h3>{{ t('help.keyboard') }}</h3>
        <p>{{ t('help.keyboardScope') }}</p>
        <p>{{ t('input.altNavigation') }}</p>
        <div class="menu-keys">
          <span
            v-for="menu in APPLICATION_MENU"
            :key="menu.label"
            >{{ t(menu.label) }} <kbd>Alt+{{ menu.mnemonic.toUpperCase() }}</kbd></span
          >
        </div>
      </template>
      <template v-else-if="guideDevice === 'gamepad'">
        <h3>{{ t('input.xbox') }}</h3>
        <p>{{ t('input.gamepadNotice') }}</p>
        <p>{{ t('input.gamepadScope') }}</p>
        <h4>{{ t('input.menuMode') }}</h4>
        <dl>
          <template
            v-for="binding in GAMEPAD_MENU_SHORTCUTS"
            :key="binding.control"
            ><dt>{{ t(binding.label) }}</dt>
            <dd><GamepadIcon :control="binding.control" /></dd
          ></template>
        </dl>
        <p>{{ t('input.dialogNavigation') }}</p>
        <p class="scroll-hint">
          <GamepadIcon control="lt" /><GamepadIcon control="rt" />{{ t('input.scrollHelp') }}
        </p>
      </template>
      <RecordingGuide :device="guideDevice" />
      <section
        v-for="section in sections"
        :key="section.group"
      >
        <h4>{{ t(`help.groups.${section.group}`) }}</h4>
        <dl>
          <template
            v-for="shortcut in section.shortcuts"
            :key="shortcut.command"
          >
            <dt>{{ t(shortcut.label) }}</dt>
            <dd>
              <GamepadIcon
                v-if="guideDevice === 'gamepad'"
                :control="gamepadShortcut(shortcut.command) ?? 'a'"
              /><kbd v-else>{{ formatBindings(shortcut.bindings) }}</kbd>
            </dd>
          </template>
        </dl>
      </section>
      <h3 v-if="guideDevice === 'keyboard'">{{ t('chrome.calibrationTitle') }}</h3>
      <p v-if="guideDevice === 'keyboard'">
        {{
          t('help.calibrationBody', {
            keys: formatBindings(CALIBRATION_TAP),
            cancel: formatBindings(CANCEL),
          })
        }}
      </p>
      <UninstallGuide />
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
.guide-switch {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color);
}
.guide-switch .el-button {
  margin: 0;
}
.menu-keys {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}
.scroll-hint {
  display: flex;
  align-items: center;
  gap: 6px;
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
