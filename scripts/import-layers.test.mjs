// A source file imports only from its own layer or from a lower layer.
// docs/ARCHITECTURE.md ("Layers") explains the table below.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * [layer, pattern]: the first matching pattern gives the layer of a file.
 * In a feature folder the `.vue` files are views and the `.ts` files are services.
 */
const LAYERS = [
  [7, /^src\/app\//], // app shell
  [4, /^src\/commands\//], // commands
  [0, /^src\/core\//], // rules
  [1, /^src\/(project|platform|audio|i18n|ui)\//], // boundaries
  [2, /^src\/slicing\/editor-(store|actions)\.ts$/], // editor state
  [5, /^src\/input\/.*\.ts$/], // input
  [6, /^src\/timeline\//], // views
  [6, /\.vue$/], // views
  [3, /^src\/(playback|workspace|export|detection|bmhelper|calibration)\/.*\.ts$/], // feature services
];
/** Generated message keys and catalogs are data. Every layer may import them. */
const GENERATED = 'src/i18n/generated.ts';
const IMPORT = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
const DYNAMIC_IMPORT = /import\(\s*['"](\.[^'"]+)['"]\s*\)/g;

function layerOf(path) {
  return LAYERS.find(([, pattern]) => pattern.test(path))?.[0];
}

/**
 * `sources` maps a path such as `src/core/rate.ts` to the file text. Returns
 * one line for each file without a layer and for each import of a higher layer.
 */
function layerProblems(sources) {
  const problems = [];
  for (const [path, text] of sources) {
    const layer = layerOf(path);
    if (layer === undefined) {
      problems.push(`${path} has no layer: add its folder to LAYERS`);
      continue;
    }
    const targets = [...text.matchAll(IMPORT), ...text.matchAll(DYNAMIC_IMPORT)].map(
      (match) => match[1],
    );
    for (const target of new Set(targets)) {
      const base = posix.join(posix.dirname(path), target);
      const imported = [base, `${base}.ts`, `${base}/index.ts`].find((name) => sources.has(name));
      if (!imported || imported === GENERATED) continue;
      const importedLayer = layerOf(imported);
      if (importedLayer !== undefined && importedLayer > layer)
        problems.push(`${path} (layer ${layer}) imports ${imported} (layer ${importedLayer})`);
    }
  }
  return problems;
}

function readSources() {
  const sourceDir = fileURLToPath(new URL('../src', import.meta.url));
  const sources = new Map();
  for (const name of readdirSync(sourceDir, { recursive: true })) {
    if (!/\.(ts|vue)$/.test(name) || name.endsWith('.d.ts')) continue;
    sources.set(`src/${name.replaceAll('\\', '/')}`, readFileSync(join(sourceDir, name), 'utf8'));
  }
  return sources;
}

test('source files import only from their own layer or a lower layer', () => {
  const sources = readSources();
  assert.ok(sources.has('src/commands/commands.ts'), 'the source tree was read');
  assert.deepEqual(layerProblems(sources), []);
});

test('the layer check reports an upward import and a file without a layer', () => {
  const sources = new Map([
    ['src/core/rate.ts', "import { COMMANDS } from '../commands/commands';"],
    ['src/commands/commands.ts', "import type { Rate } from '../core/rate';"],
    ['src/core/labels.ts', "import { keys } from '../i18n/generated';"],
    ['src/i18n/generated.ts', ''],
    ['src/plugins/host.ts', ''],
  ]);
  assert.deepEqual(layerProblems(sources), [
    'src/core/rate.ts (layer 0) imports src/commands/commands.ts (layer 4)',
    'src/plugins/host.ts has no layer: add its folder to LAYERS',
  ]);
});
