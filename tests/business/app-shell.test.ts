import { expect, it, vi } from 'vitest';
import { createTestApp as setup } from '../support/app';

it('ignores keyboard commands while a modal dialog is open', () => {
  const f = setup();
  const { commands } = f;
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  document.body.appendChild(overlay);
  const rects = vi
    .spyOn(HTMLElement.prototype, 'getClientRects')
    .mockReturnValue([new DOMRect(0, 0, 320, 200)]);
  try {
    const event = new KeyboardEvent('keydown', { key: 'z', cancelable: true });
    commands.onKeyDown(event);
    expect(event.defaultPrevented).toBe(false);
    expect(f.editor.ticks).toEqual([]);
  } finally {
    rects.mockRestore();
    overlay.remove();
  }
});
