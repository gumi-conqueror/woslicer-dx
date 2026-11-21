import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import fontverter from 'fontverter';
import subsetFont from 'subset-font';
import { renameFont } from './rename-font.mjs';

function tables(font) {
  const result = new Map();
  for (let index = 0; index < font.readUInt16BE(4); index++) {
    const position = 12 + index * 16;
    const offset = font.readUInt32BE(position + 8);
    const length = font.readUInt32BE(position + 12);
    result.set(
      font.toString('ascii', position, position + 4),
      font.subarray(offset, offset + length),
    );
  }
  return result;
}

function names(font) {
  const table = tables(font).get('name');
  const result = new Map();
  for (let index = 0; index < table.readUInt16BE(2); index++) {
    const position = 6 + index * 12;
    const offset = table.readUInt16BE(4) + table.readUInt16BE(position + 10);
    const bytes = Buffer.from(table.subarray(offset, offset + table.readUInt16BE(position + 8)));
    result.set(table.readUInt16BE(position + 6), bytes.swap16().toString('utf16le'));
  }
  return result;
}

for (const source of [
  '@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2',
  '@ibm/plex-sans-sc/fonts/complete/woff2/hinted/IBMPlexSansSC-Regular.woff2',
  '@fontsource/ibm-plex-sans-jp/files/ibm-plex-sans-jp-latin-400-normal.woff2',
  '@fontsource/ibm-plex-sans-kr/files/ibm-plex-sans-kr-latin-400-normal.woff2',
]) {
  test(`renames ${source} subsets while preserving font data and attribution`, async () => {
    const input = await subsetFont(readFileSync(`node_modules/${source}`), '音源 123 BPM', {
      targetFormat: 'sfnt',
      preserveNameIds: [0, 13, 14],
    });
    const output = renameFont(input);
    const before = names(input);
    const after = names(output);
    for (const id of [0, 13, 14]) assert.equal(after.get(id), before.get(id));
    for (const id of [1, 3, 4, 6, 16, 18, 21, 25]) {
      if (after.has(id)) assert.doesNotMatch(after.get(id), /Plex/);
    }
    assert.match(after.get(1), /WOS UI/);
    const outputTables = tables(output);
    for (const [tag, bytes] of tables(input)) {
      if (tag !== 'name' && tag !== 'head') assert.deepEqual(outputTables.get(tag), bytes, tag);
    }
    let checksum = 0;
    for (let offset = 0; offset < output.length; offset += 4) {
      checksum = (checksum + output.readUInt32BE(offset)) >>> 0;
    }
    assert.equal(checksum, 0xb1b0afba);
    const compressed = await fontverter.convert(output, 'woff2');
    const decoded = await fontverter.convert(compressed, 'sfnt');
    assert.equal(names(decoded).get(1), after.get(1));
    assert.ok(compressed.length < readFileSync(`node_modules/${source}`).length);
  });
}
