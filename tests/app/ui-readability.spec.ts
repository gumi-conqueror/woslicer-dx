// Capture layout and interaction baselines across browser profiles.
// Each test records one visual scenario of the CURRENT implementation so later
// refactoring cards can be compared against these artifacts. Assertions only
// pin existing behavior needed for a stable capture; they add no new contracts.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { wavFile } from '../support/audio';
import { writeSmfSequence } from '../../src/core/formats/smf';

const TABS: ReadonlyArray<{ name: string; label: string; ready: string }> = [
  { name: 'source', label: 'Source', ready: '.source-info' },
  { name: 'cuts', label: 'Markers', ready: '.marker-list' },
  { name: 'detect', label: 'Band detect', ready: '.detection-panel' },
  { name: 'output', label: 'Output', ready: '.output-panel' },
  { name: 'bmhelper', label: 'BMHelper', ready: '.bmhelper' },
];

function artifactPath(project: string, name: string): string {
  return path.resolve('test-artifacts', 'ui-baseline', project, name);
}

// These capture-only tests run through scripts/verify-ui-readability.mjs, one
// scenario per invocation; they stay out of the default dual-profile workflow
// so that command keeps its 30-seconds-per-profile budget.
test.skip(
  process.env.WOSLICER_UI_BASELINE !== '1',
  'baseline capture runs via scripts/verify-ui-readability.mjs',
);

async function pick(page: Page, label: string, name: string, bytes: Uint8Array): Promise<void> {
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

async function openAudio(page: Page): Promise<void> {
  const pcm = Int16Array.from({ length: 48000 }, (_, i) => Math.round(Math.sin(i / 12) * 16000));
  await pick(page, 'Open', 'tone.wav', wavFile([pcm], 48000));
  await expect(page.locator('.status-message')).toContainText('Ready: tone');
}

function guardErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function saveShot(page: Page, project: string, name: string): Promise<void> {
  await mkdir(path.dirname(artifactPath(project, name)), { recursive: true });
  await page.screenshot({ path: artifactPath(project, name) });
}

// toBeVisible passes while the ElDialog enter transition is still at opacity 0,
// so wait for the computed style instead of taking a mid-animation capture.
async function awaitDialogPainted(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () => dialog.evaluate((element) => getComputedStyle(element).opacity))
    .toBe('1');
}

// Narrow-window captures need the same computed-style facts as the main
// window plus flex direction, so the media-query layout is comparable.
async function writeLayoutStyles(page: Page, project: string, name: string): Promise<void> {
  const styles = await page.evaluate(() => {
    const pick = (selector: string): Record<string, unknown> | null => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const css = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        display: css.display,
        gridTemplateColumns: css.gridTemplateColumns,
        flexDirection: css.flexDirection,
        minHeight: css.minHeight,
        height: css.height,
        borderTopWidth: css.borderTopWidth,
        borderRightWidth: css.borderRightWidth,
        borderBottomWidth: css.borderBottomWidth,
        borderLeftWidth: css.borderLeftWidth,
        overflow: css.overflow,
        overflowX: css.overflowX,
        overflowY: css.overflowY,
        boundingBox: { x: box.x, y: box.y, width: box.width, height: box.height },
      };
    };
    return {
      dpr: devicePixelRatio,
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
      appShell: pick('.app-shell'),
      workspace: pick('.workspace'),
      editorColumn: pick('.editor-column'),
      timeline: pick('.timeline'),
      sidePanel: pick('.side-panel'),
    };
  });
  await writeFile(artifactPath(project, name), JSON.stringify(styles, null, 2));
}

// The theme toggle writes the dark class onto the html element; wait for it
// instead of sleeping so the dark capture shows the applied theme.
async function awaitDarkApplied(page: Page): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark')))
    .toBe(true);
}

