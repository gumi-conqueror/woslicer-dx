export interface ZoomState {
  readonly scroll: number;
  readonly scale: number;
}
export interface ZoomBounds {
  readonly min: number;
  readonly max: number;
}
function validate(state: ZoomState, bounds: ZoomBounds): void {
  if (
    ![state.scroll, state.scale, bounds.min, bounds.max].every(Number.isFinite) ||
    state.scroll < 0 ||
    state.scale <= 0 ||
    bounds.min <= 0 ||
    bounds.max < bounds.min
  )
    throw new RangeError('Invalid zoom state or bounds');
}
export function zoomAt(
  state: ZoomState,
  anchor: number,
  factor: number,
  bounds: ZoomBounds,
): ZoomState {
  validate(state, bounds);
  if (!Number.isFinite(anchor) || !Number.isFinite(factor) || factor <= 0)
    throw new RangeError('Invalid zoom request');
  const scale = Math.max(bounds.min, Math.min(bounds.max, state.scale * factor));
  const screen = (anchor - state.scroll) * state.scale;
  const scroll = Math.max(0, anchor - screen / scale);
  if (!Number.isFinite(scroll)) throw new RangeError('Zoom coordinate overflow');
  return { scale, scroll };
}
