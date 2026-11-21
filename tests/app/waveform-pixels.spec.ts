import { expect, test } from '@playwright/test';
import { encodeWav16 } from '../../src/core/wav';

test('keeps a constant waveform one device pixel thick across zoom and fractional DPR', async ({
  browser,
}, info) => {
  const scales = info.project.name === 'low' ? [1, 1.25] : [2, 1.5];
  const pcm = new Int16Array(48000).fill(8192);
  const wav = encodeWav16([pcm], 48000, pcm.length);
  // Each scale owns an isolated context; their frame waits can run together.
  await Promise.all(
    scales.map(async (dpr) => {
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
        await page.getByRole('button', { name: 'Project', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Open WAV/OGG…', exact: true }).click();
        await (
          await choosing
        ).setFiles({ name: 'constant.wav', mimeType: 'audio/wav', buffer: Buffer.from(wav) });
        await expect(page.locator('.status-message')).toContainText('Ready: constant');
        await page.getByRole('button', { name: 'Band detect', exact: true }).click();
        await page
          .getByRole('checkbox', { name: 'RMS band (mean level inside the peaks)', exact: true })
          .uncheck();
        for (const zoomSteps of [0, 11, 12, 8]) {
          await page.locator('.timeline-ruler').evaluate(async (element, steps) => {
            const rect = element.getBoundingClientRect();
            for (let i = 0; i < steps; i++)
              element.dispatchEvent(
                new WheelEvent('wheel', {
                  clientX: rect.left,
                  deltaY: -1,
                  bubbles: true,
                  cancelable: true,
                }),
              );
            await new Promise(requestAnimationFrame);
            await new Promise(requestAnimationFrame);
          }, zoomSteps);
          const columns = await page
            .locator('canvas.timeline-canvas')
            .first()
            .evaluate((canvas) => {
              if (!(canvas instanceof HTMLCanvasElement))
                throw new Error('Missing waveform canvas');
              const drawing = canvas.getContext('2d');
              if (!drawing) throw new Error('Missing waveform context');
              return [50, 75, 100].map((x) => {
                const data = drawing.getImageData(x, 0, 1, canvas.height).data;
                let exact = 0,
                  tinted = 0;
                const pixels: number[][] = [];
                for (let i = 0; i < data.length; i += 4) {
                  // GPU rasterizers can round an RGB component by one unit.
                  if (
                    Math.abs(data[i] - 95) <= 1 &&
                    Math.abs(data[i + 1] - 167) <= 1 &&
                    Math.abs(data[i + 2] - 157) <= 1
                  )
                    exact++;
                  if (data[i + 1] - data[i] > 15 && data[i + 2] - data[i] > 15) {
                    tinted++;
                    pixels.push(Array.from(data.slice(i, i + 4)));
                  }
                }
                return { exact, tinted, pixels };
              });
            });
          expect(
            columns.map(({ exact, tinted }) => ({ exact, tinted })),
            `DPR ${dpr}, zoom steps ${zoomSteps}: ${JSON.stringify(columns)}`,
          ).toEqual(Array.from({ length: 3 }, () => ({ exact: 1, tinted: 1 })));
        }
        await page.screenshot({ path: info.outputPath(`waveform-dpr-${dpr}.png`) });
      } finally {
        await context.close();
      }
    }),
  );
});