// Themed components keep running color transitions after the dark class lands;
// wait until they settle so a capture cannot land mid-transition.
async function awaitTransitionsSettled(page: Page): Promise<void> {
  await expect
    .poll(async () =>
      page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length),
    )
    .toBe(0);
}

test('ui readability baseline: main window', async ({ page }, info) => {
  const errors = guardErrors(page);
  await page.goto('/');
  await expect(page.getByRole('menubar')).toBeVisible();
  await openAudio(page);
  await expect(page.locator('.timeline-viewport')).toBeVisible();
  await saveShot(page, info.project.name, 'main.png');
  const styles = await page.evaluate(() => {
    const pick = (selector: string): Record<string, unknown> | null => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const css = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        display: css.display,
        gridTemplateColumns: css.gridTemplateColumns,
        minHeight: css.minHeight,
        height: css.height,
        borderTopWidth: css.borderTopWidth,
        borderRightWidth: css.borderRightWidth,
        borderBottomWidth: css.borderBottomWidth,
        borderLeftWidth: css.borderLeftWidth,
        overflow: css.overflow,
        overflowX: css.overflowX,
        overflowY: css.overflowY,
        boundingBox: { x: box.x, y: box.y, width: box.width, height: box.height },
      };
    };
    return {
      dpr: devicePixelRatio,
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
      timeline: pick('.timeline'),
      workspace: pick('.workspace'),
      sidePanel: pick('.side-panel'),
      app: pick('#app'),
    };
  });
  await writeFile(
    artifactPath(info.project.name, 'computed-styles.json'),
    JSON.stringify(styles, null, 2),
  );
  expect(errors).toEqual([]);
});

test('ui readability baseline: side panel modules', async ({ page }, info) => {
  const errors = guardErrors(page);
  await page.goto('/');
  await expect(page.getByRole('menubar')).toBeVisible();
  await openAudio(page);
  for (const tab of TABS) {
    const toggle = page.getByRole('button', { name: tab.label, exact: true });
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
    await expect(page.locator(tab.ready)).toBeVisible();
    await saveShot(page, info.project.name, `tab-${tab.name}.png`);
    await toggle.click();
  }
  expect(errors).toEqual([]);
});

test('ui readability baseline: bmhelper dialogs', async ({ page }, info) => {
  const errors = guardErrors(page);
  await page.goto('/');
  await expect(page.getByRole('menubar')).toBeVisible();
  await page.getByRole('button', { name: 'BMHelper', exact: true }).click();
  await expect(page.locator('.bmhelper')).toBeVisible();
  const midi = writeSmfSequence({
    quantize: 480,
    notes: [
      { position: 0, nn: 60, vel: 100, gate: 120 },
      { position: 480, nn: 64, vel: 90, gate: 240 },
    ],
    pitches: [],
    controls: [],
  });
  await pick(page, 'Import MIDI', 'phrase.mid', midi);
  await awaitDialogPainted(page);
  await saveShot(page, info.project.name, 'bmh-settings-dialog.png');
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('.bmhelper .piano-roll, .bmhelper canvas').first()).toBeVisible();
  await page.getByRole('button', { name: 'Definition info', exact: true }).click();
  await awaitDialogPainted(page);
  await saveShot(page, info.project.name, 'bmh-definitions-dialog.png');
  expect(errors).toEqual([]);
});

test('ui readability baseline: about dialog', async ({ page }, info) => {
  const errors = guardErrors(page);
  await page.goto('/');
  await expect(page.getByRole('menubar')).toBeVisible();
  // Element Plus renders the group trigger as role=button; items are menuitems.
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('menuitem', { name: 'About', exact: true }).click();
  await awaitDialogPainted(page);
  await expect(page.getByRole('menuitem', { name: 'About', exact: true })).toBeHidden();
  await saveShot(page, info.project.name, 'about-dialog.png');
  expect(errors).toEqual([]);
});

