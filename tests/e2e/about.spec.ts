import { expect, test } from '@playwright/test';
import { collectErrors } from './pages';
import { readFile } from 'node:fs/promises';
import { creditLinks } from '../../src/platform/about-links';

test('shows embedded build information under offline CSP and opens only clicked links', async ({
  page,
  context,
}, info) => {
  // `npm run build` writes the build identity that the page must show.
  const identity: unknown = JSON.parse(await readFile('dist/app/build-info.json', 'utf8'));
  if (
    typeof identity !== 'object' ||
    identity === null ||
    !('commit' in identity) ||
    typeof identity.commit !== 'string'
  ) {
    throw new Error('Missing build identity');
  }
  const errors = collectErrors(page);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await expect(page.getByRole('menubar')).toBeVisible();
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
    'content',
    /connect-src 'none'/,
  );
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await page.getByRole('menuitem', { name: 'About', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(identity.commit);
  const links = dialog.locator('.credits a');
  await expect(links).toHaveCount(Object.keys(creditLinks).length);
  expect(requests.some((url) => url.includes('build-info.json'))).toBe(false);
  expect(requests.every((url) => new URL(url).hostname === '127.0.0.1')).toBe(true);
  expect(errors).toEqual([]);
  // Every linked icon and the root favicon load as images.
  const icons = await page
    .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
    .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href));
  expect(icons).toHaveLength(3);
  for (const url of [...icons, new URL('favicon.ico', page.url()).href]) {
    if (url.startsWith('data:image/')) continue;
    const response = await page.request.get(url);
    expect(response.status(), url).toBe(200);
    expect(response.headers()['content-type'], url).toMatch(/^image\//);
  }
  await page.screenshot({
    path: info.outputPath('about.png'),
    fullPage: true,
    animations: 'disabled',
  });
  for (const url of Object.values(creditLinks)) {
    // Intercept each destination without contacting the credit site.
    await context.route(url, (route) =>
      route.fulfill({ body: '<title>Credit destination</title>' }),
    );
    const opening = context.waitForEvent('page');
    await dialog.locator(`.credits a[href="${url}"]`).click();
    const external = await opening;
    await external.waitForLoadState();
    expect(external.url()).toBe(url);
    expect(await external.evaluate(() => window.opener === null)).toBe(true);
    await external.close();
    await expect(dialog).toBeVisible();
  }
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
});
