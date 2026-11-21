import { expect, test } from '@playwright/test';
import { expectViewportLayout } from './layout-assertions';

// Reproduce switching a Chinese installation to Japanese without OS font assumptions.
test.use({ locale: 'zh-CN' });

test('uses local regional fonts after language changes and leaves inputs unrestricted', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  let chromeHeights: number[] | undefined;
  for (const { label, language, family } of [
    { label: null, language: 'zh-CN', family: 'WOS UI zh' },
    { label: '日本語', language: 'ja', family: 'WOS UI ja' },
    { label: '한국어', language: 'ko', family: 'WOS UI ko' },
    { label: 'EN', language: 'en', family: 'WOS UI en' },
  ]) {
    if (label) {
      await page.locator('.preferences-controls .el-select').click();
      await page.getByRole('option', { name: label, exact: true }).click();
    }
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    const menu = page.locator('.menu-trigger').first();
    const text = await menu.innerText();
    expect(
      await page.evaluate(
        async ({ family, text }) => {
          const faces = await document.fonts.load(`500 13px "${family}"`, text);
          await document.fonts.ready;
          return faces.length > 0 && faces.every((face) => face.status === 'loaded');
        },
        { family, text },
      ),
    ).toBe(true);
    expect(await menu.evaluate((element) => getComputedStyle(element).fontFamily)).toMatch(
      new RegExp(`^"${family}"`),
    );
    const heights = await page.evaluate(() =>
      [
        '.window-titlebar',
        '.application-menu',
        '.menu-trigger',
        '.preferences-controls .el-segmented',
      ].map((selector) => document.querySelector(selector)?.getBoundingClientRect().height ?? 0),
    );
    expect(heights.every((height) => height > 0)).toBe(true);
    if (chromeHeights) expect(heights).toEqual(chromeHeights);
    else chromeHeights = heights;
    await expect(page.locator('.el-input__inner').first()).toHaveCSS('font-family', 'sans-serif');
    await expectViewportLayout(page);
    if (language === 'ja' || language === 'ko') {
      await page.screenshot({ path: test.info().outputPath(`${language}-ui.png`) });
    }
  }
  const fonts = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((resource) => resource.name.endsWith('.woff2'))
      .map((resource) => resource.name),
  );
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(errors).toEqual([]);
});
