// Application version source: root package.json. Other copies are derived/checked.
const fs = require('fs');
const path = require('path');

/** `major.minor.patch`, or an alpha prerelease `major.minor.patch-alpha.N` (N ≥ 1). */
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-alpha\.([1-9]\d*))?$/;
const VERSION_TEXT = '\\d+\\.\\d+\\.\\d+(?:-alpha\\.[1-9]\\d*)?';

/** Throws when the package, lockfile and changelogs disagree about the version. */
function checkVersion({ pkg, lock, changelogs }) {
  const parts = VERSION.exec(pkg.version);
  if (!parts)
    throw new Error('Release version must be major.minor.patch or major.minor.patch-alpha.N');
  // Windows version resources hold four 16-bit numbers.
  if (parts.slice(1).some((part) => part !== undefined && Number(part) > 65535))
    throw new Error('Version exceeds Windows resource limits');
  for (const version of [lock.version, lock.packages?.['']?.version]) {
    if (version !== pkg.version)
      throw new Error(
        'Lockfile version differs from package.json; run npm version <version> --no-git-tag-version --ignore-scripts',
      );
  }
  const heading = new RegExp(`^## (${VERSION_TEXT}) — \\d{4}-\\d{2}-\\d{2}$`, 'm');
  for (const [file, contents] of Object.entries(changelogs)) {
    if (contents.match(heading)?.[1] !== pkg.version)
      throw new Error(file + ' must document the current package.json version first');
  }
}

module.exports = { checkVersion, VERSION };

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const pkg = require('../package.json');
  const changelogs = Object.fromEntries(
    ['CHANGELOG.md', 'CHANGELOG.zh-CN.md'].map((file) => [
      file,
      fs.readFileSync(path.join(root, file), 'utf8'),
    ]),
  );
  checkVersion({ pkg, lock: require('../package-lock.json'), changelogs });
  console.log('Application version consistent: ' + pkg.version);
}
