/** Message types derived from the dictionaries; Vue I18n owns runtime formatting. */
import type { DATA } from '../i18n/generated.js';

/** Static chrome strings (labels, buttons, titles), keyed by stable id. */
export type ChromeKey = keyof typeof DATA.en.chrome;

/** Status-bar message templates, keyed by stable id. */
export type StatusKey = keyof typeof DATA.en.status;

/** The text of a caught value, for status messages. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Values for {name} placeholders in status/scope templates. */
export type FormatParams = Record<string, string | number>;
