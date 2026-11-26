import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const { checkVersion } = createRequire(import.meta.url)('./check-version.js');

function release(version, heading = version) {
  const entry = `# Changelog\n\n## ${heading} — 2026-11-26\n\n- Change.\n`;
  return {
    pkg: { version },
    lock: { version, packages: { '': { version } } },
    changelogs: { 'CHANGELOG.md': entry, 'CHANGELOG.zh-CN.md': entry },
  };
}

test('accepts releases and numbered alpha prereleases', () => {
  for (const version of ['2.0.0', '2.0.0-alpha.1', '2.1.0-alpha.12'])
    checkVersion(release(version));
});

test('rejects other prerelease forms and out-of-range numbers', () => {
  for (const version of ['2.0.0-beta.1', '2.0.0-alpha', '2.0.0-alpha.0', '2.0', '2.0.0+build'])
    assert.throws(() => checkVersion(release(version)), /major\.minor\.patch/, version);
  assert.throws(() => checkVersion(release('2.0.0-alpha.70000')), /Windows resource/);
});

test('requires the lockfile and the first changelog entry to name the same version', () => {
  const lockMismatch = release('2.0.0-alpha.2');
  lockMismatch.lock.version = '2.0.0-alpha.1';
  assert.throws(() => checkVersion(lockMismatch), /Lockfile/);
  assert.throws(() => checkVersion(release('2.0.0-alpha.2', '2.0.0-alpha.1')), /CHANGELOG/);
  assert.throws(() => checkVersion(release('2.0.0-alpha.1', 'Unreleased')), /CHANGELOG/);
});
