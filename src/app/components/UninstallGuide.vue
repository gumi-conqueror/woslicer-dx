<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { getPlatform } from '../../platform';
const { t } = useI18n();
const desktop = getPlatform().kind === 'tauri';
</script>
<template>
  <section class="uninstall-guide">
    <h3>{{ t('support.uninstall') }}</h3>
    <p>{{ t('support.backupFirst') }}</p>
    <ol v-if="desktop">
      <li>{{ t('support.desktopLocate') }}</li>
      <li>{{ t('support.desktopRemove') }}</li>
      <li>{{ t('support.desktopData') }}</li>
    </ol>
    <ol v-else>
      <li>{{ t('support.webClose') }}</li>
      <li>{{ t('support.webData') }}</li>
      <li>{{ t('support.webCache') }}</li>
    </ol>
    <p>{{ t('support.personalFiles') }}</p>
  </section>
</template>
<style scoped>
h3 {
  margin: 18px 0 6px;
  color: var(--el-text-color-primary);
}
p {
  margin: 0 0 10px;
}
ol {
  padding-left: 24px;
}
li {
  margin-bottom: 8px;
}
</style>
