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
/** Which device to offer: its vendor, product and the usage of its report collection. */
export interface HidFilter {
  vendorId: number;
  productId: number;
  usagePage: number;
  usage: number;
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
