<script setup lang="ts">
import { ElButton, ElDropdown, ElDropdownItem, ElDropdownMenu } from 'element-plus';
import { useI18n } from 'vue-i18n';
import { useEditorStore } from '../../slicing/editor-store';
import { APPLICATION_MENU, isMenuCommand, menuCommandEnabled, type MenuCommand } from '../menu';
import { shortcutLabel } from '../shortcuts';

const emit = defineEmits<{ command: [command: MenuCommand] }>();
const { t } = useI18n();
const editor = useEditorStore();
function dispatch(value: unknown): void {
  if (isMenuCommand(value)) emit('command', value);
}
</script>
<template>
  <!-- menu bar: one dropdown trigger per command group -->
  <nav
    class="application-menu"
    :aria-label="t('menu.application')"
    role="menubar"
  >
    <ElDropdown
      v-for="group in APPLICATION_MENU"
      :key="group.label"
      trigger="click"
      :show-timeout="0"
      :hide-timeout="100"
      @command="dispatch"
    >
      <ElButton
        text
        role="menuitem"
        >{{ t(group.label) }}</ElButton
      >
      <template #dropdown>
        <ElDropdownMenu>
          <ElDropdownItem
            v-for="item in group.commands"
            :key="item.id"
            :command="item.id"
            :aria-label="t(item.key)"
            :disabled="!menuCommandEnabled(item.id, editor)"
            ><span class="menu-command"
              ><span>{{ t(item.key) }}</span><kbd>{{ shortcutLabel(item.id) }}</kbd></span
            ></ElDropdownItem
          >
        </ElDropdownMenu>
      </template>
    </ElDropdown>
  </nav>
</template>
<style scoped>
/* Menu bar strip: dropdown triggers laid out horizontally. */
.application-menu {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  min-height: 32px;
}

/* Element Plus button override: remove default margin/padding inside the bar. */
.application-menu :deep(.el-button) {
  margin: 0;
  padding: 5px 8px;
  color: var(--el-text-color-regular);
}

.menu-command {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 24px;
  width: 100%;
}
kbd {
  color: var(--el-text-color-secondary);
  font: inherit;
  font-size: 11px;
}
</style>
