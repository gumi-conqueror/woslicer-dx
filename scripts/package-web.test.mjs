import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { unzipSync } from 'fflate';

function fixture(t, files) {
  const prefix = resolve(tmpdir(), 'woslicer-web-package-');
  const directory = mkdtempSync(prefix);
  t.after(() => {
    assert.ok(resolve(directory).startsWith(prefix));
    rmSync(directory, { recursive: true, force: true });
  });
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '1.2.3' }),
  );
  for (const [name, bytes] of Object.entries(files)) {
    const path = join(directory, 'dist/app', name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }
  return directory;
}

test('Web packaging preserves build bytes and credits while excluding development files', (t) => {
  const expected = {
    'index.html': '<html>tested build</html>',
    'favicon.ico': Buffer.from([0, 0, 1, 0]),
    'build-info.json': '{"commit":"tested"}',
    LICENSE: 'MIT terms',
    NOTICE: 'Required credits',
    'assets/nested/audio data.bin': Buffer.from([0, 255, 13, 10]),
  };
  const directory = fixture(t, {
    ...expected,
    'assets/app.js.map': 'source map',
    '.vite/manifest.json': 'development manifest',
  });
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, 'package-web.mjs')], {
    cwd: directory,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const unpacked = unzipSync(readFileSync(join(directory, 'release/web/fixture-1.2.3-web.zip')));
  assert.deepEqual(Object.keys(unpacked).sort(), Object.keys(expected).sort());
  for (const [name, bytes] of Object.entries(expected)) {
    assert.deepEqual(Buffer.from(unpacked[name]), Buffer.from(bytes));
  }
});

test('Web packaging rejects output without an application entry point', (t) => {
  const directory = fixture(t, { NOTICE: 'credits alone are not a build' });
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, 'package-web.mjs')], {
    cwd: directory,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must include index.html/);
});
