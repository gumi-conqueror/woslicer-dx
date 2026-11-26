import { expect, test } from '@playwright/test';
import { expectViewportLayout } from './layout-assertions';
import { wavFile } from '../support/audio';

test('navigates menus during audio loading and keeps the help input view manual', async ({
  page,
}) => {
  // Only the physical Gamepad API is substituted. Production polling, focus,
  // dispatch, menu rendering and dialog navigation all run unchanged.
  await page.addInitScript(() => {
    const pad = {
      index: 0,
      connected: true,
      mapping: 'standard',
      id: 'Xbox test controller',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })),
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
    window.addEventListener('test-gamepad', (event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== 'number') return;
      for (const [index, button] of pad.buttons.entries()) {
        button.pressed = index === event.detail;
        button.value = button.pressed ? 1 : 0;
      }
    });
  });
  await page.goto('/');
  await page.locator('.track-number').click();
  const press = async (button: number) => {
    await page.evaluate(
      (button) => window.dispatchEvent(new CustomEvent('test-gamepad', { detail: button })),
      button,
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('test-gamepad', { detail: -1 })),
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  };
  // Hold the real decoder's script request so all navigation below happens
  // during loading, independent of machine speed or audio file size.
  let resumeDecoding = () => {};
  const decoderReady = new Promise<void>((resolve) => {
    resumeDecoding = resolve;
  });
  await page.route(/\/audio\.worker-[^/]+\.js$/, async (route) => {
    await decoderReady;
    await route.continue();
  });
  const choosing = page.waitForEvent('filechooser');
  await page.keyboard.press('Alt+p');
  await expect(page.getByRole('menu', { name: 'Project', exact: true })).toBeVisible();
  await page.keyboard.press('a');
  const samples = new Int16Array(48000 * 8);
  await (
    await choosing
  ).setFiles({
    name: 'controller.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from(wavFile([samples], 48000)),
  });
  await expect(page.locator('.track-loading')).toBeVisible();
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Help', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'BMHelper', exact: true }).click();
  await expect(page.locator('#panel-bmhelper')).toBeVisible();
  const bpm = page.getByRole('spinbutton', { name: 'BPM', exact: true });
  await bpm.fill('175');
  await bpm.press('Tab');
  await page.locator('.track-number').click();
  await page.keyboard.press('Alt');
  await expect(page.getByRole('button', { name: 'Project', exact: true })).toBeFocused();
  await page.keyboard.press('h');
  await expect(
    page.getByRole('menuitem', { name: 'User guide and shortcuts', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('g');
  const guide = page.getByRole('dialog', { name: 'User guide and shortcuts', exact: true });
  await expect(guide).toBeVisible();
  const keyboard = guide.getByRole('button', { name: 'Keyboard / mouse', exact: true });
  const controller = guide.getByRole('button', { name: 'Xbox controller', exact: true });
  await expect(keyboard).toHaveAttribute('aria-pressed', 'true');
  await keyboard.focus();
  await press(15);
  await expect(controller).toBeFocused();
  // Controller activity changes the status, not the selected guide.
  await expect(page.locator('.input-device')).toHaveAttribute('data-device', 'gamepad');
  await expect(keyboard).toHaveAttribute('aria-pressed', 'true');
  await press(0);
  await expect(controller).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.input-device')).toHaveAttribute('data-device', 'keyboard');
  await expect(controller).toHaveAttribute('aria-pressed', 'true');
  await expect(guide.locator('.gamepad-icon').first()).toBeVisible();
  const scroll = guide.locator('[data-gamepad-scroll]');
  await press(7);
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await press(1);
  await expect(guide).toBeHidden();
  await press(9);
  await expect(page.getByRole('menu', { name: 'Project', exact: true })).toBeVisible();
  await press(15);
  await press(15);
  const view = page.getByRole('menu', { name: 'View', exact: true });
  await expect(view).toBeVisible();
  await expect(view.getByRole('img', { name: 'RT', exact: true })).toBeVisible();
  // Unmapped editor buttons cannot leak through menu mode.
  await press(2);
  await expect(view).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+h');
  await expect(page.getByRole('menu', { name: 'Help', exact: true })).toBeVisible();
  await page.keyboard.press('t');
  const support = page.getByRole('dialog', { name: 'Troubleshoot', exact: true });
  await expect(support).toBeVisible();
  await expect(support).toContainText('local storage');
  await expect(support.locator('pre')).toContainText('Xbox test controller');
  await expect(support.getByRole('button', { name: 'Recovery data', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(support).toBeHidden();
  await page.keyboard.press('Alt+h');
  await expect(page.getByRole('menu', { name: 'Help', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Open data folder', exact: true })).toHaveCount(
    0,
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expectViewportLayout(page);
  await expect(page.locator('.timeline-viewport')).toHaveAttribute('aria-busy', 'true');
  resumeDecoding();
  await expect(page.locator('.track-name')).toContainText('controller');
  await expect(page.locator('.timeline-viewport')).toHaveAttribute('aria-busy', 'false');
  await expect(bpm).toHaveValue('175');
  await press(15);
  await expect(page.locator('.statusbar')).toContainText('tick 24');
  await press(2);
  await expect(page.locator('.statusbar')).toContainText('Markers: 1');
  await press(3);
  await expect(page.locator('.statusbar')).toContainText('Markers: 0');
  await press(4);
  await expect(page.locator('.statusbar')).toContainText('Markers: 1');
  await press(5);
  await expect(page.locator('.statusbar')).toContainText('Markers: 0');
  await press(0);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await press(0);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
