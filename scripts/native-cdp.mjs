import { chromium, expect } from '@playwright/test';

/** Attach to the app's loopback WebView2 endpoint after its page is available. */
export async function connectNativePage(port) {
  const endpoint = `http://127.0.0.1:${port}`;
  await expect(async () => {
    const response = await fetch(`${endpoint}/json/list`);
    const targets = await response.json();
    expect(targets.some((target) => target.type === 'page')).toBe(true);
  }).toPass({ timeout: 20_000, intervals: [100, 250, 500] });
  const browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.waitForEvent('page'));
  await page.waitForLoadState('load');
  const session = await context.newCDPSession(page);
  await session.send('Runtime.enable');
  await session.send('Page.enable');
  return { browser, page, session };
}
