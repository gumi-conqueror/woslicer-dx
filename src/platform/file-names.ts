/**
 * Portable file names: what Windows accepts, applied on every platform so a
 * project or export made anywhere can be copied anywhere. The native host
 * applies the same rule in `src-tauri/src/files.rs` (`validate_name`);
 * `scripts/native-consistency.test.mjs` checks that both lists agree.
 */

// Control characters are intentionally matched: they must never survive into a file name.
// eslint-disable-next-line no-control-regex -- portable names exclude control characters
const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;
const MAX_LENGTH = 240;

export function isPortableFileName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= MAX_LENGTH &&
    !new RegExp(FORBIDDEN.source).test(name) &&
    !/[. ]$/.test(name) &&
    !RESERVED.test(name)
  );
}

/**
 * Turns user text into a portable file stem: forbidden characters become
 * `_`, trailing dots and spaces go, and a reserved device name gets a `_` prefix.
 */
export function portableStem(text: string, fallback: string, maxLength = MAX_LENGTH): string {
  const stem =
    text
      .replace(FORBIDDEN, '_')
      .replace(/[. ]+$/g, '')
      .slice(0, maxLength) || fallback;
  return RESERVED.test(stem) ? `_${stem}` : stem;
}
