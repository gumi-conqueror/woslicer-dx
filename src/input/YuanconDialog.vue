<script setup lang="ts">
import { ElButton, ElCheckbox, ElDialog, ElOption, ElSelect } from 'element-plus';
import { useI18n } from 'vue-i18n';
import type { YuanconConnection } from './yuancon/use-yuancon';
import YuanconIcon from '../ui/YuanconIcon.vue';
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ connection: YuanconConnection }>();
const { t } = useI18n();
const {
  available,
  nativePicker,
  choices,
  selected,
  connected,
  connecting,
  inverted,
  state,
  error,
  connect,
  disconnect,
  refresh,
} = props.connection;
</script>
<template>
  <ElDialog
    v-model="open"
    :title="t('recording.controller')"
    width="min(520px, 95vw)"
    append-to-body
  >
    <p>{{ t('recording.yuanconDescription') }}</p>
    <p
      v-if="!available"
      role="status"
    >
      {{ t('recording.unavailable') }}
    </p>
    <div class="controller-actions">
      <template v-if="nativePicker">
        <ElSelect
          v-model="selected"
          :aria-label="t('recording.selectDevice')"
          :placeholder="t('recording.selectDevice')"
          :disabled="connected || connecting"
          style="width: 230px"
        >
          <ElOption
            v-for="choice in choices"
            :key="choice.id"
            :label="choice.name"
            :value="choice.id"
          />
        </ElSelect>
        <ElButton
          :disabled="connected || connecting"
          @click="refresh"
          >{{ t('recording.refreshDevices') }}</ElButton
        >
      </template>
      <ElButton
        :disabled="!available || connected"
        :loading="connecting"
        @click="connect"
        >{{ t('recording.connect') }}</ElButton
      >
      <ElButton
        :disabled="!connected && !connecting"
        @click="disconnect"
        >{{ t('recording.disconnect') }}</ElButton
      >
      <span role="status">{{
        t(connected ? 'recording.connected' : 'recording.disconnected')
      }}</span>
    </div>
    <ElCheckbox v-model="inverted">{{ t('recording.invert') }}</ElCheckbox>
    <p>{{ t('recording.directionHint') }}</p>
    <div class="controller-preview">
      <YuanconIcon
        :keys="state?.keys"
        :direction="state?.direction"
        numbered
      />
      <span>{{
        t(
          !state?.direction
            ? 'recording.neutral'
            : state.direction > 0
              ? 'recording.positive'
              : 'recording.negative',
        )
      }}</span>
    </div>
    <p>{{ t('recording.previewHint') }}</p>
    <p
      v-if="error"
      role="alert"
    >
      {{ error.startsWith('recording.') ? t(error) : error }}
    </p>
  </ElDialog>
</template>
<style scoped>
.controller-actions,
.controller-preview {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin: 16px 0;
}
.controller-preview :deep(.yuancon-icon) {
  width: 170px;
  height: 80px;
}
</style>
