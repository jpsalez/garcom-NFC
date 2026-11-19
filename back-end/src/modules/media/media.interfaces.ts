import type { Readable } from "node:stream";
import type { ActorContext } from "../../shared/authorization/capabilities.ts";
export type MediaView = {
  id: string;
  status: "READY";
  width: number;
  height: number;
  byte_size: number;
  main_path: string;
  thumb_path: string;
};
export interface IMediaService {
  acquire(): () => void;
  upload(actor: ActorContext, buffer: Buffer, mime: string): Promise<MediaView>;
  open(id: string, kind: "MAIN" | "THUMB", actor?: ActorContext): Promise<Readable>;
  remove(actor: ActorContext, id: string): Promise<void>;
  cleanup(): Promise<number>;
}
