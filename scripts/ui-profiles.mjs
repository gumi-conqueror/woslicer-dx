/**
 * Browser and native UI check profiles. Both lanes use the same CSS viewport;
 * `low` keeps the natural device scale of the native window and DPR 1 in the browser.
 */
export const UI_VIEWPORT = { width: 1000, height: 640 };
export const UI_PROFILES = [
  { name: 'low', dpr: 1, nativeDpr: null },
  { name: 'high', dpr: 2, nativeDpr: 2 },
];
