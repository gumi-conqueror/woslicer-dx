import { isTauri } from '@tauri-apps/api/core';
import type { HidFilter } from './contracts';
import { createNativeHid } from './native-hid';
import { createWebHid } from './web-hid';

/**
 * The HID connection to a YuanCon controller. The browser asks its device
 * chooser for `filter`. The desktop host lists the supported controllers
 * itself, from the device table in the Rust source.
 */
export function createYuanconBackend(filter: HidFilter) {
  return isTauri() ? createNativeHid() : createWebHid(filter);
}
