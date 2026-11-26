import { expect, test } from '@playwright/test';
import { encodeWav16 } from '../../src/core/wav';
import { expectViewportLayout } from './layout-assertions';
import { readFile } from 'node:fs/promises';
import { decodeProject } from '../../src/project/codec';

test('records with keyboard, Xbox and YuanCon while preserving menus and playback state', async ({
  page,
}, testInfo) => {
  page.setDefaultTimeout(5000);
  // Substitute hardware APIs only. Input readers, command dispatch and Web Audio remain real.
  await page.addInitScript(() => {
    const pad = {
      index: 0,
      id: 'Xbox recording test',
      mapping: 'standard',
      connected: true,
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })),
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad] });
    window.addEventListener('recording-pad', (event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      if (!Array.isArray(detail) || !detail.every((value) => typeof value === 'number')) return;
      for (const [index, button] of pad.buttons.entries()) {
        button.pressed = index === detail[0] || detail.slice(3).includes(index);
        button.value = button.pressed ? 1 : 0;
      }
      pad.axes = [detail[1] ?? 0, detail[2] ?? 0];
    });
    class Controller extends EventTarget {
      vendorId = 0x1ccf;
      productId = 0x8048;
      collections = [{ usagePage: 1, usage: 4 }];
      opened = false;
      open() {
        this.opened = true;
        return Promise.resolve();
      }
      close() {
        this.opened = false;
        return Promise.resolve();
      }
    }
    const device = new Controller();
    const hid = new EventTarget();
    Object.defineProperty(hid, 'requestDevice', { value: () => Promise.resolve([device]) });
    Object.defineProperty(navigator, 'hid', { value: hid });
    window.addEventListener('recording-hid', (event) => {
      if (!(event instanceof CustomEvent) || !device.opened) return;
      const detail: unknown = event.detail;
      if (!Array.isArray(detail) || !detail.every((value) => typeof value === 'number')) return;
      const data = new DataView(new ArrayBuffer(15));
      data.setUint8(0, detail[0] ?? 0);
      data.setInt16(4, detail[1] ?? 0, true);
      const input = new Event('inputreport');
      Object.defineProperties(input, {
        device: { value: device },
        reportId: { value: 6 },
        data: { value: data },
      });
      device.dispatchEvent(input);
    });
    window.addEventListener('recording-disconnect', () => {
      const event = new Event('disconnect');
      Object.defineProperty(event, 'device', { value: device });
      device.opened = false;
      hid.dispatchEvent(event);
    });
  });
  const frames = () =>
    page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  const setPad = async (button = -1, x = 0, y = 0, chord: number[] = []) => {
    await page.evaluate(
      (detail) => window.dispatchEvent(new CustomEvent('recording-pad', { detail })),
      [button, x, y, ...chord],
    );
    await frames();
  };
  const press = async (button: number) => {
    await setPad(button);
    await setPad();
  };
  const hid = async (keys = 0, direction = 0) =>
    page.evaluate(
      (detail) => window.dispatchEvent(new CustomEvent('recording-hid', { detail })),
      [keys, direction],
    );
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Alt+p');
  await page.keyboard.press('a');
  const samples = new Int16Array(48000 * 30);
  await (
    await chooser
  ).setFiles({
    name: 'recording.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from(encodeWav16([samples], 48000, samples.length)),
  });
  const toggle = page.getByRole('button', { name: 'Record', exact: true });
  await expect(toggle).toBeEnabled();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const play = page.getByRole('button', { name: 'Play', exact: true });
  const markers = page.locator('.statusbar > span').nth(2);
  const cursor = page.locator('.statusbar > span').nth(1);
  let count = 0;
  for (const key of 'zsxdcfv') {
    await page.keyboard.press('t');
    await page.keyboard.press(key);
    await expect(markers).toHaveText(`Markers: ${++count}`);
    await page.keyboard.press(key);
    await expect(markers).toHaveText(`Markers: ${count}`);
  }
  await page.keyboard.press('Space');
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('q');
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  // Move past the keyboard markers so every controller tap has a fresh position.
  const speed = page.locator('.rate-select');
  const initialSpeed = await speed.textContent();
  await page.keyboard.press('a');
  await expect(speed).not.toHaveText(initialSpeed ?? '');
  await page.keyboard.press('g');
  await expect(speed).toHaveText(initialSpeed ?? '');
  await press(4);
  await expect(speed).not.toHaveText(initialSpeed ?? '');
  await press(5);
  await expect(speed).toHaveText(initialSpeed ?? '');
  await page.keyboard.press('t');
  await page.keyboard.press('t');
  for (const button of [0, 1, 2, 3, 12, 14, 15]) {
    await page.keyboard.press('t');
    await press(button);
    await expect(markers).toHaveText(`Markers: ${++count}`);
  }
  await press(13);
  await expect(markers).toHaveText(`Markers: ${count}`);
  await page.keyboard.press('t');
  const beforeRotation = await cursor.textContent();
  await setPad(-1, 1, 0);
  await expect(markers).toHaveText(`Markers: ${count}`);
  await setPad(-1, 0, 1);
  await expect(cursor).not.toHaveText(beforeRotation ?? '');
  await setPad(-1, 1, 0);
  await expect(cursor).toHaveText(beforeRotation ?? '');
  await setPad();
  await setPad(7);
  await page.waitForTimeout(430);
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await setPad();
  await press(7);
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('t');
  await page.keyboard.down('z');
  await page.keyboard.down('x');
  await page.keyboard.down('c');
  await page.keyboard.up('z');
  await page.keyboard.up('x');
  await page.keyboard.up('c');
  await expect(markers).toHaveText(`Markers: ${++count}`);
  await page.keyboard.press('t');
  await setPad(2, 0, 0, [0, 3, 1]);
  await setPad();
  await expect(markers).toHaveText(`Markers: ${++count}`);
  await press(9);
  await expect(page.getByRole('menu', { name: 'Project', exact: true })).toBeVisible();
  await press(9);
  await page.keyboard.press('Alt+t');
  await page.keyboard.press('y');
  const controller = page.getByRole('dialog', { name: 'YuanCon controller', exact: true });
  await controller.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(controller.getByRole('status')).toHaveText('Connected');
  await controller.screenshot({ path: testInfo.outputPath('yuancon-controller.png') });
  await controller.getByText('Reverse turntable direction', { exact: true }).click();
  await hid(0, 32767);
  await expect(controller.locator('.controller-preview span')).toHaveText('Reverse');
  await controller.getByText('Reverse turntable direction', { exact: true }).click();
  await hid();
  await hid(1);
  await expect(markers).toHaveText(`Markers: ${count}`);
  await hid();
  await page.keyboard.press('Escape');
  await page.locator('.track-number').click();
  await hid();
  for (let bit = 0; bit < 7; bit++) {
    await page.keyboard.press('t');
    // A complete press/release within one task must survive render-frame polling.
    await page.evaluate((keys) => {
      window.dispatchEvent(new CustomEvent('recording-hid', { detail: [keys, 0] }));
      window.dispatchEvent(new CustomEvent('recording-hid', { detail: [0, 0] }));
    }, 1 << bit);
    await expect(markers).toHaveText(`Markers: ${++count}`);
  }
  await page.keyboard.press('t');
  await hid(0x55);
  await hid(0x55);
  await hid();
  await expect(markers).toHaveText(`Markers: ${++count}`);
  await page
    .locator('.timeline')
    .screenshot({ path: testInfo.outputPath('recorded-key-markers.png') });
  await expect(page.locator('.input-device')).toHaveAttribute('data-device', 'yuancon');
  await hid(0, 32767);
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await hid(0, 32767);
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await hid();
  await hid(0, 32767);
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  const beforeRewind = await cursor.textContent();
  await hid(0, -32767);
  await expect(cursor).not.toHaveText(beforeRewind ?? '');
  await page.evaluate(() => window.dispatchEvent(new Event('recording-disconnect')));
  const stopped = await cursor.textContent();
  await page.waitForTimeout(180);
  await expect(cursor).toHaveText(stopped ?? '');
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() =>
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }),
  );
  page.once('dialog', (dialog) => {
    void dialog.accept();
  });
  const downloading = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const downloadPath = await (await downloading).path();
  if (!downloadPath) throw new Error('Expected saved project');
  const saved = decodeProject(new Uint8Array(await readFile(downloadPath)));
  if (saved.kind !== 'supported') throw new Error('Expected supported project');
  expect(saved.project.slicing.markerKeys?.slice(0, 7).map((entry) => entry.keys)).toEqual([
    [1],
    [2],
    [3],
    [4],
    [5],
    [6],
    [7],
  ]);
  expect(saved.project.slicing.markerKeys?.map((entry) => entry.keys)).toEqual(
    expect.arrayContaining([
      [1, 3, 5],
      [4, 5, 6, 7],
      [1, 3, 5, 7],
    ]),
  );
  expect(saved.project.slicing.markerKeys).toHaveLength(count);
  await page.keyboard.press('F1');
  const guide = page.getByRole('dialog', { name: 'User guide and shortcuts', exact: true });
  await guide.getByRole('button', { name: 'Xbox controller', exact: true }).click();
  await expect(guide.locator('.recording-keys .down')).toHaveCount(0);
  await expect(guide.locator('.recording-keys .key-binding')).toHaveCount(7);
  await guide
    .locator('.recording-guide')
    .screenshot({ path: testInfo.outputPath('xbox-recording-guide.png') });
  await guide.getByRole('button', { name: 'YuanCon', exact: true }).click();
  await expect(guide.locator('.yuancon-icon')).toHaveCount(3);
  await guide
    .locator('.recording-guide')
    .screenshot({ path: testInfo.outputPath('yuancon-guide.png') });
  await expect(guide.getByRole('button', { name: 'YuanCon', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expectViewportLayout(page);
});
