import { z } from 'zod';

// Keep native file grants in src-tauri/src/files.rs aligned with this list.
export const AUDIO_EXTENSIONS = [
  'wav',
  'ogg',
  'oga',
  'flac',
  'mp3',
  'aac',
  'm4a',
  'mp4',
  'aif',
  'aiff',
  'mka',
  'mkv',
] as const;
export const audioFileFormatSchema = z.enum(AUDIO_EXTENSIONS);

export function audioFileFormat(name: string): z.infer<typeof audioFileFormatSchema> | null {
  const result = audioFileFormatSchema.safeParse(name.split('.').pop()?.toLowerCase());
  return result.success ? result.data : null;
}
