import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseChangelog } from './prepare-version.mjs';

const changelog = `# Changelog

## Unreleased

### Fixed

- A fix.

## 2.0.0-alpha.1 — 2026-11-26

- Earlier.
`;

test('the unreleased section becomes the version entry and a new empty section stays on top', () => {
  assert.equal(
    releaseChangelog(changelog, 'Unreleased', '2.0.0-alpha.2', '2026-12-01'),
    changelog.replace('## Unreleased\n', '## Unreleased\n\n## 2.0.0-alpha.2 — 2026-12-01\n'),
  );
});

test('a missing or empty unreleased section stops the preparation', () => {
  assert.throws(
    () => releaseChangelog(changelog, '未发布', '2.0.0-alpha.2', '2026-12-01'),
    /Missing "## 未发布"/,
  );
  const empty = changelog.replace('### Fixed\n\n- A fix.\n\n', '');
  assert.throws(
    () => releaseChangelog(empty, 'Unreleased', '2.0.0-alpha.2', '2026-12-01'),
    /empty/,
  );
});
