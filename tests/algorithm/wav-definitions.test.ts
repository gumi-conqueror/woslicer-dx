import { expect, test } from 'vitest';
import { definitionText } from '../../src/core/formats/definitions';

test('each definition names its exported slice file', () => {
  expect(
    definitionText(
      [
        { identifier: 10, soundOrdinal: 2 },
        { identifier: 36, soundOrdinal: 0 },
      ],
      'sample',
    ),
  ).toBe('#WAV0A sample_002.wav\r\n#WAV10 sample_000.wav\r\n');
});

test('rejects a file stem that would break the line', () => {
  expect(() => definitionText([{ identifier: 1, soundOrdinal: 0 }], 'a\nb')).toThrow(RangeError);
});
