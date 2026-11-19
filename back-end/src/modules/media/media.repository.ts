import { inject, injectable } from "tsyringe";
import type { DbClient } from "../../shared/providers/prisma.ts";
import { ConflictError, NotFoundError } from "../../shared/errors/http-errors.ts";
import type { IMediaRepository, ReadyFile } from "./media.repository.interface.ts";
export const mediaInclude = { derivatives: true } as const;
@injectable()
export class MediaRepository implements IMediaRepository {
  constructor(@inject("DbClient") private db: DbClient) {}
  async get(restaurantId: string, id: string) {
    const asset = await this.db.media_assets.findFirst({
      where: { restaurant_id: restaurantId, id },
      include: mediaInclude,
    });
    if (!asset) throw new NotFoundError("Imagem não encontrada");
    return asset;
  }
  publicAsset(id: string) {
    return this.db.media_assets.findFirst({
      where: {
        id,
        status: "READY",
        restaurant: { active: true },
        publication_links: { some: { publication: { current_for: { some: {} } } } },
      },
      include: mediaInclude,
    });
  }
  async reserve(
    restaurantId: string,
    id: string,
    userId: string,
    mime: string,
    size: number,
    reserved: bigint,
  ) {
    const totals = await this.db.media_assets.aggregate({
      where: { restaurant_id: restaurantId },
      _sum: { stored_bytes: true, reserved_bytes: true },
      _count: { id: true },
    });
    const cap = BigInt(process.env.MEDIA_QUOTA_BYTES ?? "2147483648");
    const max = Number(process.env.MEDIA_MAX_ASSETS ?? 2000);
    if (
      totals._count.id >= max ||
      (totals._sum.stored_bytes ?? 0n) + (totals._sum.reserved_bytes ?? 0n) + reserved > cap
    )
      throw new ConflictError("Limite de imagens do restaurante atingido", "MEDIA_QUOTA_EXCEEDED");
    return this.db.media_assets.create({
      data: {
        id,
        restaurant_id: restaurantId,
        storage_prefix: `${restaurantId}/${id}`,
        created_by: userId,
        original_mime_type: mime,
        original_byte_size: BigInt(size),
        reserved_bytes: reserved,
      },
    });
  }
  async ready(restaurantId: string, id: string, width: number, height: number, files: ReadyFile[]) {
    const asset = await this.get(restaurantId, id);
    if (asset.status !== "PENDING")
      throw new ConflictError("Upload não está mais pendente", "MEDIA_STATE_CONFLICT");
    const bytes = files.reduce((sum, file) => sum + file.byte_size, 0n);
    if (bytes > asset.reserved_bytes)
      throw new ConflictError("Imagem processada excede a reserva", "MEDIA_QUOTA_EXCEEDED");
    await this.db.media_derivatives.createMany({
      data: files.map((file) => ({ ...file, restaurant_id: restaurantId, media_id: id })),
    });
    await this.db.media_assets.updateMany({
      where: { id, restaurant_id: restaurantId },
      data: { width, height, stored_bytes: bytes, reserved_bytes: 0n, status: "READY" },
    });
    return this.get(restaurantId, id);
  }
  fail(restaurantId: string, id: string, bytes: bigint) {
    return this.db.media_assets.updateMany({
      where: { id, restaurant_id: restaurantId },
      data: { status: "FAILED", reserved_bytes: 0n, stored_bytes: bytes, failure_code: "UPLOAD_FAILED" },
    });
  }
  async referenced(restaurantId: string, id: string) {
    const [identity, products, publications] = await Promise.all([
      this.db.menus.count({
        where: { restaurant_id: restaurantId, OR: [{ logo_media_id: id }, { cover_media_id: id }] },
      }),
      this.db.menu_product_images.count({ where: { restaurant_id: restaurantId, media_id: id } }),
      this.db.menu_publication_media.count({ where: { restaurant_id: restaurantId, media_id: id } }),
    ]);
    return identity + products + publications > 0;
  }
  async beginDeletion(restaurantId: string, id: string) {
    const asset = await this.get(restaurantId, id);
    if (await this.referenced(restaurantId, id))
      throw new ConflictError("Imagem ainda utilizada", "MEDIA_IN_USE");
    await this.db.media_assets.updateMany({
      where: { restaurant_id: restaurantId, id },
      data: {
        status: "DELETING",
        stored_bytes: asset.stored_bytes + asset.reserved_bytes,
        reserved_bytes: 0n,
        delete_attempts: { increment: 1 },
        last_delete_attempt_at: new Date(),
      },
    });
    return asset;
  }
  async finishDeletion(restaurantId: string, id: string) {
    const asset = await this.get(restaurantId, id);
    if (asset.status !== "DELETING") throw new ConflictError("Exclusão não iniciada", "MEDIA_STATE_CONFLICT");
    await this.db.media_derivatives.deleteMany({ where: { restaurant_id: restaurantId, media_id: id } });
    await this.db.media_assets.delete({ where: { id } });
  }
  candidates(now: Date) {
    return this.db.media_assets.findMany({
      where: {
        OR: [
          { status: "DELETING" },
          { status: { in: ["PENDING", "FAILED"] }, updated_at: { lt: new Date(now.getTime() - 86400000) } },
          {
            status: "READY",
            created_at: { lt: new Date(now.getTime() - 604800000) },
            menu_logos: { none: {} },
            menu_covers: { none: {} },
            product_links: { none: {} },
            publication_links: { none: {} },
          },
        ],
      },
      select: { id: true, restaurant_id: true },
      take: 100,
      orderBy: { updated_at: "asc" },
    });
  }
}
