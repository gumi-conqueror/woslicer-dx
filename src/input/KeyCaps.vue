<script setup lang="ts">
import { computed } from 'vue';
import { chordKeys, type KeyChord } from './bindings';

/**
 * Keys drawn as key caps: the keys of one chord, or several chords separated
 * by a slash, for example Ctrl+Z / Ctrl+Y.
 */
const props = defineProps<{ keys?: readonly string[]; chords?: readonly KeyChord[] }>();
const groups = computed(() => {
  if (props.keys) return [props.keys];
  const labels = (props.chords ?? []).map(chordKeys);
  // Chords that look the same, such as + with or without Shift, are shown once.
  return labels.filter(
    (keys, index) => labels.findIndex((other) => other.join('+') === keys.join('+')) === index,
  );
});
</script>
<template>
  <span class="key-caps"
    ><template
      v-for="(group, index) in groups"
      :key="index"
      ><span
        v-if="index"
        class="separator"
        >/</span
      ><kbd
        v-for="key in group"
        :key="key"
        >{{ key }}</kbd
      ></template
    ></span
  >
</template>
<style scoped>
.key-caps {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  vertical-align: middle;
}
.separator {
  margin: 0 3px;
  color: var(--el-text-color-secondary);
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
