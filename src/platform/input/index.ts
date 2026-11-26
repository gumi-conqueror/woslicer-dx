import { isTauri } from '@tauri-apps/api/core';
import { createNativeHid } from './native-hid';
import { createWebHid } from './web-hid';

export function createYuanconBackend() {
  return isTauri() ? createNativeHid() : createWebHid();
}
