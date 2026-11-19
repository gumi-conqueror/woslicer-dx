import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import { targets } from './release-artifacts.mjs';

export function bundleVerification(directory, archive) {
  const names = [
    ...Object.keys(targets).map((platform) => `manifest-${platform}.json`),
    'SHA256SUMS',
  ];
  const files = Object.fromEntries(
    names.map((name) => [name, new Uint8Array(readFileSync(join(directory, name)))]),
  );
  writeFileSync(archive, zipSync(files, { level: 9, mtime: new Date(1980, 0, 1) }));
  const unpacked = unzipSync(readFileSync(archive));
  assert.deepEqual(Object.keys(unpacked).sort(), names.sort());
  for (const [name, bytes] of Object.entries(files)) {
    assert.deepEqual(unpacked[name], bytes, `Verification archive content differs: ${name}`);
  }
}

export function prepareDownloads(directory, output, name, version) {
  // The release workflow validates manifests and package hashes before this step.
  const metadata = new Set(Object.keys(targets).map((platform) => `manifest-${platform}.json`));
  const files = readdirSync(directory)
    .filter((file) => file !== 'SHA256SUMS')
    .sort();
  const sums = files
    .map((file) => {
      const hash = createHash('sha256')
        .update(readFileSync(join(directory, file)))
        .digest('hex');
      return `${hash}  ./${file}\n`;
    })
    .join('');
  writeFileSync(join(directory, 'SHA256SUMS'), sums);
  // Refuse an existing output directory so stale files cannot become release assets.
  mkdirSync(output);
  bundleVerification(directory, join(output, `${name}-${version}-verification.zip`));
  for (const file of files) {
    if (!metadata.has(file)) copyFileSync(join(directory, file), join(output, file));
  }
}

export function verifyPublishedDownloads(directory, assets) {
  const names = readdirSync(directory).sort();
  assert.deepEqual(assets.map((asset) => asset.name).sort(), names, 'Published asset list differs');
  for (const asset of assets) {
    const bytes = readFileSync(join(directory, asset.name));
    assert.equal(asset.size, bytes.length, `Published asset size differs: ${asset.name}`);
    assert.equal(
      asset.digest,
      `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      `Published asset checksum differs: ${asset.name}`,
    );
  }
}

if (import.meta.main) {
  if (process.argv[2] === 'verify-published') {
    const release = JSON.parse(readFileSync(process.argv[3], 'utf8'));
    verifyPublishedDownloads('release-downloads', release.assets);
  } else {
    const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'));
    prepareDownloads('release-assets', 'release-downloads', name, version);
  }
}
