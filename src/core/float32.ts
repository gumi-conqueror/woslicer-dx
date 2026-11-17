/** Standard floating-point rounding and integer truncation helpers. */
export function f32(x: number): number {
  return Math.fround(x);
}

export function toInt32(x: number): number {
  return Math.trunc(x);
}

export function intDiv(a: number, b: number): number {
  return Math.trunc(a / b);
}
