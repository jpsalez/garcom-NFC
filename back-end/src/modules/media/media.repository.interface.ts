import type { media_assets, Prisma } from "../../../generated/prisma/client.ts";
export type MediaRecord = Prisma.media_assetsGetPayload<{ include: { derivatives: true } }>;
export type ReadyFile = {
  kind: "MAIN" | "THUMB";
  storage_key: string;
  byte_size: bigint;
  width: number;
  height: number;
  sha256: string;
};
export interface IMediaRepository {
  get(restaurantId: string, id: string): Promise<MediaRecord>;
  publicAsset(id: string): Promise<MediaRecord | null>;
  reserve(
    restaurantId: string,
    id: string,
    userId: string,
    mime: string,
    size: number,
    reserved: bigint,
  ): Promise<media_assets>;
  ready(
    restaurantId: string,
    id: string,
    width: number,
    height: number,
    files: ReadyFile[],
  ): Promise<MediaRecord>;
  fail(restaurantId: string, id: string, bytes: bigint): Promise<Prisma.BatchPayload>;
  beginDeletion(restaurantId: string, id: string): Promise<MediaRecord>;
  finishDeletion(restaurantId: string, id: string): Promise<void>;
  candidates(now: Date): Promise<{ id: string; restaurant_id: string }[]>;
}
