<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { canRecord, commandLabel, type AppCommand } from '../commands';
import { gamepadControls } from '../../input/bindings';
import { useInputState } from '../../input/state';
import { useEditorStore } from '../../slicing/editor-store';
import GamepadIcon from '../../ui/GamepadIcon.vue';
/** The commands the hint bar shows for each layer; the controls come from the bindings. */
const HINTS: Readonly<Record<'edit' | 'recording', readonly AppCommand[]>> = {
  edit: ['place-marker', 'toggle-marker', 'preview', 'play-pause', 'open-wheel', 'help'],
  recording: ['recording-tap', 'play-pause', 'seek-forward', 'rate-up', 'open-wheel'],
};
const input = useInputState();
const editor = useEditorStore();
const { t } = useI18n();
const hints = computed(() => {
  const layer = input.recording && canRecord(editor) ? 'recording' : 'edit';
  return HINTS[layer].map((command) => ({
    command,
    label: t(commandLabel(command)),
    controls: gamepadControls(command, layer),
  }));
});
</script>
<template>
  <div
    class="gamepad-hints"
    role="note"
    :aria-label="t('input.hints')"
  >
    <span
      v-for="hint in hints"
      :key="hint.command"
      class="hint"
      ><GamepadIcon
        v-for="control in hint.controls"
        :key="control"
        :control="control"
      />{{ hint.label }}</span
    >
    <span class="hint"><GamepadIcon control="menu" />{{ t('input.menu') }}</span>
  </div>
</template>
<style scoped>
.gamepad-hints {
  display: inline;
}
.hint {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  vertical-align: middle;
}
.hint + .hint {
  margin-left: 14px;
}
.gamepad-icon {
  width: 19px;
  height: 19px;
}
</style>
