<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { ElButton, ElSegmented } from 'element-plus';
import { useI18n } from 'vue-i18n';
import {
  activeBindings,
  bindingId,
  formatChords,
  type Binding,
  type InputLayer,
  type KeyChord,
} from '../../input/bindings';
import {
  reservedKey,
  useBindingOverrides,
  type RebindableDevice,
} from '../../input/binding-overrides';
import { commandLabel } from '../commands';
import { APPLICATION_MENU } from '../menu';
import GamepadIcon from '../../ui/GamepadIcon.vue';

const props = defineProps<{ device: RebindableDevice }>();
const { t } = useI18n();
const overrides = useBindingOverrides();
const layer = ref<InputLayer>('edit');
const reserved = ref(false);
const MNEMONICS = APPLICATION_MENU.map((group) => group.mnemonic);
const rows = computed(() =>
  activeBindings().filter((row) => row.layer === layer.value && row.command !== null),
);
function label(row: Binding): string {
  const name = row.command ? t(commandLabel(row.command)) : '';
  return row.args ? `${name} ${row.args.keys.join('+')}` : name;
}
function waiting(row: Binding): boolean {
  const capture = overrides.capture;
  return capture?.device === props.device && bindingId(capture.row) === bindingId(row);
}
function record(row: Binding): void {
  reserved.value = false;
  overrides.capture = { row, device: props.device };
}
/** Builds a chord from a key press: by character while editing, by position while recording. */
function chordOf(event: KeyboardEvent, recording: boolean): KeyChord {
  if (recording) return { code: event.code || event.key };
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return {
    key,
    ...(event.ctrlKey || event.metaKey ? { primary: true } : {}),
    ...(event.altKey ? { alt: true } : {}),
    ...(event.shiftKey ? { shift: true } : {}),
  };
}
// While recording a key, the next press belongs to the recorder, not to the dialog or editor.
function keydown(event: KeyboardEvent): void {
  const capture = overrides.capture;
  if (props.device !== 'keyboard' || capture?.device !== 'keyboard') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key) || event.repeat) return;
  if (event.key === 'Escape') {
    overrides.capture = null;
    return;
  }
  const chord = chordOf(event, capture.row.layer === 'recording');
  if (reservedKey(chord, MNEMONICS)) {
    reserved.value = true;
    return;
  }
  overrides.assign(capture.row, 'keyboard', chord);
  overrides.capture = null;
}
window.addEventListener('keydown', keydown, true);
onUnmounted(() => {
  window.removeEventListener('keydown', keydown, true);
  if (overrides.capture?.device === props.device) overrides.capture = null;
});
watch(layer, () => {
  overrides.capture = null;
});
</script>
<template>
  <div class="binding-list">
    <div class="binding-toolbar">
      <ElSegmented
        v-model="layer"
        size="small"
        :options="[
          { label: t('chrome.layerEdit'), value: 'edit' },
          { label: t('recording.mode'), value: 'recording' },
        ]"
      />
      <ElButton
        size="small"
        @click="overrides.restoreAll()"
        >{{ t('chrome.restoreAllBindings') }}</ElButton
      >
    </div>
    <p
      v-if="overrides.capture?.device === device"
      class="binding-prompt"
      role="status"
    >
      {{
        reserved
          ? t('chrome.keyReserved')
          : t(device === 'keyboard' ? 'chrome.pressKey' : 'chrome.pressControl')
      }}
    </p>
    <dl>
      <template
        v-for="row in rows"
        :key="bindingId(row)"
      >
        <dt>{{ label(row) }}</dt>
        <dd>
          <span class="binding-controls">
            <template v-if="device === 'keyboard'">
              <kbd v-if="overrides.keyboard(row).length">{{
                formatChords(overrides.keyboard(row))
              }}</kbd>
            </template>
            <template v-else>
              <GamepadIcon
                v-for="control in overrides.gamepad(row)"
                :key="control"
                :control="control"
              />
            </template>
            <span
              v-if="!overrides.current(row, device).length"
              class="unbound"
              >{{ t('chrome.unbound') }}</span
            >
          </span>
          <ElButton
            size="small"
            :type="waiting(row) ? 'primary' : 'default'"
            @click="record(row)"
            >{{ t('chrome.recordBinding') }}</ElButton
          >
          <ElButton
            size="small"
            @click="overrides.clear(row, device)"
            >{{ t('chrome.clearBinding') }}</ElButton
          >
          <ElButton
            size="small"
            @click="overrides.restore(row, device)"
            >{{ t('chrome.restoreBinding') }}</ElButton
          >
        </dd>
      </template>
    </dl>
  </div>
</template>
<style scoped>
.binding-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.binding-prompt {
  margin: 0 0 8px;
  color: var(--el-color-primary);
}
dl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  margin: 0;
}
dt,
dd {
  margin: 0;
  padding: 4px 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
dd {
  display: flex;
  align-items: center;
  gap: 4px;
}
dd .el-button {
  margin: 0;
}
.binding-controls {
  display: inline-flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.unbound {
  color: var(--el-text-color-placeholder);
}
kbd {
  font: inherit;
}
</style>
