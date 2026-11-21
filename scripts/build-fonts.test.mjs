import assert from 'node:assert/strict';
import { test } from 'node:test';
import { charactersInRange } from './build-fonts.mjs';

test('font subsets match Unicode ranges, including supplementary-plane characters', () => {
  assert.equal(charactersInRange('A本日A𠮷語🙂', 'U+41, U+65E5, U+672C, U+20BB7'), 'A日本𠮷');
  assert.equal(charactersInRange('あアいう漢', 'U+304?'), 'あいう');
  assert.equal(charactersInRange('日本語', 'U+0-FF'), '');
});
