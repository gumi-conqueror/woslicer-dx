<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  boundCommands,
  formatChords,
  gamepadControls,
  keyboardChords,
  recordingKeys,
  yuanconControls,
} from './bindings';
import { commandLabel, RECORDING_SEEK_SECONDS } from '../commands/commands';
import GamepadIcon from './GamepadIcon.vue';
import YuanconIcon from './YuanconIcon.vue';
const props = defineProps<{ device: 'keyboard' | 'gamepad' | 'yuancon' }>();
const { t } = useI18n();
const keys = recordingKeys();
// Every command with recording bindings, with the controls that act in recording mode.
const commands = boundCommands('recording').map((command) => ({
  command,
  keyboard: formatChords(keyboardChords(command, 'recording')),
  gamepad: gamepadControls(command, 'recording'),
  yuancon: yuanconControls(command).filter(
    (control) => control === 'positive' || control === 'negative',
  ),
}));
const rows = computed(() =>
  commands.filter(
    (row) =>
      row.command === 'recording-tap' ||
      (props.device === 'keyboard'
        ? row.keyboard
        : props.device === 'gamepad'
          ? row.gamepad.length
          : row.yuancon.length),
  ),
);
</script>
<template>
  <section class="recording-guide">
    <h3>{{ t('recording.mode') }}</h3>
    <p>{{ t('recording.description', { seconds: RECORDING_SEEK_SECONDS }) }}</p>
    <dl>
      <template
        v-for="row in rows"
        :key="row.command"
      >
        <dt>{{ t(commandLabel(row.command)) }}</dt>
        <dd
          v-if="row.command === 'recording-tap'"
          class="recording-keys"
        >
          <YuanconIcon
            v-if="device === 'yuancon'"
            class="numbered-controller"
            numbered
          />
          <template v-else>
            <span
              v-for="item in keys"
              :key="item.key"
              class="key-binding"
            >
              <span>{{ item.key }}:</span>
              <kbd v-if="device === 'keyboard'">{{ item.keyboard }}</kbd>
              <GamepadIcon
                v-else
                :control="item.gamepad"
              />
            </span>
          </template>
        </dd>
        <dd v-else-if="device === 'keyboard'">
          <kbd>{{ row.keyboard }}</kbd>
        </dd>
        <dd v-else-if="device === 'gamepad'">
          <GamepadIcon
            v-for="control in row.gamepad"
            :key="control"
            :control="control"
          />
        </dd>
        <dd v-else>
          <span
            v-for="control in row.yuancon"
            :key="control"
            class="yuancon-binding"
            ><YuanconIcon :control="control" />{{ t(`recording.${control}`) }}</span
          >
        </dd>
      </template>
    </dl>
    <p>{{ t('recording.keysHint') }}</p>
    <p v-if="device === 'gamepad'">{{ t('recording.stickHint') }}</p>
    <p v-if="device === 'yuancon'">{{ t('recording.yuanconHint') }}</p>
  </section>
</template>
<style scoped>
dl {
  display: grid;
  grid-template-columns: minmax(130px, 1fr) 2fr;
  gap: 8px 16px;
}
dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
.yuancon-binding {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.key-binding {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: 8px;
}
.numbered-controller {
  width: 136px;
  height: 64px;
}
</style>
