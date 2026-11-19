import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./helpers/app.ts";
import { auth } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { categoryToken, menuFixture } from "./helpers/menu.ts";
import { LocalStorageProvider } from "../src/shared/storage/local-storage.ts";
import { container } from "../src/shared/container/container.ts";
import type { IMediaService } from "../src/modules/media/media.interfaces.ts";
import type { IStorageProvider } from "../src/shared/storage/storage.interface.ts";

let root: string;
let png: Buffer;
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "psiu-media-test-"));
  process.env.MEDIA_ROOT = root;
  png = await sharp({
    create: { width: 64, height: 48, channels: 4, background: { r: 10, g: 30, b: 50, alpha: 1 } },
  })
    .png()
    .toBuffer();
});
beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
  const target = path.resolve(root);
  if (
    path.dirname(target) !== path.resolve(os.tmpdir()) ||
    !path.basename(target).startsWith("psiu-media-test-")
  )
    throw new Error("Diretório temporário inesperado");
  await rm(target, { recursive: true, force: true });
});
describe("mídia local do cardápio", () => {
  it("falha de armazenamento responde 503 e libera reserva sem imagem READY incompleta", async () => {
    const f = await menuFixture();
    const storage = container.resolve<IStorageProvider>("StorageProvider");
    const failure = vi.spyOn(storage, "put").mockRejectedValueOnce(new Error("Falha de disco simulada"));
    try {
      const result = await api()
        .post("/api/v1/media")
        .set(auth(f.token))
        .attach("file", png, { filename: "prato.png" });
      expect(result.status).toBe(503);
      expect(result.body.code).toBe("STORAGE_UNAVAILABLE");
      const asset = await prisma.media_assets.findFirstOrThrow();
      expect(asset.status).toBe("FAILED");
      expect(asset.reserved_bytes).toBe(0n);
      expect(await prisma.media_derivatives.count()).toBe(0);
    } finally {
      failure.mockRestore();
    }
  });
  it("processa upload e mantém rascunho privado até publicação", async () => {
    const f = await menuFixture();
    const upload = await api()
      .post("/api/v1/media")
      .set(auth(f.token))
      .attach("file", png, { filename: "prato.png", contentType: "image/png" });
    expect(upload.status).toBe(201);
    expect(upload.body.status).toBe("READY");
    const id = upload.body.id;
    const privateImage = await api().get(`/api/v1/media/${id}/main`).set(auth(f.token));
    expect(privateImage.status).toBe(200);
    expect(privateImage.headers["content-type"]).toContain("image/webp");
    expect((await api().get(`/api/v1/public/media/${id}/main`)).status).toBe(404);
    expect(
      (
        await api()
          .put(`/api/v1/menu/products/${f.product.id}/images`)
          .set(auth(f.token))
          .send({
            expected_draft_version: (await f.getDraft()).draft_version,
            items: [{ media_id: id, alt_text: "Prato" }],
          })
      ).status,
    ).toBe(200);
    await f.publish();
    expect((await api().get(`/api/v1/public/media/${id}/thumb`)).status).toBe(200);
    expect((await api().delete(`/api/v1/media/${id}`).set(auth(f.token))).body.code).toBe("MEDIA_IN_USE");
    const asset = await prisma.media_assets.findUniqueOrThrow({
      where: { id },
      include: { derivatives: true },
    });
    expect(asset.derivatives).toHaveLength(2);
    const anotherProvider = new LocalStorageProvider();
    const stream = await anotherProvider.open(asset.derivatives[0]?.storage_key ?? "missing");
    stream.destroy();
  });
  it("recusa arquivo falso, arquivo extra e upload sem permissão", async () => {
    const f = await menuFixture(),
      waiter = await categoryToken(f.restaurantId, "WAITER");
    expect(
      (
        await api()
          .post("/api/v1/media")
          .set(auth(f.token))
          .attach("file", Buffer.from("texto"), { filename: "fake.png", contentType: "image/png" })
      ).status,
    ).toBe(415);
    expect(
      (
        await api()
          .post("/api/v1/media")
          .set(auth(f.token))
          .attach("file", png, { filename: "1.png" })
          .attach("file", png, { filename: "2.png" })
      ).status,
    ).toBe(400);
    expect(
      (await api().post("/api/v1/media").set(auth(waiter.token)).attach("file", png, { filename: "1.png" }))
        .status,
    ).toBe(403);
    expect(await prisma.media_assets.count()).toBe(0);
  });
  it("não permite usar imagem de outro restaurante", async () => {
    const a = await menuFixture(),
      b = await menuFixture();
    const upload = await api()
      .post("/api/v1/media")
      .set(auth(b.token))
      .attach("file", png, { filename: "b.png" });
    expect(upload.status).toBe(201);
    expect(
      (
        await api()
          .patch("/api/v1/menu/draft")
          .set(auth(a.token))
          .send({ expected_draft_version: (await a.getDraft()).draft_version, logo_media_id: upload.body.id })
      ).status,
    ).toBe(404);
    expect((await api().get(`/api/v1/media/${upload.body.id}/main`).set(auth(a.token))).status).toBe(404);
  });
  it("remove mídia sem referência e limpeza preserva mídia publicada", async () => {
    const f = await menuFixture();
    const upload = await api()
      .post("/api/v1/media")
      .set(auth(f.token))
      .attach("file", png, { filename: "prato.png" });
    expect(upload.status).toBe(201);
    await prisma.media_assets.update({
      where: { id: upload.body.id },
      data: { created_at: new Date(Date.now() - 8 * 86400000) },
    });
    expect(await container.resolve<IMediaService>("MediaService").cleanup()).toBe(1);
    expect(await prisma.media_assets.count()).toBe(0);
    expect((await api().get(`/api/v1/media/${upload.body.id}/main`).set(auth(f.token))).status).toBe(404);
  });
});
