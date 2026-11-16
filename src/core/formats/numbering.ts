export type NumberingMode = 'extended' | 'restricted';
export function validId(id: number): number {
  if (!Number.isInteger(id) || id < 0 || id >= 1296)
    throw new RangeError('Invalid definition identifier');
  return id;
}
export function formatId(id: number): string {
  return validId(id).toString(36).toUpperCase().padStart(2, '0');
}
export function parseId(text: string): number {
  if (!/^[0-9A-Z]{2}$/.test(text)) throw new RangeError('Expected two uppercase base-36 digits');
  return parseInt(text, 36);
}
const wrap = (n: number, size: number): number => ((n % size) + size) % size;
export function stepId(id: number, delta: number, mode: NumberingMode): number {
  validId(id);
  if (!Number.isSafeInteger(delta)) throw new RangeError('Invalid step');
  if (mode === 'extended') return wrap(id + delta, 1296);
  if (delta === 0) return id;
  let high = Math.floor(id / 36),
    low = id % 36;
  if (high > 15 || low > 15) {
    // Enter the ordinary cycle once, then apply the remaining steps within it.
    const direction = Math.sign(delta);
    low += direction;
    if (low < 0 || low > 15) {
      low = low < 0 ? 15 : 0;
      high += direction;
    }
    if (high < 0) high = 15;
    else if (high > 15) high = 0;
    return stepId(high * 36 + low, delta - direction, mode);
  }
  // Reduce first so every accepted offset keeps the ordinal sum exact.
  const next = wrap(high * 16 + low + (delta % 256), 256);
  return Math.floor(next / 16) * 36 + (next % 16);
}
export function markerNextId(id: number, restricted: boolean): number {
  validId(id);
  return wrap(id + (restricted && id % 36 === 15 ? 21 : 1), 1296);
}
export function renumber(ids: readonly number[], first: number, mode: NumberingMode): number[] {
  validId(first);
  ids.forEach(validId);
  if (!ids.length) return [];
  const old = ids[0] ?? 0;
  return ids.map((id, i) =>
    mode === 'extended' ? stepId(id, first - old, mode) : stepId(first, i, mode),
  );
}
