<script setup lang="ts">
import { computed } from 'vue';
import { ElButton, ElDialog, ElOption, ElOptionGroup, ElSelect } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { APP_COMMANDS, COMMAND_GROUPS, commandGroup, commandLabel } from '../commands';
import { MAX_WHEELS, useWheelLayout, wheelCommand } from '../../input/wheel-layout';
const open = defineModel<boolean>({ required: true });
const { t } = useI18n();
const layout = useWheelLayout();
/** Grid cell (row, column) of each slot, clockwise from the top. */
const CELLS = [
  [1, 2],
  [1, 3],
  [2, 3],
  [3, 3],
  [3, 2],
  [3, 1],
  [2, 1],
  [1, 1],
] as const;
const DIRECTIONS = [
  'chrome.directionUp',
  'chrome.directionUpRight',
  'chrome.directionRight',
  'chrome.directionDownRight',
  'chrome.directionDown',
  'chrome.directionDownLeft',
  'chrome.directionLeft',
  'chrome.directionUpLeft',
] as const;
const groups = computed(() =>
  COMMAND_GROUPS.map((group) => ({
    group,
    commands: APP_COMMANDS.filter(
      (command) => wheelCommand(command) && commandGroup(command) === group,
    ),
  })),
);
const EMPTY = '';
function choose(page: number, slot: number, value: unknown): void {
  layout.setSlot(page, slot, wheelCommand(value) ? value : null);
}
</script>
<template>
  <ElDialog
    v-model="open"
    :title="t('menu.wheelSettings')"
    width="min(760px, 95vw)"
    append-to-body
  >
    <div
      class="wheel-settings"
      data-gamepad-scroll
    >
      <p>{{ t('chrome.wheelSettingsHint') }}</p>
      <section
        v-for="(wheel, page) in layout.wheels"
        :key="page"
        class="wheel-page"
        :aria-label="t('chrome.wheelPage', { number: page + 1 })"
      >
        <header>
          <h3>{{ t('chrome.wheelPage', { number: page + 1 }) }}</h3>
          <ElButton
            v-if="layout.wheels.length > 1"
            size="small"
            @click="layout.removeWheel(page)"
            >{{ t('chrome.removeWheel') }}</ElButton
          >
        </header>
        <div class="slot-grid">
          <ElSelect
            v-for="(command, slot) in wheel"
            :key="slot"
            :model-value="command ?? EMPTY"
            :aria-label="`${t('chrome.wheelPage', { number: page + 1 })} · ${t(DIRECTIONS[slot] ?? '')}`"
            :style="{ gridRow: CELLS[slot]?.[0], gridColumn: CELLS[slot]?.[1] }"
            filterable
            size="small"
            @update:model-value="(value: unknown) => choose(page, slot, value)"
          >
            <ElOption
              :value="EMPTY"
              :label="t('chrome.emptySlot')"
            />
            <ElOptionGroup
              v-for="group in groups"
              :key="group.group"
              :label="t(`help.groups.${group.group}`)"
            >
              <ElOption
                v-for="item in group.commands"
                :key="item"
                :value="item"
                :label="t(commandLabel(item))"
              />
            </ElOptionGroup>
          </ElSelect>
          <span class="slot-center">{{ page + 1 }}</span>
        </div>
      </section>
      <div class="wheel-actions">
        <ElButton
          :disabled="layout.wheels.length >= MAX_WHEELS"
          @click="layout.addWheel()"
          >{{ t('chrome.addWheel') }}</ElButton
        >
        <ElButton @click="layout.reset()">{{ t('chrome.resetWheels') }}</ElButton>
      </div>
    </div>
  </ElDialog>
</template>
<style scoped>
.wheel-settings {
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 8px;
}
.wheel-page {
  margin-bottom: 18px;
}
.wheel-page header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
h3 {
  margin: 8px 0;
  font-size: 14px;
}
.slot-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.slot-center {
  grid-row: 2;
  grid-column: 2;
  display: grid;
  place-items: center;
  color: var(--el-text-color-secondary);
}
.wheel-actions {
  display: flex;
  gap: 8px;
}
</style>
