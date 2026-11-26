// The native host cannot import the TypeScript owners of these facts, so it
// repeats them. These tests read both sources and fail when the copies differ.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ts = {
  formats: read('src/core/audio-formats.ts'),
  schema: read('src/project/schema.ts'),
  names: read('src/platform/file-names.ts'),
  yuancon: read('src/input/yuancon/protocol.ts'),
};
const rust = {
  files: read('src-tauri/src/files.rs'),
  session: read('src-tauri/src/session.rs'),
  input: read('src-tauri/src/input.rs'),
};

function match(source, pattern, label) {
  const found = pattern.exec(source);
  assert.ok(found, `${label} not found`);
  return found;
}
/** Evaluates `2 * 1024 * 1024` style products. */
const product = (text) =>
  text.split('*').reduce((value, factor) => value * Number(factor.trim()), 1);
const strings = (text) => [...text.matchAll(/["']([^"']+)["']/g)].map((item) => item[1]);

test('native file grants accept exactly the audio extensions of the app', () => {
  const app = strings(match(ts.formats, /AUDIO_EXTENSIONS = \[([^\]]+)\]/, 'AUDIO_EXTENSIONS')[1]);
  const native = strings(match(rust.files, /Self::Audio => &\[([^\]]+)\]/, 'Rust audio list')[1]);
  assert.deepEqual(native, app, 'src-tauri/src/files.rs and src/core/audio-formats.ts');
});

test('native file size budgets match the app budgets', () => {
  const tsBytes = (name) => product(match(ts.schema, new RegExp(`${name} = ([\\d *]+);`), name)[1]);
  const rustBytes = (name) =>
    product(match(rust.files, new RegExp(`${name}: u64 = ([\\d *]+);`), name)[1]);
  assert.equal(rustBytes('MAX_FILE_BYTES'), tsBytes('MEDIA_FILE_MAX_BYTES'), 'media budget');
  assert.equal(rustBytes('MAX_PROJECT_BYTES'), tsBytes('PROJECT_FILE_MAX_BYTES'), 'project budget');
  const tsExtra = product(
    match(ts.schema, /SESSION_FILE_MAX_BYTES = PROJECT_FILE_MAX_BYTES \+ ([\d *]+);/, 'session')[1],
  );
  const rustExtra = product(
    match(
      rust.session,
      /MAX_SESSION_BYTES: u64 = super::files::MAX_PROJECT_BYTES \+ ([\d *]+);/,
      'Rust session',
    )[1],
  );
  assert.equal(rustExtra, tsExtra, 'src-tauri/src/session.rs and src/project/schema.ts');
});

test('native project media lookup reads the current project format', () => {
  const format = match(ts.schema, /PROJECT_FORMAT = '([^']+)'/, 'PROJECT_FORMAT')[1];
  const version = Number(match(ts.schema, /PROJECT_SCHEMA_VERSION = (\d+)/, 'schema version')[1]);
  const media = Number(match(ts.schema, /PROJECT_MAX_MEDIA = (\d+)/, 'media limit')[1]);
  const check = match(
    rust.files,
    /value\["format"\] != "([^"]+)" \|\| value\["schemaVersion"\] != (\d+)/,
    'Rust format check',
  );
  assert.deepEqual([check[1], Number(check[2])], [format, version], 'format and version');
  assert.equal(Number(match(rust.files, /media\.len\(\) > (\d+)/, 'Rust media limit')[1]), media);
});

test('native and app portable file names forbid the same characters and device names', () => {
  const appCharacters = match(
    ts.names,
    /const FORBIDDEN = \/\[([^\]]+)\\u0000-\\u001f\]\/g;/,
    'FORBIDDEN',
  )[1].replace(/\\(.)/g, '$1');
  const nativeCharacters = match(
    rust.files,
    /\|\| "((?:[^"\\]|\\.)+)"\.contains\(c\)/,
    'Rust characters',
  )[1].replace(/\\(.)/g, '$1');
  assert.equal([...nativeCharacters].sort().join(''), [...appCharacters].sort().join(''));
  assert.match(ts.names, /RESERVED = \/\^\(\?:CON\|PRN\|AUX\|NUL\|COM\[1-9\]\|LPT\[1-9\]\)/);
  assert.match(rust.files, /"CON" \| "PRN" \| "AUX" \| "NUL"/);
  assert.match(rust.files, /\["COM", "LPT"\]/);
  assert.equal(Number(match(ts.names, /MAX_LENGTH = (\d+);/, 'MAX_LENGTH')[1]), 240);
  assert.match(rust.files, /name\.len\(\) > 240/);
});

test('native YuanCon detection uses the app device identifiers', () => {
  const filter = match(
    ts.yuancon,
    /YUANCON_FILTER = \{ vendorId: (0x[0-9a-f]+), productId: (0x[0-9a-f]+), usagePage: (\d+), usage: (\d+) \}/,
    'YUANCON_FILTER',
  ).slice(1);
  const native = match(
    rust.input,
    /vendor_id\(\) == (0x[0-9a-f]+)\s*&& info\.product_id\(\) == (0x[0-9a-f]+)\s*&& info\.usage_page\(\) == (\d+)\s*&& info\.usage\(\) == (\d+)/,
    'Rust supported()',
  ).slice(1);
  assert.deepEqual(native.map(Number), filter.map(Number));
});
