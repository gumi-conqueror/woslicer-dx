/**
 * Where application input goes. Keyboard, gamepad and YuanCon input all ask
 * this module, so a new dialog or editable control changes one place.
 */

/** Focus inside these controls belongs to the control, for every input device. */
const EDITABLE = 'input,textarea,select,[contenteditable="true"],[role="listbox"],[role="slider"]';
/** Keyboard keys that a focused tab list or button handles itself. */
const KEYBOARD_OWNED = '[role="tablist"]';

/** The topmost visible dialog, including Element Plus dialogs the app does not own. */
export function visibleDialog(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))
    .reverse()
    .find((dialog) => dialog.getClientRects().length > 0);
}

/** Focus is in a control that edits text or a value. */
export function editingControl(element: Element | null | undefined): boolean {
  return !!element?.closest(EDITABLE);
}

/** The focused control handles this key itself: a tab list, or Space and Enter on a button. */
export function keyOwnedByControl(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof Element)) return false;
  return (
    !!target.closest(`${EDITABLE},${KEYBOARD_OWNED},[role="dialog"]`) ||
    ((key === ' ' || key === 'Enter') && !!target.closest('button,[role="button"]'))
  );
}
