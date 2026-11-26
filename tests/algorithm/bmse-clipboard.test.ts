import { expect, test } from 'vitest';
import {
  buildBmseClipboard,
  parseBmseClipboard,
  recordingCutText,
  sourceSequenceText,
} from '../../src/core/formats/bmse';

const HEADER = 'BMSE ClipBoard Object Data Format\r\n';

test('markers use the 101 column, 8-digit ticks, CRLF and a final NUL', () => {
  expect(buildBmseClipboard([408, 384], { startNumber: 1, numbering: 'extended' })).toBe(
    HEADER + '101000003841\r\n101000004082\r\n\0',
  );
});

test('markers outside the marker map are dropped', () => {
  expect(
    buildBmseClipboard([60, -1, 12, 49152], { startNumber: 15, numbering: 'restricted' }),
  ).toBe(HEADER + '1010000001215\r\n1010000006036\r\n\0');
});

test('restricted numbering moves a start number with a low digit G-Z to the next block', () => {
  // 16 is "0G" in base 36; the next allowed number is 36 ("10").
  expect(buildBmseClipboard([0, 192], { startNumber: 16, numbering: 'restricted' })).toBe(
    HEADER + '1010000000036\r\n1010000019237\r\n\0',
  );
  expect(buildBmseClipboard([0], { startNumber: 16, numbering: 'extended' })).toBe(
    HEADER + '1010000000016\r\n\0',
  );
});

test('reading the written text returns the marker ticks', () => {
  const ticks = [0, 192, 432, 7944, 49151];
  expect(
    parseBmseClipboard(buildBmseClipboard(ticks, { startNumber: 5, numbering: 'extended' })),
  ).toEqual({
    ticks,
    invalidLines: [],
  });
});

test('reading requires the exact format name', () => {
  expect(() => parseBmseClipboard('some other format\n1010000003841\n')).toThrow();
  expect(() => parseBmseClipboard('')).toThrow();
});

test('reading accepts LF line ends and reports malformed lines', () => {
  const text = [
    'BMSE ClipBoard Object Data Format',
    '101000003841',
    'badline',
    '101000004082',
    '',
  ].join('\n');
  expect(parseBmseClipboard(text)).toEqual({ ticks: [384, 408], invalidLines: [2] });
});

test('recording cuts use the 011 column at 48 ticks per beat', () => {
  // Onset 750 at 300 ticks per beat is beat 2.5: tick 120.
  expect(recordingCutText([750], 300)).toBe(HEADER + '011000001201\r\n');
  expect(() => recordingCutText([-1], 48)).toThrow(RangeError);
});

test('simultaneous source notes take the next BGM lane', () => {
  expect(
    sourceSequenceText(
      [
        { onset: 10, definitionId: 10 },
        { onset: 10, definitionId: 36 },
      ],
      48,
    ),
  ).toBe(HEADER + '1010000001010\r\n1020000001036\r\n');
});
