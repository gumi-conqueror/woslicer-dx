import type { Page } from '@playwright/test';

/** Collects uncaught page errors and console errors for a final `toEqual([])`. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

/**
 * Answers a file chooser. `Open` and `Open .wosdx…` go through the Project
 * menu; any other label is a visible button.
 */
export async function pick(
  page: Page,
  label: string,
  name: string,
  bytes: Uint8Array,
): Promise<void> {
  const choosing = page.waitForEvent('filechooser');
  if (label === 'Open' || label === 'Open .wosdx…') {
    await page.getByRole('button', { name: 'Project', exact: true }).click();
    await page
      .getByRole('menuitem', { name: label === 'Open' ? 'Open audio…' : label, exact: true })
      .click();
  } else {
    await page.getByRole('button', { name: label, exact: true }).click();
  }
  await (
    await choosing
  ).setFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
}
