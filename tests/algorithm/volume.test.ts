import { expect, test } from 'vitest';
import { ampToDb, dbToAmp, dbToSlider, sliderToDb } from '../../src/core/volume';

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
