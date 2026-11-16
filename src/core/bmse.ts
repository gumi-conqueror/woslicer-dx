/**
 * BMSE custom clipboard format.
 *
 * Format name (exact): "BMSE ClipBoard Object Data Format"
 * Body: header line, then one line per marker:
 *   "101" + tick as 8-digit decimal + clip number + CRLF
 * terminated by a NUL byte.
 *
 * The 3-character wav-slot column and the clip number are parsed and discarded
 * on import (matching the original); only the tick positions matter here.
 * Internal (in-app) copies are kept separately by the renderer and never go
 * through the system clipboard.
 */

import { MAX_TICKS } from './timebase.js';
import { markerNextId, stepId } from './formats/numbering.js';

export const BMSE_CLIPBOARD_FORMAT_NAME = 'BMSE ClipBoard Object Data Format';

export interface BmseExportOptions {
  /** First clip number written into the lines. */
  startNumber: number;
  /**
   * Use the restricted marker numbering policy.
   */
  useFfNumbering: boolean;
}

/** Normalize a starting value through the marker numbering policy. */
export function applyFfSkip(n: number, useFf: boolean): number {
  return markerNextId(stepId(n, -1, 'extended'), useFf);
}

/**
 * Builds the BMSE clipboard text for the given marker ticks.
 * `ticks` need not be sorted; output follows ascending tick order.
 */
export function buildBmseClipboard(ticks: readonly number[], options: BmseExportOptions): string {
  const sorted = [...ticks].sort((a, b) => a - b).filter((t) => t >= 0 && t < MAX_TICKS);
  let n = applyFfSkip(options.startNumber, options.useFfNumbering);
  let out = BMSE_CLIPBOARD_FORMAT_NAME + '\r\n';
  for (const tick of sorted) {
    out += '101' + String(tick).padStart(8, '0') + String(n) + '\r\n';
    n = markerNextId(n, options.useFfNumbering);
  }
  out += '\0';
  return out;
}

export interface BmseParseResult {
  ticks: number[];
  /** Line numbers (1-based, excluding the header) that were skipped as malformed. */
  invalidLines: number[];
}

/**
 * Exact byte representation written to the system clipboard under the custom
 * format name: UTF-8 encoding of the payload text, including the trailing
 * NUL. The payload is ASCII today, but the conversion is byte-exact for any
 * text so nothing is silently re-encoded.
 */
export function bmseTextToBuffer(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Inverse of bmseTextToBuffer: decodes clipboard bytes back to text. */
export function bmseBufferToText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Parses BMSE clipboard text. Tolerates CRLF/LF; requires the exact header.
 * Lines shorter than 11 characters or with non-numeric tick fields are
 * reported in `invalidLines` and skipped instead of aborting the import.
 */
export function parseBmseClipboard(text: string): BmseParseResult {
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines[0] !== BMSE_CLIPBOARD_FORMAT_NAME) {
    throw new Error('clipboard does not start with "BMSE ClipBoard Object Data Format"');
  }
  const ticks: number[] = [];
  const invalidLines: number[] = [];
  for (let i = 1; i < lines.length - 1; i++) {
    const line = lines[i];
    const tick = Number.parseInt(line.slice(3, 11), 10);
    if (line.length >= 11 && Number.isInteger(tick) && tick >= 0 && tick < MAX_TICKS) {
      ticks.push(tick);
    } else {
      invalidLines.push(i);
    }
  }
  return { ticks, invalidLines };
}
