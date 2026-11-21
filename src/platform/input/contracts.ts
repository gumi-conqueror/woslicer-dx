export interface HidChoice {
  id: string;
  name: string;
}
export type HidEvent =
  | { kind: 'report'; reportId: number; data: DataView; time: number }
  | { kind: 'disconnected'; message?: string };
export interface HidConnection {
  close(): Promise<void>;
}
export interface HidBackend {
  available: boolean;
  /** Native device selection. WebHID supplies its own chooser. */
  list?: () => Promise<HidChoice[]>;
  open(
    id: string | undefined,
    receive: (event: HidEvent) => void,
    signal: AbortSignal,
  ): Promise<HidConnection | null>;
}
