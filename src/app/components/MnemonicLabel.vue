<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ label: string; mnemonic: string; visible: boolean }>();
const index = computed(() => props.label.toLowerCase().indexOf(props.mnemonic));
</script>
<template>
  <span v-if="visible && index >= 0"
    >{{ label.slice(0, index) }}<u>{{ label[index] }}</u>{{ label.slice(index + 1) }}</span
  >
  <span v-else
    >{{ label
    }}<span
      v-if="visible"
      aria-hidden="true"
    >
      (<u>{{ mnemonic.toUpperCase() }}</u>)</span
    ></span
  >
</template>
