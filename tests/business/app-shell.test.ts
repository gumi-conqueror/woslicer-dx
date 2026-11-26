import { expect, it, vi } from 'vitest';
import { createTestApp as setup } from '../support/app';
import { handleKeyDown } from '../../src/input/keyboard';

it('ignores keyboard commands while a modal dialog is open', () => {
  const f = setup();
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  document.body.appendChild(overlay);
  const rects = vi
    .spyOn(HTMLElement.prototype, 'getClientRects')
    .mockReturnValue([new DOMRect(0, 0, 320, 200)]);
  try {
    const event = new KeyboardEvent('keydown', { key: 'z', cancelable: true });
    handleKeyDown(event, 'edit', f.commands);
    expect(event.defaultPrevented).toBe(false);
    expect(f.editor.ticks).toEqual([]);
  } finally {
    rects.mockRestore();
    overlay.remove();
  }
});
