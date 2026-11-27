import { expect, test } from '@playwright/test';
import { wavFile } from '../support/audio';
import { collectErrors, pick } from './pages';

test('shares markers with a new track and lists the markers of all tracks', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  const tone = wavFile([new Int16Array(48000 * 4)]);
  await pick(page, 'Open', 'kick.wav', tone);
  await expect(page.locator('.timeline-viewport')).toHaveAttribute('aria-busy', 'false');
  const timeline = page.locator('.timeline-viewport');
  await timeline.focus();
  // Two grid steps right, then add a marker at tick 48.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('z');
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Track', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Add audio track…', exact: true }).click();
  await (
    await choosing
  ).setFiles({ name: 'snare.wav', mimeType: 'audio/wav', buffer: Buffer.from(tone) });
  await expect(page.locator('.track-name')).toHaveCount(2);
  await expect(page.getByRole('checkbox', { name: 'Shared markers' })).toBeChecked();
  await page.getByRole('button', { name: 'Markers', exact: true }).click();
  const list = page.getByTestId('marker-list');
  await expect(list.locator('.marker-row')).toHaveCount(1);
  await expect(list.getByRole('button', { name: '1: linked marker' })).toBeVisible();
  await expect(list.getByRole('button', { name: '2: linked marker' })).toBeVisible();
  // Track markers: a new marker stays on the current track.
  await page.locator('label').filter({ hasText: 'Shared markers' }).click();
  await expect(page.getByRole('checkbox', { name: 'Shared markers' })).not.toBeChecked();
  await timeline.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('z');
  await expect(list.locator('.marker-row')).toHaveCount(2);
  await expect(list.getByRole('button', { name: '1: no marker' })).toBeVisible();
  await expect(list.getByRole('button', { name: '2: marker' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('linked-markers.png') });
  expect(errors).toEqual([]);
});