test('ui readability baseline: calibration dialog', async ({ page }, info) => {
  const errors = guardErrors(page);
  await page.goto('/');
  await expect(page.getByRole('menubar')).toBeVisible();
  await openAudio(page);
  await page.getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Calibrate', exact: true }).click();
  await awaitDialogPainted(page);
  await saveShot(page, info.project.name, 'calibration-dialog.png');
  expect(errors).toEqual([]);
});

test('ui readability baseline: narrow 900', async ({ page }, info) => {
  const errors = guardErrors(page);
  await page.setViewportSize({ width: 900, height: 720 });
  await page.goto('/');
  await expect(page.getByRole('menubar')).toBeVisible();
  await openAudio(page);
  await expect(page.locator('.timeline-viewport')).toBeVisible();
  await saveShot(page, info.project.name, 'narrow-900.png');
  await writeLayoutStyles(page, info.project.name, 'computed-styles-narrow-900.json');
  for (const label of ['Output', 'Markers', 'BMHelper', 'Band detect'])
    await page.getByRole('button', { name: label, exact: true }).click();
  // Modules use the full width and evict the oldest instead of scrolling.
  const order = () =>
    page
      .locator('.workspace-module:visible')
      .evaluateAll((elements) => elements.map((element) => element.id));
  await expect.poll(order).toEqual(['panel-cuts', 'panel-bmhelper', 'panel-detect']);
  const modules = await page.locator('.panel-modules').evaluate((element) => ({
    width: element.clientWidth,
    content: element.scrollWidth,
    overflow: getComputedStyle(element).overflowX,
  }));
  expect(modules.content).toBeLessThanOrEqual(modules.width + 1);
  expect(modules.overflow).toBe('hidden');
  expect(
    await page.locator('.side-panel').evaluate((element) => element.clientWidth),
  ).toBeGreaterThan(850);
  expect(await page.locator('.panel-switches').evaluate((element) => element.clientWidth)).toBe(46);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(900);
  await saveShot(page, info.project.name, 'narrow-900-modules.png');
  await page.setViewportSize({ width: 680, height: 720 });
  await expect.poll(order).toEqual(['panel-bmhelper', 'panel-detect']);
  await expect(page.getByRole('button', { name: 'Markers', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(order).toEqual(['panel-bmhelper', 'panel-detect']);
  for (const label of ['Output', 'Source', 'Markers'])
    await page.getByRole('button', { name: label, exact: true }).click();
  await expect
    .poll(order)
    .toEqual(['panel-bmhelper', 'panel-detect', 'panel-output', 'panel-source', 'panel-cuts']);
  await page.setViewportSize({ width: 900, height: 720 });
  await expect.poll(order).toEqual(['panel-output', 'panel-source', 'panel-cuts']);
  expect(
    await page
      .locator('.panel-modules')
      .evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('ui readability baseline: narrow 680', async ({ page }, info) => {
  const errors = guardErrors(page);
  await page.setViewportSize({ width: 680, height: 720 });
  await page.goto('/');
  await expect(page.getByRole('menubar')).toBeVisible();
  await openAudio(page);
  await expect(page.locator('.timeline-viewport')).toBeVisible();
  await saveShot(page, info.project.name, 'narrow-680.png');
  await writeLayoutStyles(page, info.project.name, 'computed-styles-narrow-680.json');
  // Pin the stacked layout and top border that the 680px media query owns.
  const workspace = await page
    .locator('.workspace')
    .evaluate((element) => getComputedStyle(element).display);
  const sidePanelBorderTop = await page
    .locator('.side-panel')
    .evaluate((element) => getComputedStyle(element).borderTopWidth);
  expect(workspace).toBe('flex');
  expect(sidePanelBorderTop).toBe('1px');
  // Dark capture proves the moved layout rules stay theme independent.
  await page.getByText('Dark', { exact: true }).click();
  await awaitDarkApplied(page);
  await awaitTransitionsSettled(page);
  await saveShot(page, info.project.name, 'narrow-680-dark.png');
  expect(errors).toEqual([]);
});
