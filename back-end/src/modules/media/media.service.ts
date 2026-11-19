import { createHash, randomUUID } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { inject, injectable } from "tsyringe";
import { type ActorContext, requireCapability } from "../../shared/authorization/capabilities.ts";
import { AppError } from "../../shared/errors/AppError.ts";
import { ConflictError, NotFoundError } from "../../shared/errors/http-errors.ts";
import type { IStorageProvider } from "../../shared/storage/storage.interface.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import type { IMediaService } from "./media.interfaces.ts";
import { MediaRepository } from "./media.repository.ts";
import type { IMediaRepository, ReadyFile } from "./media.repository.interface.ts";

@injectable()
export class MediaService implements IMediaService {
  private processing = 0;
  constructor(
    @inject("MediaRepository") private repository: IMediaRepository,
    @inject("StorageProvider") private storage: IStorageProvider,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
  ) {}
  acquire() {
    if (this.processing >= 2)
      throw new AppError("Processamento de imagens ocupado", 503, undefined, "MEDIA_PROCESSING_BUSY");
    this.processing++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.processing--;
      }
    };
  }
  async upload(actor: ActorContext, buffer: Buffer, mime: string) {
    requireCapability(actor, "menu:manage");
    if (!actor.restaurantId) throw new NotFoundError();
    const rest = actor.restaurantId;
    if (!buffer.length || buffer.length > 8388608)
      throw new AppError("Arquivo excede o limite de 8 MiB", 413, undefined, "UPLOAD_TOO_LARGE");
    const formats: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
    const signature = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "image/png"
      : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
        ? "image/jpeg"
        : buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP"
          ? "image/webp"
          : null;
    if (signature !== mime)
      throw new AppError("Formato de imagem não permitido", 415, undefined, "UNSUPPORTED_MEDIA_TYPE");
    let metadata: Metadata;
    try {
      metadata = await sharp(buffer, { limitInputPixels: 25000000, failOn: "warning" }).metadata();
    } catch {
      throw new AppError("Imagem inválida", 415, undefined, "UNSUPPORTED_MEDIA_TYPE");
    }
    if (
      !metadata.format ||
      formats[metadata.format] !== mime ||
      (metadata.pages ?? 1) > 1 ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > 10000 ||
      metadata.height > 10000
    )
      throw new AppError("Formato de imagem não permitido", 415, undefined, "UNSUPPORTED_MEDIA_TYPE");
    const id = randomUUID(),
      reserve = 16777216n,
      prefix = `${rest}/${id}`;
    await this.unit.run(
      rest,
      ({ db }) => new MediaRepository(db).reserve(rest, id, actor.id, mime, buffer.length, reserve),
      { actor, capability: "menu:manage" },
    );
    try {
      const files: ReadyFile[] = [];
      for (const [kind, size] of [
        ["MAIN", 1600],
        ["THUMB", 480],
      ] as const) {
        const result = await sharp(buffer, { limitInputPixels: 25000000, failOn: "warning" })
          .rotate()
          .resize(size, size, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer({ resolveWithObject: true });
        const key = `${prefix}/${kind.toLowerCase()}.webp`;
        await this.storage.put(key, result.data);
        files.push({
          kind,
          storage_key: key,
          byte_size: BigInt(result.data.length),
          width: result.info.width,
          height: result.info.height,
          sha256: createHash("sha256").update(result.data).digest("hex"),
        });
      }
      const result = await this.unit.run(
        rest,
        ({ db }) => new MediaRepository(db).ready(rest, id, metadata.width ?? 0, metadata.height ?? 0, files),
        { actor, capability: "menu:manage" },
      );
      return {
        id,
        status: "READY" as const,
        width: result.width ?? 0,
        height: result.height ?? 0,
        byte_size: Number(result.stored_bytes),
        main_path: `/api/v1/media/${id}/main`,
        thumb_path: `/api/v1/media/${id}/thumb`,
      };
    } catch (error) {
      let cleanupFailed = false;
      for (const kind of ["main", "thumb"]) {
        try {
          await this.storage.delete(`${prefix}/${kind}.webp`);
        } catch {
          cleanupFailed = true;
        }
      }
      await this.unit.run(
        rest,
        ({ db }) => new MediaRepository(db).fail(rest, id, cleanupFailed ? reserve : 0n),
        { allowInactive: true },
      );
      if (error instanceof AppError) throw error;
      throw new AppError("Não foi possível armazenar a imagem", 503, undefined, "STORAGE_UNAVAILABLE");
    }
  }
  async open(id: string, kind: "MAIN" | "THUMB", actor?: ActorContext) {
    if (actor) requireCapability(actor, "menu:manage");
    const asset = actor?.restaurantId
      ? await this.repository.get(actor.restaurantId, id)
      : await this.repository.publicAsset(id);
    if (asset?.status !== "READY") throw new NotFoundError("Imagem não encontrada");
    const derivative = asset.derivatives.find((file) => file.kind === kind);
    if (!derivative) throw new NotFoundError("Imagem não encontrada");
    try {
      return await this.storage.open(derivative.storage_key);
    } catch {
      throw new NotFoundError("Arquivo de imagem indisponível");
    }
  }
  async remove(actor: ActorContext, id: string) {
    requireCapability(actor, "menu:manage");
    if (!actor.restaurantId) throw new NotFoundError();
    await this.removeAsset(actor.restaurantId, id, actor);
  }
  private async removeAsset(rest: string, id: string, actor?: ActorContext, cleanup = false) {
    const asset = await this.unit.run(
      rest,
      async ({ db, now }) => {
        const repo = new MediaRepository(db),
          current = await repo.get(rest, id);
        if (cleanup) {
          const age =
            now.getTime() - (current.status === "READY" ? current.created_at : current.updated_at).getTime();
          const threshold = current.status === "READY" ? 604800000 : 86400000;
          if (current.status !== "DELETING" && age <= threshold) return null;
        }
        return repo.beginDeletion(rest, id);
      },
      {
        actor,
        capability: actor ? "menu:manage" : undefined,
        allowInactive: !actor,
      },
    );
    if (!asset) return false;
    try {
      for (const kind of ["main", "thumb"]) await this.storage.delete(`${asset.storage_prefix}/${kind}.webp`);
    } catch {
      throw new AppError(
        "Falha ao excluir arquivo; será tentado novamente",
        503,
        undefined,
        "STORAGE_UNAVAILABLE",
      );
    }
    await this.unit.run(rest, ({ db }) => new MediaRepository(db).finishDeletion(rest, id), {
      allowInactive: true,
    });
    return true;
  }
  async cleanup() {
    let removed = 0;
    for (const asset of await this.repository.candidates(new Date())) {
      try {
        if (await this.removeAsset(asset.restaurant_id, asset.id, undefined, true)) removed++;
      } catch (error) {
        if (!(error instanceof ConflictError))
          console.error("Falha na limpeza de mídia", { media_id: asset.id });
      }
    }
    return removed;
  }
}
