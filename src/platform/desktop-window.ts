import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/** The desktop frame controls only the current editor window. */
export function getDesktopWindow() {
  if (!isTauri()) return null;
  const window = getCurrentWindow();
  return {
    minimize: () => window.minimize(),
    toggleMaximize: () => window.toggleMaximize(),
    isMaximized: () => window.isMaximized(),
    startDragging: () => window.startDragging(),
    close: () => window.close(),
    destroy: () => window.destroy(),
    onResized: (handler: () => void) => window.onResized(handler),
    onCloseRequested: (handler: () => void) =>
      window.onCloseRequested((event) => {
        event.preventDefault();
        handler();
      }),
  };
}
