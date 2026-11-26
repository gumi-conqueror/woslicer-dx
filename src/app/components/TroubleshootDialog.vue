<script setup lang="ts">
import { ref } from 'vue';
import { errorMessage } from '../../core/messages';
import { ElButton, ElDialog } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { getPlatform } from '../../platform';
import type { BuildIdentity } from '../../platform/contracts';
import { appDataFolders, openDataFolder, type AppDataFolder } from '../../platform/app-data';
import { useInputState } from '../input-state';
import UninstallGuide from './UninstallGuide.vue';
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ identity: BuildIdentity | null }>();
const { t } = useI18n();
const platform = getPlatform();
const input = useInputState();
const folders = ref<AppDataFolder[]>([]);
const diagnostics = ref('');
const message = ref('');
async function run(action: () => Promise<void>): Promise<void> {
  message.value = '';
  try {
    await action();
  } catch (error: unknown) {
    message.value = errorMessage(error);
  }
}
async function refresh(): Promise<void> {
  diagnostics.value = JSON.stringify(
    {
      build: props.identity,
      platform: platform.kind,
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      input: input.device,
      gamepads: Array.from(navigator.getGamepads?.() ?? [])
        .filter((pad) => pad?.connected)
        .map((pad) => pad && { id: pad.id, mapping: pad.mapping }),
    },
    null,
    2,
  );
  folders.value = await appDataFolders();
}
async function copy(): Promise<void> {
  await platform.writeClipboard(diagnostics.value);
  message.value = t('support.copied');
}
</script>
<template>
  <ElDialog
    v-model="open"
    :title="t('menu.troubleshoot')"
    width="min(840px, 95vw)"
    append-to-body
    destroy-on-close
    @open="run(refresh)"
  >
    <div
      class="support-content"
      data-gamepad-scroll
    >
      <p>{{ t('support.intro') }}</p>
      <div class="support-actions">
        <ElButton @click="run(refresh)">{{ t('support.refresh') }}</ElButton
        ><ElButton @click="run(copy)">{{ t('support.copy') }}</ElButton>
      </div>
      <p role="status">{{ message }}</p>
      <pre tabindex="0">{{ diagnostics }}</pre>
      <template v-if="platform.kind === 'tauri'">
        <h3>{{ t('menu.openDataFolder') }}</h3>
        <div
          v-for="folder in folders"
          :key="folder.kind"
          class="data-folder"
        >
          <ElButton @click="run(() => openDataFolder(folder.kind))">{{
            t(`support.folder${folder.kind}`)
          }}</ElButton
          ><code>{{ folder.path }}</code>
        </div>
      </template>
      <h3>{{ t('support.audio') }}</h3>
      <p>{{ t('support.audioBody') }}</p>
      <h3>{{ t('input.gamepad') }}</h3>
      <p>{{ t('support.gamepadBody') }}</p>
      <h3>{{ t('support.recovery') }}</h3>
      <p>{{ t(platform.kind === 'tauri' ? 'support.recoveryDesktop' : 'support.recoveryWeb') }}</p>
      <UninstallGuide />
    </div>
  </ElDialog>
</template>
<style scoped>
.support-content {
  max-height: 65vh;
  overflow-y: auto;
  line-height: 1.65;
  padding-right: 12px;
}
.support-actions {
  display: flex;
  gap: 8px;
}
pre {
  padding: 12px;
  font-size: 11px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--el-fill-color-light);
}
.data-folder {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0;
}
code {
  overflow-wrap: anywhere;
}
h3 {
  margin: 18px 0 6px;
  color: var(--el-text-color-primary);
}
p {
  margin: 0 0 10px;
}
</style>
