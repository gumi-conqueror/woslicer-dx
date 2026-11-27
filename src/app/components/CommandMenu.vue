<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { commandEnabled, commandLabel, type AppCommand, type CommandState } from '../commands';
import { shortcutLabel } from '../../input/bindings';

/**
 * A context menu of commands at a pointer position. `null` entries are
 * separators. Labels, availability and shortcuts come from the command registry
 * and the bindings, as in the menu bar.
 */
const props = defineProps<{
  commands: readonly (AppCommand | null)[];
  x: number;
  y: number;
  state: CommandState;
  label: string;
}>();
const emit = defineEmits<{ run: [command: AppCommand]; close: [] }>();
const { t } = useI18n();
const menu = useTemplateRef<HTMLElement>('menu');
const position = ref({ left: props.x, top: props.y });

function items(): HTMLButtonElement[] {
  return Array.from(
    menu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
  );
}
function choose(command: AppCommand): void {
  emit('close');
  emit('run', command);
}
function move(step: number): void {
  const choices = items();
  const index = choices.findIndex((item) => item === document.activeElement);
  choices[(index + step + choices.length) % choices.length]?.focus();
}
// While the menu is open it owns the keyboard, so editor shortcuts do not run behind it.
function keydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') {
    if (
      !(document.activeElement instanceof HTMLButtonElement) ||
      !items().includes(document.activeElement)
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    document.activeElement.click();
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.key === 'ArrowDown') move(1);
  else if (event.key === 'ArrowUp') move(-1);
  else if (event.key === 'Home') items()[0]?.focus();
  else if (event.key === 'End') items().at(-1)?.focus();
  else if (event.key === 'Escape' || event.key === 'Tab') emit('close');
}
function outside(event: Event): void {
  if (event.target instanceof Node && menu.value?.contains(event.target)) return;
  emit('close');
}
function close(): void {
  emit('close');
}
onMounted(async () => {
  await nextTick();
  // Keep the whole menu inside the window.
  const box = menu.value?.getBoundingClientRect();
  if (box)
    position.value = {
      left: Math.max(0, Math.min(props.x, window.innerWidth - box.width)),
      top: Math.max(0, Math.min(props.y, window.innerHeight - box.height)),
    };
  items()[0]?.focus();
  window.addEventListener('keydown', keydown, true);
  window.addEventListener('pointerdown', outside, true);
  window.addEventListener('contextmenu', outside, true);
  window.addEventListener('blur', close);
  window.addEventListener('resize', close);
});
onUnmounted(() => {
  window.removeEventListener('keydown', keydown, true);
  window.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('contextmenu', outside, true);
  window.removeEventListener('blur', close);
  window.removeEventListener('resize', close);
});
</script>
<template>
  <Teleport to="body">
    <div
      ref="menu"
      class="command-menu"
      role="menu"
      :aria-label="label"
      :style="{ left: `${position.left}px`, top: `${position.top}px` }"
      @contextmenu.prevent
    >
      <template
        v-for="(command, index) in commands"
        :key="command ?? `separator-${index}`"
      >
        <hr
          v-if="command === null"
          role="separator"
        />
        <button
          v-else
          type="button"
          role="menuitem"
          tabindex="-1"
          :data-command="command"
          :disabled="!commandEnabled(command, state)"
          @click="choose(command)"
        >
          <span>{{ t(commandLabel(command)) }}</span>
          <kbd>{{ shortcutLabel(command) }}</kbd>
        </button>
      </template>
    </div>
  </Teleport>
</template>
<style scoped>
.command-menu {
  position: fixed;
  z-index: 2500;
  min-width: 220px;
  max-width: calc(100vw - 16px);
  padding: 5px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  background: var(--el-bg-color-overlay);
  box-shadow: var(--el-box-shadow-light);
  font-size: 12px;
}
button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  width: 100%;
  min-height: 28px;
  padding: 4px 10px;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: var(--el-text-color-regular);
  font: inherit;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}
button:hover:not(:disabled),
button:focus {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  outline: none;
}
button:disabled {
  color: var(--el-text-color-disabled);
  cursor: default;
}
kbd {
  color: var(--el-text-color-secondary);
  font: inherit;
  font-size: 11px;
}
hr {
  margin: 4px 2px;
  border: 0;
  border-top: 1px solid var(--el-border-color-lighter);
}
</style>
