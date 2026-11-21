<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { RECORDING_BINDINGS, RECORDING_KEYS, RECORDING_SEEK_SECONDS } from '../recording-bindings';
import GamepadIcon from '../../ui/GamepadIcon.vue';
import YuanconIcon from '../../ui/YuanconIcon.vue';
defineProps<{ device: 'keyboard' | 'gamepad' | 'yuancon' }>();
const { t } = useI18n();
</script>
<template>
  <section class="recording-guide">
    <h3>{{ t('recording.mode') }}</h3>
    <p>{{ t('recording.description', { seconds: RECORDING_SEEK_SECONDS }) }}</p>
    <dl>
      <template
        v-for="binding in RECORDING_BINDINGS"
        :key="binding.command"
      >
        <template v-if="binding[device].length">
          <dt>{{ t(binding.label) }}</dt>
          <dd
            v-if="binding.command === 'recording-tap'"
            class="recording-keys"
          >
            <YuanconIcon
              v-if="device === 'yuancon'"
              class="numbered-controller"
              numbered
            />
            <template v-else>
              <span
                v-for="keyBinding in RECORDING_KEYS"
                :key="keyBinding.key"
                class="key-binding"
              >
                <span>{{ keyBinding.key }}:</span>
                <kbd v-if="device === 'keyboard'">{{
                  keyBinding.keyboard.replace(/^Key/, '')
                }}</kbd>
                <GamepadIcon
                  v-else
                  :control="keyBinding.gamepad"
                  dpad-only
                />
              </span>
            </template>
          </dd>
          <dd v-else-if="device === 'keyboard'">
            <kbd>{{ binding.keyboard.map((key) => key.replace(/^Key/, '')).join(' / ') }}</kbd>
          </dd>
          <dd v-else-if="device === 'gamepad'">
            <GamepadIcon
              v-for="control in binding.gamepad"
              :key="control"
              :control="control"
              dpad-only
            />
          </dd>
          <dd v-else>
            <span
              v-for="control in binding.yuancon"
              :key="control"
              class="yuancon-binding"
              ><YuanconIcon :control="control" />{{ t(`recording.${control}`) }}</span
            >
          </dd>
        </template>
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
