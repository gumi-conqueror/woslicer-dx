<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEditorStore } from '../../slicing/editor-store';
import { APPLICATION_MENU, menuCommandEnabled, type MenuCommand } from '../menu';
import { shortcutLabel, gamepadShortcut } from '../shortcuts';
import { useInputState } from '../input-state';
import type { MenuNavigation } from '../gamepad-controls';
import GamepadIcon from '../../ui/GamepadIcon.vue';
import MnemonicLabel from './MnemonicLabel.vue';
const props = defineProps<{ disabled?: boolean; desktop?: boolean }>();
const emit = defineEmits<{ command: [command: MenuCommand] }>();
const { t } = useI18n();
const editor = useEditorStore();
const input = useInputState();
const bar = useTemplateRef<HTMLElement>('bar');
const active = ref(-1);
const expanded = ref(false);
const cues = ref(false);
const groups = computed(() =>
  APPLICATION_MENU.map((group) => ({
    ...group,
    commands: group.commands.filter((item) => item.id !== 'open-data-folder' || props.desktop),
  })),
);
let previousFocus: HTMLElement | null = null;
let altPending = false;
function trigger(): HTMLButtonElement | undefined {
  return bar.value?.querySelectorAll<HTMLButtonElement>('.menu-trigger')[active.value];
}
function items(): HTMLButtonElement[] {
  return Array.from(
    bar.value?.querySelectorAll<HTMLButtonElement>(
      '.menu-popup:not([hidden]) [role="menuitem"]:not(:disabled)',
    ) ?? [],
  );
}
function close(restore = true): void {
  active.value = -1;
  expanded.value = false;
  cues.value = false;
  if (restore && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
}
async function selectGroup(index: number, open: boolean, last = false): Promise<void> {
  if (active.value < 0)
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  active.value = (index + groups.value.length) % groups.value.length;
  expanded.value = open;
  await nextTick();
  const choices = items();
  (open ? ((last ? choices.at(-1) : choices[0]) ?? trigger()) : trigger())?.focus({
    preventScroll: true,
  });
}
function dispatch(command: MenuCommand): void {
  if (!menuCommandEnabled(command, editor)) return;
  close();
  emit('command', command);
}
function navigate(action: MenuNavigation): boolean {
  if (props.disabled) return false;
  if (action === 'toggle') {
    if (active.value >= 0) close();
    else void selectGroup(0, true);
    return true;
  }
  if (active.value < 0) return false;
  switch (action) {
    case 'left':
    case 'right':
      void selectGroup(active.value + (action === 'left' ? -1 : 1), expanded.value);
      break;
    case 'cancel':
      if (expanded.value) {
        expanded.value = false;
        trigger()?.focus();
      } else close();
      break;
    case 'confirm':
      if (!expanded.value) void selectGroup(active.value, true);
      else if (
        document.activeElement instanceof HTMLButtonElement &&
        items().includes(document.activeElement)
      )
        document.activeElement.click();
      break;
    case 'up':
    case 'down': {
      if (!expanded.value) {
        void selectGroup(active.value, true, action === 'up');
        break;
      }
      const choices = items();
      const index = choices.findIndex((item) => item === document.activeElement);
      choices[(index + (action === 'up' ? -1 : 1) + choices.length) % choices.length]?.focus();
      break;
    }
  }
  return true;
}
function keydown(event: KeyboardEvent): void {
  if (props.disabled || event.isComposing || event.key === 'Process') return;
  if (event.key === 'Alt' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (!event.repeat) altPending = true;
    event.preventDefault();
    return;
  }
  altPending = false;
  if (event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (
    active.value < 0 &&
    event.target instanceof HTMLButtonElement &&
    event.target.matches('.menu-trigger') &&
    event.key.startsWith('Arrow')
  ) {
    previousFocus = event.target;
    active.value = Array.from(bar.value?.querySelectorAll('.menu-trigger') ?? []).indexOf(
      event.target,
    );
  }
  const letter = event.key.toLowerCase();
  const group = groups.value.findIndex((item) => item.mnemonic === letter);
  if (event.altKey && group >= 0) {
    cues.value = true;
    void selectGroup(group, true);
  } else if (active.value >= 0 && !event.altKey) {
    switch (event.key) {
      case 'ArrowLeft':
        navigate('left');
        break;
      case 'ArrowRight':
        navigate('right');
        break;
      case 'ArrowUp':
        navigate('up');
        break;
      case 'ArrowDown':
        navigate('down');
        break;
      case 'Enter':
      case ' ':
        navigate('confirm');
        break;
      case 'Escape':
        navigate('cancel');
        break;
      case 'Home':
      case 'End':
        if (expanded.value) (event.key === 'Home' ? items()[0] : items().at(-1))?.focus();
        else void selectGroup(event.key === 'Home' ? 0 : groups.value.length - 1, false);
        break;
      case 'Tab':
        trigger()?.focus();
        close(false);
        return;
      default: {
        if (expanded.value) {
          const item = groups.value[active.value]?.commands.find(
            (item) => item.mnemonic === letter,
          );
          if (item) dispatch(item.id);
        } else if (group >= 0) void selectGroup(group, true);
      }
    }
  } else return;
  event.preventDefault();
  event.stopPropagation();
}
function keyup(event: KeyboardEvent): void {
  if (event.key !== 'Alt' || !altPending || props.disabled) return;
  altPending = false;
  event.preventDefault();
  if (active.value >= 0) close();
  else {
    cues.value = true;
    void selectGroup(0, false);
  }
}
function outside(event: Event): void {
  if (active.value >= 0 && event.target instanceof Node && !bar.value?.contains(event.target))
    close(false);
}
function blur(): void {
  altPending = false;
  close(false);
}
watch(
  () => props.disabled,
  (value) => {
    if (value) blur();
  },
);
onMounted(() => {
  window.addEventListener('keydown', keydown, true);
  window.addEventListener('keyup', keyup, true);
  window.addEventListener('pointerdown', outside);
  window.addEventListener('focusin', outside);
  window.addEventListener('blur', blur);
});
onUnmounted(() => {
  window.removeEventListener('keydown', keydown, true);
  window.removeEventListener('keyup', keyup, true);
  window.removeEventListener('pointerdown', outside);
  window.removeEventListener('focusin', outside);
  window.removeEventListener('blur', blur);
});
defineExpose({ navigate, isActive: () => active.value >= 0 });
</script>
<template>
  <nav
    ref="bar"
    class="application-menu"
    :aria-label="t('menu.application')"
    role="menubar"
  >
    <div
      v-for="(group, index) in groups"
      :key="group.label"
      class="menu-group"
      @pointerenter="expanded && active !== index && selectGroup(index, true)"
    >
      <button
        class="menu-trigger"
        type="button"
        :aria-label="t(group.label)"
        aria-haspopup="menu"
        :aria-expanded="active === index && expanded"
        :aria-keyshortcuts="`Alt+${group.mnemonic.toUpperCase()}`"
        :tabindex="active < 0 ? (index === 0 ? 0 : -1) : active === index ? 0 : -1"
        :disabled="disabled"
        @click="active === index && expanded ? close() : selectGroup(index, true)"
        @keydown.down.prevent="active < 0 && selectGroup(index, true)"
      >
        <MnemonicLabel
          :label="t(group.label)"
          :mnemonic="group.mnemonic"
          :visible="cues"
        />
      </button>
      <div
        class="menu-popup"
        role="menu"
        :aria-label="t(group.label)"
        :hidden="active !== index || !expanded"
      >
        <button
          v-for="item in group.commands"
          :key="item.id"
          type="button"
          role="menuitem"
          tabindex="-1"
          :data-command="item.id"
          :aria-label="t(item.key)"
          :disabled="!menuCommandEnabled(item.id, editor)"
          @click="dispatch(item.id)"
        >
          <MnemonicLabel
            :label="t(item.key)"
            :mnemonic="item.mnemonic"
            :visible="cues"
          />
          <span
            v-if="input.device === 'gamepad'"
            class="menu-hint"
            ><GamepadIcon
              v-if="gamepadShortcut(item.id)"
              :control="gamepadShortcut(item.id) ?? 'a'"
          /></span>
          <kbd v-else>{{ shortcutLabel(item.id) }}</kbd>
        </button>
        <div
          v-if="input.device === 'gamepad'"
          class="menu-navigation-hint"
        >
          <GamepadIcon control="a" />{{ t('input.confirm') }}<GamepadIcon control="b" />{{
            t('input.back')
          }}
        </div>
      </div>
    </div>
  </nav>
</template>
<style scoped>
.application-menu {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  min-height: 32px;
}
.menu-group {
  position: relative;
}
button {
  font: inherit;
  color: var(--el-text-color-regular);
  background: transparent;
  border: 0;
  cursor: pointer;
}
.menu-trigger {
  padding: 5px 8px;
  border-radius: 3px;
  font-size: 12px;
}
.menu-trigger:hover,
.menu-trigger[aria-expanded='true'],
button:focus-visible {
  background: var(--el-fill-color);
  color: var(--el-color-primary);
}
button:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}
.menu-popup {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 2000;
  min-width: 240px;
  max-width: calc(100vw - 32px);
  padding: 5px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  background: var(--el-bg-color-overlay);
  box-shadow: var(--el-box-shadow-light);
}
.menu-popup button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  width: 100%;
  min-height: 30px;
  padding: 4px 10px;
  border-radius: 2px;
  text-align: left;
  white-space: nowrap;
  font-size: 12px;
}
.menu-popup button:hover:not(:disabled),
.menu-popup button:focus {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  outline: none;
}
.menu-popup button:disabled {
  color: var(--el-text-color-disabled);
  cursor: default;
}
kbd {
  color: var(--el-text-color-secondary);
  font: inherit;
  font-size: 11px;
}
.menu-hint {
  min-width: 24px;
  height: 23px;
}
.menu-navigation-hint {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 5px;
  padding: 6px 8px 1px;
  border-top: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: 11px;
}
</style>
