import { expect, test } from 'vitest';
import { ampToDb, dbToAmp, dbToSlider, formatDb, sliderToDb } from '../../src/core/volume';

test('a level above 0 dB reads with a plus sign', () => {
  expect([12, 0, -6].map((db) => formatDb(db))).toEqual(['+12 dB', '0 dB', '-6 dB']);
  expect(formatDb(-10, 1)).toBe('-10.0 dB');
  // The sign follows the rounded number.
  expect([0.04, -0.04, 0.06].map((db) => formatDb(db, 1))).toEqual(['0.0 dB', '0.0 dB', '+0.1 dB']);
});

test('decibels convert to amplitude by 20 × log10', () => {
  expect(dbToAmp(0)).toBe(1);
  expect(dbToAmp(-20)).toBeCloseTo(0.1, 12);
  expect(dbToAmp(-6)).toBeCloseTo(0.5012, 4);
});

test.each([0, -6, -10, -60])('amplitude converts back to %d dB', (db) => {
  expect(ampToDb(dbToAmp(db))).toBeCloseTo(db, 9);
});

test('fader positions 0–100 map linearly onto -60–0 dB', () => {
  expect([0, 50, 100].map(sliderToDb)).toEqual([-60, -30, 0]);
  expect([-60, -30, 0].map(dbToSlider)).toEqual([0, 50, 100]);
});
