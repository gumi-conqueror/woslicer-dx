<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEditorStore } from '../../slicing/editor-store';
import { APPLICATION_MENU } from '../menu';
import { commandEnabled, commandLabel, type AppCommand } from '../commands';
import { shortcutLabel, gamepadShortcut } from '../../input/bindings';
import { useInputState } from '../../input/state';
import type { UiNavigation } from '../../input/gamepad';
import GamepadIcon from '../../input/GamepadIcon.vue';
import MnemonicLabel from './MnemonicLabel.vue';
const props = defineProps<{ disabled?: boolean; desktop?: boolean }>();
const emit = defineEmits<{ command: [command: AppCommand] }>();
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
function dispatch(command: AppCommand): void {
  if (!commandEnabled(command, editor)) return;
  close();
  emit('command', command);
}
/** Controller navigation. Previous and next move along the menu bar. */
function navigate(navigation: UiNavigation): boolean {
  if (props.disabled) return false;
  const action = navigation === 'previous' ? 'left' : navigation === 'next' ? 'right' : navigation;
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
    case 'scroll-up':
    case 'scroll-down':
      // Menus are short; scrolling belongs to dialogs.
      break;
  }
  return true;
}
/** A lone Alt press focuses the menu bar on release; see `keyup`. */
function altPress(event: KeyboardEvent): boolean {
  if (event.key !== 'Alt' || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (!event.repeat) altPending = true;
  event.preventDefault();
  return true;
}
/** Alt+letter opens the menu with that mnemonic. */
function mnemonicKey(event: KeyboardEvent): boolean {
  const group = groups.value.findIndex((item) => item.mnemonic === event.key.toLowerCase());
  if (group < 0) return false;
  cues.value = true;
  void selectGroup(group, true);
  return true;
}
/** Keys inside an active menu bar. Returns false when the key leaves the menu to the page. */
function menuKey(event: KeyboardEvent): boolean {
  const NAVIGATION: Partial<Record<string, UiNavigation>> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    Enter: 'confirm',
    ' ': 'confirm',
    Escape: 'cancel',
  };
  const navigation = NAVIGATION[event.key];
  if (navigation) navigate(navigation);
  else if (event.key === 'Home' || event.key === 'End') {
    if (expanded.value) (event.key === 'Home' ? items()[0] : items().at(-1))?.focus();
    else void selectGroup(event.key === 'Home' ? 0 : groups.value.length - 1, false);
  } else if (event.key === 'Tab') {
    trigger()?.focus();
    close(false);
    return false;
  } else if (expanded.value) {
    const letter = event.key.toLowerCase();
    const item = groups.value[active.value]?.commands.find((item) => item.mnemonic === letter);
    if (item) dispatch(item.id);
  } else mnemonicKey(event);
  return true;
}
function keydown(event: KeyboardEvent): void {
  if (props.disabled || event.isComposing || event.key === 'Process') return;
  if (altPress(event)) return;
  altPending = false;
  if (event.ctrlKey || event.metaKey || event.shiftKey) return;
  // Arrow keys on a focused menu button activate the bar without Alt.
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
  const handled = event.altKey ? mnemonicKey(event) : active.value >= 0 && menuKey(event);
  if (!handled) return;
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
          :aria-label="t(commandLabel(item.id))"
          :disabled="!commandEnabled(item.id, editor)"
          @click="dispatch(item.id)"
        >
          <MnemonicLabel
            :label="t(commandLabel(item.id))"
            :mnemonic="item.mnemonic"
            :visible="cues"
          />
          <span
            v-if="input.device === 'gamepad'"
            class="menu-hint"
            ><GamepadIcon
              v-if="gamepadShortcut(item.id, input.recording)"
              :control="gamepadShortcut(item.id, input.recording) ?? 'a'"
          /></span>
          <kbd v-else-if="input.device === 'keyboard'">{{
            shortcutLabel(item.id, input.recording)
          }}</kbd>
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
