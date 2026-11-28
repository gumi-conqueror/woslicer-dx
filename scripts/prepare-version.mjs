// Sets the application version and starts its entry in both changelogs.
// Usage: npm run version:prepare -- <version>
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { checkVersion, ENTRY_HEADING, VERSION } = createRequire(import.meta.url)(
  './check-version.js',
);

const CHANGELOGS = ['CHANGELOG.md', 'CHANGELOG.zh-CN.md'];

/**
 * Puts `## <version> — <date>` above the other version entries. When the first
 * entry is already this version, only its date changes.
 */
export function startEntry(text, version, date) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const first = lines.findIndex((line) => ENTRY_HEADING.test(line));
  if (first === -1) throw new Error('Missing a version entry');
  const heading = `## ${version} — ${date}`;
  if (lines[first].startsWith(`## ${version} — `)) lines[first] = heading;
  else lines.splice(first, 0, heading, '');
  return lines.join('\n');
}

function today() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function prepare(version) {
  if (!VERSION.test(version ?? ''))
    throw new Error('Usage: npm run version:prepare -- <major.minor.patch[-alpha.N]>');
  // `npm run` provides the npm entry point; calling it through Node needs no shell.
  if (!process.env.npm_execpath) throw new Error('Run this through npm run version:prepare');
  const changelogs = {};
  for (const file of CHANGELOGS)
    changelogs[file] = startEntry(readFileSync(file, 'utf8'), version, today());
  const npm = spawnSync(
    process.execPath,
    [
      process.env.npm_execpath,
      'version',
      version,
      '--no-git-tag-version',
      '--ignore-scripts',
      '--allow-same-version',
    ],
    { stdio: 'inherit' },
  );
  if (npm.status !== 0) throw new Error('npm version failed');
  for (const [file, text] of Object.entries(changelogs)) writeFileSync(file, text);
  checkVersion({
    pkg: JSON.parse(readFileSync('package.json', 'utf8')),
    lock: JSON.parse(readFileSync('package-lock.json', 'utf8')),
    changelogs,
  });
  console.log(`Version ${version} is set. Write its changes under its entry in both changelogs.`);
  console.log('Preview the release notes: node scripts/release-notes.mjs');
}

if (import.meta.main) {
  try {
    prepare(process.argv[2]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
