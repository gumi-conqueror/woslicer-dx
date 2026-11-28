import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startEntry } from './prepare-version.mjs';

const changelog = `# Changelog

## 2.0.0-alpha.1 — 2026-11-26

- Earlier.
`;

test('a new version gets an entry above the other versions', () => {
  assert.equal(
    startEntry(changelog, '2.0.0-alpha.2', '2026-12-01'),
    changelog.replace('## 2.0.0-alpha.1', '## 2.0.0-alpha.2 — 2026-12-01\n\n## 2.0.0-alpha.1'),
  );
});

test('the entry of the same version keeps its changes and takes the new date', () => {
  assert.equal(
    startEntry(changelog, '2.0.0-alpha.1', '2026-12-01'),
    changelog.replace('2026-11-26', '2026-12-01'),
  );
});

test('a changelog without a version entry stops the preparation', () => {
  assert.throws(
    () => startEntry('# Changelog\n\n- A change.\n', '2.0.0-alpha.2', '2026-12-01'),
    /Missing a version entry/,
  );
});
