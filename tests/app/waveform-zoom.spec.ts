import { expect, test, type Page } from '@playwright/test';
import { encodeWav16 } from '../../src/core/wav';

async function zoom(page: Page, deltaY: number, count: number): Promise<void> {
  await page.locator('.timeline-ruler').evaluate(
    async (element, steps) => {
      const rect = element.getBoundingClientRect();
      for (let i = 0; i < steps.count; i++)
        element.dispatchEvent(
          new WheelEvent('wheel', {
            clientX: rect.left,
            deltaY: steps.deltaY,
            bubbles: true,
            cancelable: true,
          }),
        );
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    },
    { deltaY, count },
  );
}

async function envelope(page: Page) {
  return page
    .locator('canvas.timeline-canvas')
    .first()
    .evaluate((canvas) => {
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing waveform canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Missing waveform context');
      const { width, height } = canvas;
      const pixels = context.getImageData(0, 0, width, height).data;
      const columns: { top: number; bottom: number }[] = [];
      let gaps = 0;
      // Exclude the cursor at the left edge and the final canvas edge.
      for (let x = 4; x < width - 2; x++) {
        let top = height,
          bottom = -1;
        for (let y = 0; y < height; y++) {
          const i = (y * width + x) * 4;
          if (pixels[i + 1] - pixels[i] > 15 && pixels[i + 2] - pixels[i] > 15) {
            top = Math.min(top, y);
            bottom = y;
          }
        }
        const previous = columns.at(-1);
        if (bottom < 0 || (previous && (top > previous.bottom + 1 || bottom < previous.top - 1)))
          gaps++;
        columns.push({ top, bottom });
      }
      return { gaps, columns };
    });
}

test('keeps sine waves connected through 24 zoom-out levels from maximum', async ({
  browser,
}, info) => {
  const pcm = Int16Array.from({ length: 48000 }, (_, i) =>
    Math.round(Math.sin((i * 2 * Math.PI) / 96) * 24576),
  );
  const bytes = Buffer.from(encodeWav16([pcm], 48000, pcm.length));
  for (const dpr of info.project.name === 'low' ? [1, 1.25] : [2, 1.5]) {
    const context = await browser.newContext({
      viewport: { width: 1000, height: 640 },
      deviceScaleFactor: dpr,
      locale: 'en-US',
    });
    try {
      const page = await context.newPage();
      await page.addInitScript(() => localStorage.setItem('woslicer.theme', 'dark'));
      await page.goto('http://127.0.0.1:4184/');
      const choosing = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: 'Open', exact: true }).click();
      await (await choosing).setFiles({ name: 'sine.wav', mimeType: 'audio/wav', buffer: bytes });
      await expect(page.locator('.status-message')).toContainText('Ready: sine');
      await page.getByRole('tab', { name: 'Band detect', exact: true }).click();
      const rmsLabel = page.getByText('RMS band (mean level inside the peaks)', { exact: true });
      await expect(
        page.getByRole('checkbox', { name: 'RMS band (mean level inside the peaks)', exact: true }),
      ).not.toBeChecked();
      await zoom(page, -1, 100);
      for (let level = 0; level <= 24; level++) {
        if (level) await zoom(page, 1, 1);
        const outline = await envelope(page);
        expect(outline.gaps, `DPR ${dpr}, level ${level}`).toBe(0);
        if ([8, 9, 10, 11, 16, 24].includes(level)) {
          await rmsLabel.click();
          // Wait for the canvas to paint the changed overlay setting.
          await zoom(page, 1, 0);
          expect(
            (await envelope(page)).columns,
            `RMS bounds at DPR ${dpr}, level ${level}`,
          ).toEqual(outline.columns);
          if (level === 10)
            await page
              .locator('canvas.timeline-canvas')
              .first()
              .screenshot({ path: info.outputPath(`zoom-10-dpr-${dpr}.png`) });
          await rmsLabel.click();
          await zoom(page, 1, 0);
        }
      }
    } finally {
      await context.close();
    }
  }
});
