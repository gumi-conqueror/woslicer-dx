import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  MANIFEST as manifest,
  DATA as GENERATED_DATA,
  EN as en,
} from '../../src/i18n/generated.js';
import {
  LANGUAGES,
  DOC_LANG,
  detectLanguage,
  isLanguage,
  type Language,
} from '../../src/core/language.js';
import type { ChromeKey, StatusKey } from '../../src/core/messages.js';

interface LanguageData {
  chrome: Record<string, string>;
  status: Record<string, string>;
  menu: Record<string, string>;
  dialogs: Record<string, string>;
  scopeRange: string;
}
const DATA: Record<Language, LanguageData> = GENERATED_DATA;
const nonEnglish = LANGUAGES.filter((lang) => lang !== 'en');

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

test('the i18n manifest is the single source of truth for the language set', () => {
  assert.deepEqual(
    manifest.languages.map((entry) => entry.id),
    [...LANGUAGES],
  );
  const ids = manifest.languages.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate language id in manifest');
  for (const entry of manifest.languages) {
    assert.ok(entry.label.trim().length > 0, `empty selector label for ${entry.id}`);
    assert.ok(entry.docLang.trim().length > 0, `empty docLang for ${entry.id}`);
  }
});

test('docLang covers every language (drives <html lang> and the selector options)', () => {
  for (const lang of LANGUAGES) {
    assert.ok(DOC_LANG[lang].length > 0, `missing docLang for ${lang}`);
  }
});

test('every language ships the identical key set in every section', () => {
  const minimums = { chrome: 60, status: 60, menu: 20, dialogs: 5 } as const;
  for (const section of ['chrome', 'status', 'menu', 'dialogs'] as const) {
    const reference = Object.keys(en[section]).sort();
    assert.ok(
      reference.length >= minimums[section],
      `${section} dictionary looks short: ${reference.length}`,
    );
    for (const lang of nonEnglish) {
      assert.deepEqual(
        Object.keys(DATA[lang][section]).sort(),
        reference,
        `${section} drift in ${lang}`,
      );
    }
  }
});

test('status templates keep their placeholder names across languages', () => {
  for (const key of Object.keys(en.status) as StatusKey[]) {
    const reference = placeholders(en.status[key]);
    for (const lang of nonEnglish) {
      assert.deepEqual(
        placeholders(DATA[lang].status[key]),
        reference,
        `${lang} status.${key} placeholders`,
      );
    }
  }
});

/** Every leaf of a dictionary section, with its dotted path. */
function leaves(value: unknown, path: string): [string, unknown][] {
  if (typeof value !== 'object' || value === null) return [[path, value]];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, `${path}.${key}`));
}

test('every translation is non-empty text', () => {
  const empty = nonEnglish
    .flatMap((lang) => leaves(DATA[lang], lang))
    .filter(([, value]) => typeof value !== 'string' || !value.trim())
    .map(([path]) => path);
  assert.deepEqual(empty, []);
});

test('status and scope placeholders are camelCase names', () => {
  for (const template of [en.scopeRange, ...Object.values(en.status)]) {
    for (const match of template.matchAll(/\{(\w+)\}/g)) {
      assert.match(match[1], /^[a-z][A-Za-z0-9]*$/, `placeholder {${match[1]}} is not camelCase`);
    }
  }
});

test('auto detection walks the preference list without per-locale fallback', () => {
  assert.equal(detectLanguage(['de-DE', 'ja-JP', 'ko']), 'ja');
  assert.equal(detectLanguage(['zh-TW', 'en']), 'zh');
  assert.equal(detectLanguage(['fr-FR', 'de-DE']), 'en');
  assert.equal(detectLanguage([]), 'en');
  assert.equal(detectLanguage(['ko']), 'ko');
});

test('isLanguage validates stored preferences', () => {
  assert.equal(isLanguage('ja'), true);
  assert.equal(isLanguage('ko'), true);
  assert.equal(isLanguage('zh'), true);
  assert.equal(isLanguage('fr'), false);
  assert.equal(isLanguage(null), false);
  assert.equal(isLanguage(7), false);
  assert.equal(isLanguage(''), false);
});

// Keep the chrome key type honest: a ChromeKey must be assignable from its
// literal and the reference set must not silently collapse to string.
const _typeProbe: ChromeKey = 'open';
void _typeProbe;
