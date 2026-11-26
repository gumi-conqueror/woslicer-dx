// Capture small UI text at common desktop scales. Each profile has its own
// browser, user data, loopback server and 30-second process deadline.
/* global document, devicePixelRatio, innerWidth, getComputedStyle */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const scaleArgument = process.argv[2];
if (!scaleArgument) {
  for (const scale of [1, 1.25, 1.5]) {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), String(scale)], {
      stdio: 'inherit',
      windowsHide: true,
      detached: process.platform !== 'win32',
    });
    const deadline = setTimeout(() => {
      if (!child.pid) return;
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
      } else {
        process.kill(-child.pid, 'SIGKILL');
      }
    }, 30_000);
    try {
      const status = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      });
      if (status !== 0) throw new Error(`Font checks failed at ${scale * 100}%`);
    } finally {
      clearTimeout(deadline);
    }
  }
  process.exit(0);
}
const scale = Number(scaleArgument);
assert.ok([1, 1.25, 1.5].includes(scale), 'Use scale 1, 1.25 or 1.5');
const output = resolve(`test-artifacts/fonts/${scale * 100}`);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const server = spawn(
  process.execPath,
  ['scripts/serve-static.mjs', 'dist/app', '--port', '4186', '--no-open'],
  {
    stdio: 'ignore',
    windowsHide: true,
  },
);
try {
  const context = await browser.newContext({
    locale: 'zh-CN',
    // Keep the physical window fixed while changing OS scale.
    viewport: { width: Math.round(1500 / scale), height: Math.round(960 / scale) },
    deviceScaleFactor: scale,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(async () => {
    assert.ok((await fetch('http://127.0.0.1:4186')).ok);
  }).toPass({ timeout: 5000, intervals: [100] });
  await page.goto('http://127.0.0.1:4186');
  await expect(page.getByRole('menubar')).toBeVisible();
  const session = await context.newCDPSession(page);
  await session.send('DOM.enable');
  await session.send('CSS.enable');
  const report = [];
  // The page starts in Chinese; every other language is chosen by its selector label.
  const { languages } = JSON.parse(readFileSync('src/i18n/languages.json', 'utf8'));
  const start = languages.find((entry) => entry.id === 'zh');
  for (const [id, label, language] of [start, ...languages.filter((entry) => entry !== start)].map(
    (entry) => [entry.id, entry === start ? null : entry.label, entry.docLang],
  )) {
    const messages = JSON.parse(readFileSync(`src/i18n/${id}.json`, 'utf8'));
    if (label) {
      await page.locator('.preferences-controls .el-select').click();
      await page.getByRole('option', { name: label, exact: true }).click();
    }
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(() => ({
      dpr: devicePixelRatio,
      width: innerWidth,
      overflow: document.documentElement.scrollWidth - innerWidth,
      chrome: [
        '.window-titlebar',
        '.application-menu',
        '.menu-trigger',
        '.preferences-controls .el-segmented',
      ].map((selector) => document.querySelector(selector).getBoundingClientRect().height),
      menu: [...document.querySelectorAll('.menu-trigger')].map((element) => ({
        size: getComputedStyle(element).fontSize,
        clipped:
          element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight,
      })),
      small: getComputedStyle(document.querySelector('.statusbar')).fontSize,
      canvases: [...document.querySelectorAll('canvas')]
        .filter((element) => element.clientWidth > 0)
        .map((element) => ({ css: element.getBoundingClientRect().width, pixels: element.width })),
    }));
    assert.ok(Math.abs(layout.dpr - scale) < 0.01);
    assert.ok(layout.overflow <= 1);
    if (report.length) assert.deepEqual(layout.chrome, report[0].layout.chrome);
    assert.ok(layout.menu.every((item) => !item.clipped));
    assert.ok(layout.canvases.every((item) => Math.abs(item.pixels - item.css * scale) < 2));
    for (const theme of ['light', 'dark']) {
      await page
        .getByText(messages.chrome[theme === 'light' ? 'themeLight' : 'themeDark'], { exact: true })
        .click();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.getAnimations().filter((animation) => animation.playState === 'running')
                .length,
          ),
        )
        .toBe(0);
      await page.screenshot({ path: resolve(output, `${id}-${theme}.png`) });
    }
    await page.locator('.menu-trigger').last().click();
    await page.locator('[data-command="help"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect
      .poll(() => dialog.evaluate((element) => getComputedStyle(element).opacity))
      .toBe('1');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: resolve(output, `${id}-help.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Inspect real rendered glyphs, not just CSS family declarations. Include
    // every translated character at 12px, so unopened dialogs are covered too.
    const text = [...new Set(JSON.stringify(messages) + '0123456789 − + → ← ↑ ↓ ±')].join('');
    const coverage = [];
    for (const weight of [400, 500, 600, 700]) {
      await page.evaluate(
        async ({ text, weight }) => {
          const sample = document.createElement('div');
          sample.id = 'font-coverage';
          sample.style.cssText = `position:absolute;top:0;left:0;font-size:12px;font-weight:${weight};overflow-wrap:anywhere`;
          sample.textContent = text;
          document.body.append(sample);
          await document.fonts.ready;
        },
        { text, weight },
      );
      const { root } = await session.send('DOM.getDocument');
      const { nodeId } = await session.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector: '#font-coverage',
      });
      const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
      coverage.push({ weight, fonts });
      await page.locator('#font-coverage').evaluate((element) => element.remove());
    }
    report.push({ language, layout, coverage });
    writeFileSync(resolve(output, 'report.json'), JSON.stringify({ report, errors }, null, 2));
    assert.ok(
      coverage.every(({ fonts }) => fonts.length && fonts.every((font) => font.isCustomFont)),
      `${language}: unexpected system font fallback`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(`Font checks passed: four languages, 12px, light/dark, ${scale * 100}%`);
} finally {
  await browser.close();
  server.kill();
}
