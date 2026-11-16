export type ProjectFormat = 'wos' | 'bmh' | 'dx';
export interface BinaryCodec<T> {
  decode(bytes: Uint8Array): T;
  encode(value: T): Uint8Array;
}
export interface AudioSamples {
  readonly sampleRate: number;
  readonly channels: readonly Float32Array[];
}
export function projectFormat(extension: string): ProjectFormat {
  switch (extension.toLowerCase()) {
    case '.wos':
      return 'wos';
    case '.bmh':
      return 'bmh';
    case '.json':
      return 'dx';
    default:
      throw new RangeError('Unsupported project extension');
  }
}
export function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(label + ' must be finite');
  return value;
}
export function positive(value: number, label: string): number {
  finite(value, label);
  if (value <= 0) throw new RangeError(label + ' must be positive');
  return value;
}
