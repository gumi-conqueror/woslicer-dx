// Sets the application version and turns the Unreleased changelog sections into its entries.
// Usage: npm run version:prepare -- <version>
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { checkVersion, VERSION } = createRequire(import.meta.url)('./check-version.js');

/** The changelogs and the heading of the section that collects changes until the next version. */
export const CHANGELOGS = { 'CHANGELOG.md': 'Unreleased', 'CHANGELOG.zh-CN.md': '未发布' };

/** Renames the `## <unreleased>` section to `## <version> — <date>` and adds a new empty one above it. */
export function releaseChangelog(text, unreleased, version, date) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.indexOf(`## ${unreleased}`);
  if (start === -1) throw new Error(`Missing "## ${unreleased}" section`);
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const body = lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
  if (!body.trim()) throw new Error(`The "## ${unreleased}" section is empty`);
  lines.splice(start, 1, `## ${unreleased}`, '', `## ${version} — ${date}`);
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
  for (const [file, unreleased] of Object.entries(CHANGELOGS))
    changelogs[file] = releaseChangelog(readFileSync(file, 'utf8'), unreleased, version, today());
  const npm = spawnSync(
    process.execPath,
    [process.env.npm_execpath, 'version', version, '--no-git-tag-version', '--ignore-scripts'],
    { stdio: 'inherit' },
  );
  if (npm.status !== 0) throw new Error('npm version failed');
  for (const [file, text] of Object.entries(changelogs)) writeFileSync(file, text);
  checkVersion({
    pkg: JSON.parse(readFileSync('package.json', 'utf8')),
    lock: JSON.parse(readFileSync('package-lock.json', 'utf8')),
    changelogs,
  });
  console.log(`Prepared ${version}. Review both changelogs, then preview the notes:`);
  console.log('  node scripts/release-notes.mjs');
}

if (import.meta.main) {
  try {
    prepare(process.argv[2]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
