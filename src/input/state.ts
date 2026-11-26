import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useInputState = defineStore('input-state', () => {
  const device = ref<'keyboard' | 'gamepad' | 'yuancon'>('keyboard');
  const recording = ref(false);
  return { device, recording };
});
