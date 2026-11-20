<script setup lang="ts">
defineProps<{ name: keyof typeof paths }>();
const paths = {
  keyboard: 'M2 5h20v14H2ZM5 9h1m3 0h1m3 0h1m3 0h1M5 12h1m3 0h1m3 0h1m3 0h1M7 16h10',
  gamepad: 'M7 7h10c4 0 6 12 3 12l-5-4H9l-5 4C1 19 3 7 7 7ZM7 9v5m-2-2h4m7-2h.1m2 3h.1',
  wave: 'M3 10v4m4-8v12m5-16v20m5-16v12m4-8v4',
  folder: 'M3 7V5h6l2 2h10v13H3V7Zm0 3h18',
  save: 'M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-7h10v7',
  undo: 'M8 4 3 9l5 5M3 9h10a7 7 0 0 1 7 7v3',
  redo: 'm16 4 5 5-5 5m5-5H11a7 7 0 0 0-7 7v3',
  play: 'm8 4 12 8-12 8Z',
  pause: 'M8 4v16M16 4v16',
  stop: 'M5 5h14v14H5Z',
  cuts: 'M8 3v18M16 3v18M3 8h5m8 8h5',
  detect: 'M3 17 7 7l5 13 5-16 4 9',
  output: 'M12 16V3m-5 5 5-5 5 5M4 14v7h16v-7',
  notes: 'M9 18V5l11-2v13M9 8l11-2M9 18c0 4-6 5-6 1s6-5 6-1Zm11-2c0 4-6 5-6 1s6-5 6-1Z',
  close: 'm6 6 12 12M6 18 18 6',
  minimize: 'M5 12h14',
  maximize: 'M5 5h14v14H5Z',
  restore: 'M8 8V4h12v12h-4M4 8h12v12H4Z',
  collapse: 'm9 5 7 7-7 7',
} as const;
</script>

<template>
  <svg
    class="app-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name]" />
  </svg>
</template>

<style scoped>
.app-icon {
  width: 18px;
  height: 18px;
  flex: none;
  vertical-align: middle;
}
</style>
