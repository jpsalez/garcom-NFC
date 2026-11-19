import type { Readable } from "node:stream";
export interface IStorageProvider {
  put(key: string, bytes: Uint8Array): Promise<void>;
  open(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}
