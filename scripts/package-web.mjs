import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { unzipSync, zipSync } from 'fflate';

const args = process.argv.slice(2);
if (args[0] === '--build') {
  execFileSync(process.execPath, ['scripts/build-app-frontend.mjs', 'web', ...args.slice(1)], {
    stdio: 'inherit',
    windowsHide: true,
  });
} else if (args.length) {
  throw new Error(
    'Use --build before build profile options, or omit options to archive existing output',
  );
}

const root = 'dist/app';
const files = {};
for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const path = join(entry.parentPath, entry.name);
  const name = relative(root, path).split(sep).join('/');
  if (name.endsWith('.map') || name.startsWith('.vite/')) continue;
  files[name] = new Uint8Array(readFileSync(path));
}
assert.ok(files['index.html'], 'The Web build must include index.html');

const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'));
const archive = `release/web/${name}-${version}-web.zip`;
mkdirSync('release/web', { recursive: true });
writeFileSync(archive, zipSync(files, { level: 9 }));

const unpacked = unzipSync(readFileSync(archive));
assert.deepEqual(Object.keys(unpacked).sort(), Object.keys(files).sort());
for (const [name, bytes] of Object.entries(files)) {
  assert.deepEqual(unpacked[name], bytes, `Archive content differs: ${name}`);
}
console.log(`Validated ${Object.keys(files).length} files in ${archive}`);
