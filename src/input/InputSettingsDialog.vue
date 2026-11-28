<script setup lang="ts">
import { ref } from 'vue';
import { ElDialog, ElTabPane, ElTabs } from 'element-plus';
import { useI18n } from 'vue-i18n';
import BindingList from './BindingList.vue';
import WheelSettingsPanel from './WheelSettingsPanel.vue';
const open = defineModel<boolean>({ required: true });
const { t } = useI18n();
const tab = ref<'keyboard' | 'gamepad' | 'wheel'>('keyboard');
</script>
<template>
  <ElDialog
    v-model="open"
    :title="t('chrome.inputSettingsTitle')"
    width="min(820px, 95vw)"
    append-to-body
    destroy-on-close
  >
    <p>{{ t('chrome.inputSettingsHint') }}</p>
    <ElTabs v-model="tab">
      <ElTabPane
        :label="t('input.keyboard')"
        name="keyboard"
      >
        <div
          class="settings-scroll"
          data-gamepad-scroll
        >
          <BindingList device="keyboard" />
        </div>
      </ElTabPane>
      <ElTabPane
        :label="t('input.xbox')"
        name="gamepad"
      >
        <div
          class="settings-scroll"
          data-gamepad-scroll
        >
          <BindingList device="gamepad" />
        </div>
      </ElTabPane>
      <ElTabPane
        :label="t('input.wheel')"
        name="wheel"
      >
        <WheelSettingsPanel />
      </ElTabPane>
    </ElTabs>
  </ElDialog>
</template>
<style scoped>
.settings-scroll {
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 8px;
}
</style>
