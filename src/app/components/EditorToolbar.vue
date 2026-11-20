<script setup lang="ts">
import DocumentOptions from './DocumentOptions.vue';
import PreferencesControls from './PreferencesControls.vue';
</script>
<template>
  <header class="editor-toolbar">
    <DocumentOptions />
    <PreferencesControls />
  </header>
</template>
<style scoped>
.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--wos-chrome);
}
</style>
