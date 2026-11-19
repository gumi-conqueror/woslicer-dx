import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { unzipSync } from 'fflate';
import { targets } from './release-artifacts.mjs';
import { prepareDownloads, verifyPublishedDownloads } from './release-downloads.mjs';

test('downloads preserve application bytes and collect all verification files in one archive', (t) => {
  const prefix = resolve(tmpdir(), 'woslicer-downloads-');
  const directory = mkdtempSync(prefix);
  t.after(() => {
    assert.ok(resolve(directory).startsWith(prefix));
    rmSync(directory, { recursive: true, force: true });
  });
  const input = join(directory, 'input');
  const output = join(directory, 'output');
  mkdirSync(input);
  const packageBytes = Buffer.from([0, 255, 1, 13, 10]);
  writeFileSync(join(input, 'app.zip'), packageBytes);
  for (const platform of Object.keys(targets)) {
    writeFileSync(join(input, `manifest-${platform}.json`), JSON.stringify({ platform }));
  }
  prepareDownloads(input, output, 'app', '1.2.3');
  assert.deepEqual(readdirSync(output).sort(), ['app-1.2.3-verification.zip', 'app.zip']);
  assert.deepEqual(readFileSync(join(output, 'app.zip')), packageBytes);
  const unpacked = unzipSync(readFileSync(join(output, 'app-1.2.3-verification.zip')));
  assert.equal(Object.keys(unpacked).length, Object.keys(targets).length + 1);
  for (const [name, bytes] of Object.entries(unpacked)) {
    assert.deepEqual(Buffer.from(bytes), readFileSync(join(input, name)));
  }
  const sums = Buffer.from(unpacked.SHA256SUMS).toString();
  for (const line of sums.trim().split('\n')) {
    const [hash, name] = line.split('  ./');
    assert.equal(
      hash,
      createHash('sha256')
        .update(readFileSync(join(input, name)))
        .digest('hex'),
    );
  }
  assert.equal(sums.trim().split('\n').length, Object.keys(targets).length + 1);
  const second = join(directory, 'second');
  prepareDownloads(input, second, 'app', '1.2.3');
  assert.deepEqual(
    readFileSync(join(output, 'app-1.2.3-verification.zip')),
    readFileSync(join(second, 'app-1.2.3-verification.zip')),
  );
  const assets = readdirSync(output).map((name) => {
    const bytes = readFileSync(join(output, name));
    return {
      name,
      size: bytes.length,
      digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    };
  });
  verifyPublishedDownloads(output, assets);
  assert.throws(() => verifyPublishedDownloads(output, assets.slice(1)), /asset list differs/);
  assert.throws(
    () => verifyPublishedDownloads(output, [...assets, assets[0]]),
    /asset list differs/,
  );
  assert.throws(
    () =>
      verifyPublishedDownloads(
        output,
        assets.map((asset) => ({ ...asset, digest: 'changed' })),
      ),
    /checksum differs/,
  );
  assert.throws(
    () =>
      verifyPublishedDownloads(
        output,
        assets.map((asset) => ({ ...asset, size: 0 })),
      ),
    /size differs/,
  );
  assert.throws(() => prepareDownloads(input, output, 'app', '1.2.3'), /EEXIST/);
  rmSync(join(input, 'manifest-web.json'));
  assert.throws(
    () => prepareDownloads(input, join(directory, 'missing'), 'app', '1.2.3'),
    /ENOENT/,
  );
});
