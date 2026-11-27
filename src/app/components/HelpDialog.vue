<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElButton, ElDialog } from 'element-plus';
import { useI18n } from 'vue-i18n';
import {
  boundCommands,
  CALIBRATION_TAP,
  CANCEL,
  formatChords,
  gamepadControls,
  keyboardChords,
} from '../../input/bindings';
import { UI_NAVIGATION } from '../../input/gamepad';
import { COMMAND_GROUPS, commandGroup, commandLabel } from '../commands';
import { APPLICATION_MENU } from '../menu';
import GamepadIcon from '../../ui/GamepadIcon.vue';
import KeyCaps from '../../ui/KeyCaps.vue';
import MouseIcon from '../../ui/MouseIcon.vue';
import { HINT_AREAS } from '../hint-areas';
import UninstallGuide from './UninstallGuide.vue';
import RecordingGuide from './RecordingGuide.vue';
const open = defineModel<boolean>({ required: true });
const { t } = useI18n();
// This choice belongs to the guide. Actual input activity must never change it.
const guideDevice = ref<'keyboard' | 'gamepad' | 'yuancon'>('keyboard');
const editing = boundCommands('edit').map((command) => ({
  command,
  group: commandGroup(command),
  keyboard: keyboardChords(command),
  gamepad: gamepadControls(command),
}));
const sections = computed(() =>
  COMMAND_GROUPS.map((group) => ({
    group,
    rows: editing.filter(
      (row) =>
        row.group === group &&
        (guideDevice.value === 'keyboard'
          ? row.keyboard.length
          : guideDevice.value === 'gamepad' && row.gamepad.length),
    ),
  })).filter((section) => section.rows.length),
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
        <section
          v-for="(area, name) in HINT_AREAS"
          :key="name"
        >
          <h4>{{ t(area.title) }}</h4>
          <dl>
            <template
              v-for="(hint, index) in area.mouse"
              :key="index"
              ><dt>{{ t(hint.label) }}</dt>
              <dd>
                <KeyCaps
                  v-if="'keys' in hint"
                  :keys="hint.keys"
                /><MouseIcon
                  v-if="'mouse' in hint"
                  v-bind="hint.mouse"
                /></dd
            ></template>
          </dl>
        </section>
        <h3>{{ t('help.keyboard') }}</h3>
        <p>{{ t('help.keyboardScope') }}</p>
        <p>{{ t('input.altNavigation') }}</p>
        <div class="menu-keys">
          <span
            v-for="menu in APPLICATION_MENU"
            :key="menu.label"
            >{{ t(menu.label) }} <KeyCaps :keys="['Alt', menu.mnemonic.toUpperCase()]"
          /></span>
        </div>
        <h4>{{ t('input.wheel') }}</h4>
        <p>{{ t('input.wheelKeyboard', { key: formatChords(keyboardChords('open-wheel')) }) }}</p>
      </template>
      <template v-else-if="guideDevice === 'gamepad'">
        <h3>{{ t('input.xbox') }}</h3>
        <p>{{ t('input.gamepadScope') }}</p>
        <h4>{{ t('input.navigation') }}</h4>
        <p>{{ t('input.dialogNavigation') }}</p>
        <dl>
          <template
            v-for="item in UI_NAVIGATION"
            :key="item.action"
            ><dt>{{ t(item.label) }}</dt>
            <dd>
              <GamepadIcon
                v-for="control in item.controls"
                :key="control"
                :control="control"
              /></dd
          ></template>
        </dl>
        <h4>{{ t('input.wheel') }}</h4>
        <p>{{ t('input.wheelGamepad') }}</p>
      </template>
      <RecordingGuide :device="guideDevice" />
      <section
        v-for="section in sections"
        :key="section.group"
      >
        <h4>{{ t(`help.groups.${section.group}`) }}</h4>
        <dl>
          <template
            v-for="row in section.rows"
            :key="row.command"
          >
            <dt>{{ t(commandLabel(row.command)) }}</dt>
            <dd>
              <template v-if="guideDevice === 'gamepad'"
                ><GamepadIcon
                  v-for="control in row.gamepad"
                  :key="control"
                  :control="control"
              /></template>
              <KeyCaps
                v-else
                :chords="row.keyboard"
              />
            </dd>
          </template>
        </dl>
      </section>
      <h3 v-if="guideDevice === 'keyboard'">{{ t('chrome.calibrationTitle') }}</h3>
      <p v-if="guideDevice === 'keyboard'">
        {{
          t('help.calibrationBody', {
            keys: formatChords(CALIBRATION_TAP),
            cancel: formatChords(CANCEL),
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
