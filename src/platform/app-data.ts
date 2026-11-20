import { invoke, isTauri } from '@tauri-apps/api/core';
import { z } from 'zod';

const folderSchema = z.object({
  kind: z.enum(['data', 'local', 'config', 'cache']),
  path: z.string(),
});
export type AppDataFolder = z.infer<typeof folderSchema>;
export async function appDataFolders(): Promise<AppDataFolder[]> {
  if (!isTauri()) return [];
  return z.array(folderSchema).parse(await invoke<unknown>('app_data_folders'));
}
export async function openDataFolder(kind: AppDataFolder['kind'] = 'data'): Promise<void> {
  if (isTauri()) await invoke('open_data_folder', { kind });
}
