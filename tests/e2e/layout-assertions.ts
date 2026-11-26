import { expect, type Page } from '@playwright/test';

export async function expectViewportLayout(page: Page): Promise<void> {
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    regions: Array.from(
      document.querySelectorAll(
        '.editor-toolbar, .playback-strip, .timeline, .side-panel, .statusbar',
      ),
      (element) => {
        const rect = element.getBoundingClientRect();
        return {
          name: element.className,
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
        };
      },
    ),
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.height + 1);
  for (const region of layout.regions) {
    expect(region.top, region.name).toBeGreaterThanOrEqual(-1);
    expect(region.left, region.name).toBeGreaterThanOrEqual(-1);
    expect(region.bottom, region.name).toBeLessThanOrEqual(layout.height + 1);
    expect(region.right, region.name).toBeLessThanOrEqual(layout.width + 1);
  }
}
