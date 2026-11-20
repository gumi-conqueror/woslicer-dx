import { expect, test } from '@playwright/test';
import { expectViewportLayout } from './layout-assertions';
import { encodeWav16 } from '../../src/core/wav';

test('collapses the inspector without losing its draft and expands the waveform', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.window-titlebar')).toBeVisible();
  await expect(page.locator('.window-controls')).toHaveCount(0);
  const samples = Int16Array.from({ length: 48000 * 8 }, (_, index) =>
    Math.round(Math.sin(index / 31) * Math.exp(-(index % 18000) / 5500) * 26000),
  );
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Project', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Open WAV/OGG...', exact: true }).click();
  await (
    await choosing
  ).setFiles({
    name: 'Rhythm study.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from(encodeWav16([samples], 48000, samples.length)),
  });
  await expect(page.locator('.track-name')).toContainText('Rhythm study');
  await page.getByRole('tab', { name: 'Output', exact: true }).click();
  const name = page.locator('.output-panel input').first();
  await name.fill('studio-cuts');
  await name.press('Tab');
  const before = await page.locator('.timeline-viewport').boundingBox();
  if (!before) throw new Error('Missing waveform viewport');
  await page.getByRole('button', { name: 'Collapse side panel' }).click();
  await expect(page.locator('.side-panel')).toHaveClass(/is-collapsed/);
  await expect(page.locator('.output-panel')).toBeHidden();
  await expect
    .poll(async () => (await page.locator('.timeline-viewport').boundingBox())?.width ?? 0)
    .toBeGreaterThan(before.width + 200);
  await page.getByRole('tab', { name: 'Output', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.output-panel')).toBeVisible();
  await expect(name).toHaveValue('studio-cuts');
  await expectViewportLayout(page);
  await page.getByText('Dark', { exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.getAnimations().filter((animation) => animation.playState === 'running').length,
      ),
    )
    .toBe(0);
  await expectViewportLayout(page);
  await page.screenshot({ path: test.info().outputPath('studio-dark.png') });
  await page.locator('.timeline-viewport').focus();
  await page.evaluate(() => {
    for (let index = 0; index < 80; index++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', cancelable: true }));
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, cancelable: true }),
      );
    }
  });
  await page.getByRole('tab', { name: 'Cuts', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 600 });
  const shortHeight = await page
    .locator('.marker-viewport')
    .evaluate((element) => element.clientHeight);
  await page.setViewportSize({ width: 1280, height: 1100 });
  await expect
    .poll(() => page.locator('.marker-viewport').evaluate((element) => element.clientHeight))
    .toBeGreaterThan(shortHeight + 400);
  await expect.poll(() => page.locator('.marker-row').count()).toBeGreaterThan(22);
  const rows = await page.locator('.marker-row').evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, width: rect.width };
    }),
  );
  expect(new Set(rows.map((row) => row.left)).size).toBe(1);
  expect(new Set(rows.map((row) => row.width)).size).toBe(1);
  await expectViewportLayout(page);
  await page.screenshot({ path: test.info().outputPath('cuts-adaptive.png') });
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('menuitem', { name: 'User guide and shortcuts', exact: true }).click();
  const help = page.getByRole('dialog');
  await expect(help).toContainText('Ctrl/Cmd+S');
  await expect(help).toContainText('Add cut without snapping');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await page.locator('.timeline-viewport').focus();
  await page.keyboard.press('F1');
  await expect(help).toBeVisible();
});
