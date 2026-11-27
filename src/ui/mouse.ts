/** Mouse buttons and gestures that the input hints show. */
export interface MouseGesture {
  button: 'left' | 'right' | 'middle' | 'wheel';
  action?: 'click' | 'double' | 'triple' | 'drag';
}
