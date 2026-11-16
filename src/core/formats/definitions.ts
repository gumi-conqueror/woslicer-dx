import { formatId } from './numbering.js';
export interface DefinitionLine {
  readonly identifier: number;
  readonly soundOrdinal: number;
}
export function definitionText(definitions: readonly DefinitionLine[], stem: string): string {
  if (/[\r\n\0]/.test(stem)) throw new RangeError('Invalid filename stem');
  return definitions
    .map((d) => {
      if (!Number.isSafeInteger(d.soundOrdinal) || d.soundOrdinal < 0)
        throw new RangeError('Invalid recording sound ordinal');
      return (
        '#WAV' +
        formatId(d.identifier) +
        ' ' +
        stem +
        '_' +
        String(d.soundOrdinal).padStart(3, '0') +
        '.wav\r\n'
      );
    })
    .join('');
}
