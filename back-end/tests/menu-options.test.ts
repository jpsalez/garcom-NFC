import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { api } from "./helpers/app.ts";
import { auth } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";
import { menuFixture } from "./helpers/menu.ts";
beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function withOptions() {
  const f = await menuFixture();
  const groupRes = await api()
    .post(`/api/v1/menu/products/${f.product.id}/option-groups`)
    .set(auth(f.token))
    .send({
      expected_draft_version: (await f.getDraft()).draft_version,
      name: "Extras",
      min_selections: 1,
      max_selections: 2,
    });
  expect(groupRes.status).toBe(201);
  const group = await prisma.menu_option_groups.findFirstOrThrow({ where: { product_id: f.product.id } });
  expect(
    (
      await api()
        .post(`/api/v1/menu/option-groups/${group.id}/options`)
        .set(auth(f.token))
        .send({
          expected_draft_version: (await f.getDraft()).draft_version,
          name: "Queijo",
          price_delta_cents: 400,
          max_quantity: 2,
        })
    ).status,
  ).toBe(201);
  const option = await prisma.menu_options.findFirstOrThrow({ where: { group_id: group.id } });
  expect(
    (
      await api()
        .put(`/api/v1/menu/variants/${f.variant.id}/option-groups`)
        .set(auth(f.token))
        .send({ expected_draft_version: (await f.getDraft()).draft_version, group_ids: [group.id] })
    ).status,
  ).toBe(200);
  return { ...f, group, option, next: await f.publish() };
}
describe("variantes e grupos de escolhas", () => {
  it("rejeita limites inconsistentes do grupo antes de gravar no banco", async () => {
    const f = await withOptions(),
      version = (await f.getDraft()).draft_version;
    const result = await api()
      .patch(`/api/v1/menu/option-groups/${f.group.id}`)
      .set(auth(f.token))
      .send({ expected_draft_version: version, min_selections: 3 });
    expect(result.status).toBe(400);
    expect(result.body.code).toBe("VALIDATION_ERROR");
    expect((await f.getDraft()).draft_version).toBe(version);
  });
  it("calcula adicionais por unidade, exige escolhas obrigatórias e mantém snapshot", async () => {
    const f = await withOptions(),
      missing = { ...f.submission(), publication_id: f.next };
    expect(
      (await api().post("/api/v1/public/orders").set("X-Table-Token", f.deviceToken).send(missing)).status,
    ).toBe(400);
    const body = { ...f.submission(2), publication_id: f.next };
    if (!body.items[0]) throw new Error("Fixture sem item");
    body.items[0].selections = [{ option_id: f.option.id, quantity: 2 }];
    const result = await api().post("/api/v1/public/orders").set("X-Table-Token", f.deviceToken).send(body);
    expect(result.status).toBe(201);
    expect(result.body.order.total_cents).toBe(7600);
    expect(result.body.order.items[0].selections[0].price_delta_cents).toBe(400);
    body.items[0].selections[0] = { option_id: f.option.id, quantity: 3 };
    expect(
      (
        await api()
          .post("/api/v1/public/orders")
          .set("X-Table-Token", f.deviceToken)
          .send({ ...body, submission_key: crypto.randomUUID() })
      ).status,
    ).toBe(400);
  });
  it("arquivamento não apaga publicação nem altera oferta antes de publicar", async () => {
    const f = await menuFixture();
    expect(
      (
        await api()
          .patch(`/api/v1/menu/products/${f.product.id}`)
          .set(auth(f.token))
          .send({ expected_draft_version: (await f.getDraft()).draft_version, archived: true })
      ).status,
    ).toBe(200);
    expect(
      (await api().get(`/api/v1/public/tables/${f.table.public_code}/menu`)).body.content.categories[0]
        .products[0].id,
    ).toBe(f.product.id);
    expect(
      (
        await api()
          .post("/api/v1/menu/publications")
          .set(auth(f.token))
          .send({ expected_draft_version: (await f.getDraft()).draft_version })
      ).body.code,
    ).toBe("INVALID_CATALOG_CONFIGURATION");
  });
});
