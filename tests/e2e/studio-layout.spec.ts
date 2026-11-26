import { expect, test } from '@playwright/test';
import { expectViewportLayout } from './layout-assertions';
import { wavFile } from '../support/audio';

test('toggles ordered modules without losing drafts and integrates the track overview', async ({
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
  await page.getByRole('menuitem', { name: 'Open audio…', exact: true }).click();
  await (
    await choosing
  ).setFiles({
    name: 'Rhythm study.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from(wavFile([samples], 48000)),
  });
  await expect(page.locator('.track-name')).toContainText('Rhythm study');
  await expect(page.locator('.track-header .track-overview')).toBeVisible();
  const overview = page.locator('.track-overview');
  const scroll = page.locator('.timeline-scroll [role=slider]');
  const thumbnail = await overview.boundingBox();
  if (!thumbnail) throw new Error('Missing track overview');
  await overview.click({ position: { x: thumbnail.width * 0.5, y: 18 } });
  await expect
    .poll(async () => Number(await scroll.getAttribute('aria-valuenow')))
    .toBeGreaterThan(0);
  await page.mouse.move(thumbnail.x + thumbnail.width * 0.5, thumbnail.y + 18);
  await page.mouse.down();
  await page.mouse.move(thumbnail.x, thumbnail.y + 18);
  await page.mouse.up();
  await expect(scroll).toHaveAttribute('aria-valuenow', '0');
  await page.getByRole('button', { name: 'Close: Source', exact: true }).click();
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  const name = page.locator('.output-panel input').first();
  await name.fill('studio-cuts');
  await name.press('Tab');
  const before = await page.locator('.timeline-viewport').boundingBox();
  if (!before) throw new Error('Missing waveform viewport');
  await page.getByRole('button', { name: 'Close: Output', exact: true }).click();
  await expect(page.locator('.side-panel')).toHaveClass(/is-collapsed/);
  await expect(page.locator('.output-panel')).toBeHidden();
  await expect
    .poll(async () => (await page.locator('.timeline-viewport').boundingBox())?.width ?? 0)
    .toBeGreaterThan(before.width + 200);
  await page.getByRole('button', { name: 'Output', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.output-panel')).toBeVisible();
  await expect(name).toHaveValue('studio-cuts');
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  const order = () =>
    page
      .locator('.workspace-module:visible')
      .evaluateAll((elements) => elements.map((element) => element.id));
  await expect.poll(order).toEqual(['panel-output', 'panel-source']);
  const leftBefore = await page.locator('#panel-output').boundingBox();
  if (!leftBefore) throw new Error('Missing output module');
  // Closing the rightmost module lets the module on its left move to the rail.
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect.poll(order).toEqual(['panel-output']);
  await expect
    .poll(async () => (await page.locator('#panel-output').boundingBox())?.x ?? 0)
    .toBeGreaterThan(leftBefore.x + 200);
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect.poll(order).toEqual(['panel-output', 'panel-source']);
  const railWidth = await page
    .locator('.panel-switches')
    .evaluate((element) => element.clientWidth);
  await page.getByRole('button', { name: 'BMHelper', exact: true }).click();
  await expect.poll(order).toEqual(['panel-output', 'panel-source', 'panel-bmhelper']);
  await expect
    .poll(() =>
      overview.evaluate((element) =>
        Math.abs(element.clientWidth - (element.parentElement?.clientWidth ?? 0)),
      ),
    )
    .toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: 'BMHelper', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await page.locator('.panel-switches').evaluate((element) => element.clientWidth)).toBe(
    railWidth,
  );
  // A fourth module replaces the oldest one, and reopening becomes the newest.
  await page.getByRole('button', { name: 'Band detect', exact: true }).click();
  await expect.poll(order).toEqual(['panel-source', 'panel-bmhelper', 'panel-detect']);
  await expect(page.getByRole('button', { name: 'Output', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await expect.poll(order).toEqual(['panel-bmhelper', 'panel-detect', 'panel-output']);
  await expect(name).toHaveValue('studio-cuts');
  await expect(page.getByRole('button', { name: 'Source', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: 'Band detect', exact: true }).click();
  await expect.poll(order).toEqual(['panel-bmhelper', 'panel-output']);
  await page.getByRole('button', { name: 'BMHelper', exact: true }).click();
  await page.getByRole('button', { name: 'Output', exact: true }).click();
  await page.getByRole('button', { name: 'Source', exact: true }).click();
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
  await page.getByRole('button', { name: 'Markers', exact: true }).click();
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
  await expect(help).toContainText('Add marker without snapping');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await page.locator('.timeline-viewport').focus();
  await page.keyboard.press('F1');
  await expect(help).toBeVisible();
});
