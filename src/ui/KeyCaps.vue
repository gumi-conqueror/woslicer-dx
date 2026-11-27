<script setup lang="ts">
/** Keys of one chord drawn as key caps, for example Shift and S. */
defineProps<{ keys: readonly string[] }>();
</script>
<template>
  <span class="key-caps"
    ><kbd
      v-for="key in keys"
      :key="key"
      >{{ key }}</kbd
    ></span
  >
</template>
<style scoped>
.key-caps {
  display: inline-flex;
  gap: 2px;
  vertical-align: middle;
}
kbd {
  min-width: 16px;
  padding: 0 4px;
  border: 1px solid var(--el-border-color);
  border-bottom-width: 2px;
  border-radius: 3px;
  background: var(--el-fill-color-blank);
  color: var(--el-text-color-regular);
  font:
    600 10px / 15px 'Consolas',
    monospace;
  text-align: center;
}
</style>
