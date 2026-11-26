import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const root = new URL('../', import.meta.url);
// This fixed output directory contains only compiled core tests.
rmSync(new URL('dist/tests/', root), { recursive: true, force: true });
for (const args of [
  ['scripts/gen-i18n.js'],
  ['node_modules/typescript/bin/tsc', '-p', 'tests/tsconfig.tests.json'],
  ['--test', 'dist/tests/*.test.js'],
]) {
  execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
}
