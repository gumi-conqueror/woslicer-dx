// Subset local font sources from shipped UI text. No fonts are fetched at runtime.
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fontverter from 'fontverter';
import subsetFont from 'subset-font';
import { renameFont } from './rename-font.mjs';

export function charactersInRange(text, unicodeRange) {
  const ranges = unicodeRange.split(',').map((range) => {
    const [start, end = start] = range.trim().replace(/^U\+/i, '').split('-');
    return [parseInt(start.replaceAll('?', '0'), 16), parseInt(end.replaceAll('?', 'f'), 16)];
  });
  return [...new Set(text)]
    .filter((character) => {
      const code = character.codePointAt(0);
      return ranges.some(([start, end]) => code >= start && code <= end);
    })
    .sort((a, b) => a.codePointAt(0) - b.codePointAt(0))
    .join('');
}

export async function buildFonts(root) {
  const source = resolve(root, 'src');
  const output = resolve(source, 'app/generated/fonts');
  const manifest = JSON.parse(readFileSync(resolve(source, 'i18n/languages.json'), 'utf8'));
  // Source literals include units, shortcut labels and symbols outside translations.
  let common = Array.from({ length: 95 }, (_, index) => String.fromCharCode(index + 32)).join('');
  function collect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'generated' || entry.name === 'generated.ts') continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) collect(path);
      else if (/\.(vue|ts|css|html)$/.test(entry.name)) common += readFileSync(path, 'utf8');
    }
  }
  collect(source);
  common += JSON.stringify(manifest);
  common += readFileSync(resolve(source, 'i18n/en.json'), 'utf8');
  const fonts = {
    en: {
      package: '@fontsource-variable/ibm-plex-sans',
      styles: ['wght.css'],
      locale: 'en',
    },
    zh: {
      package: '@ibm/plex-sans-sc',
      styles: ['css/ibm-plex-sans-sc-all.css'],
      locale: 'zh-cn',
    },
    ja: {
      package: '@fontsource/ibm-plex-sans-jp',
      styles: ['400.css', '500.css', '600.css', '700.css'],
      locale: 'ja',
    },
    ko: {
      package: '@fontsource/ibm-plex-sans-kr',
      styles: ['400.css', '500.css', '600.css', '700.css'],
      locale: 'ko',
    },
  };
  mkdirSync(output, { recursive: true });
  // Remove obsolete generated faces when packages or UI text change.
  for (const name of readdirSync(output)) {
    if (name.endsWith('.woff2')) unlinkSync(resolve(output, name));
  }
  const css = [];
  let sourceBytes = 0;
  let subsetBytes = 0;
  for (const { id } of manifest.languages) {
    const font = fonts[id];
    if (!font) throw new Error(`Missing UI font for language: ${id}`);
    const directory = resolve(root, 'node_modules', font.package);
    const text =
      common +
      readFileSync(resolve(source, `i18n/${id}.json`), 'utf8') +
      readFileSync(
        resolve(root, `node_modules/element-plus/es/locale/lang/${font.locale}.mjs`),
        'utf8',
      );
    for (const style of font.styles) {
      const stylePath = resolve(directory, style);
      const stylesheet = readFileSync(stylePath, 'utf8');
      for (const [, face] of stylesheet.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
        const weight = /font-weight:\s*([^;]+);/.exec(face)?.[1];
        if (/font-style:\s*italic/.test(face)) continue;
        if (!weight?.includes(' ') && !['400', '500', '600', '700'].includes(weight)) continue;
        const url = /url\(['"]?([^)'"\s]+)['"]?\)\s*format\(['"]woff2(?:-variations)?['"]\)/.exec(
          face,
        );
        const range = /unicode-range:\s*([^;]+);/.exec(face);
        // IBM also declares complete fallback faces; use only its ranged sources.
        if (!range) continue;
        if (!url) throw new Error(`Unexpected font declaration in ${font.package}`);
        const characters = charactersInRange(text, range[1]);
        if (!characters) continue;
        const input = readFileSync(resolve(stylePath, '..', url[1]));
        sourceBytes += input.length;
        const subset = await subsetFont(input, characters, {
          targetFormat: 'sfnt',
          preserveNameIds: [0, 13, 14], // Retain copyright and font license metadata.
        });
        const bytes = await fontverter.convert(renameFont(subset), 'woff2');
        const filename = `wos-ui-${id}-${css.length}.woff2`;
        writeFileSync(resolve(output, filename), bytes);
        subsetBytes += bytes.length;
        const unicode = [...characters].map(
          (character) => `U+${character.codePointAt(0).toString(16)}`,
        );
        css.push(
          `@font-face {font-display: swap;${face
            .replace(/font-family:[^;]+;/, `font-family: 'WOS UI ${id}';`)
            .replace(/src:[^;]+;/, `src: url('./${filename}') format('woff2');`)
            .replace(range[0], `unicode-range: ${unicode.join(',')};`)}}`,
        );
      }
    }
  }
  const stylesheet = resolve(output, 'fonts.css');
  writeFileSync(stylesheet, css.join('\n'));
  console.log(
    `UI fonts: ${sourceBytes} source bytes -> ${subsetBytes} subset bytes (${css.length} files)`,
  );
}
