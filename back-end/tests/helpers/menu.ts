import { randomUUID } from "node:crypto";
import type { staff_category } from "../../generated/prisma/enums.ts";
import { passwordHash } from "../../src/shared/utils/password.ts";
import { api } from "./app.ts";
import { auth, cookieOf, ownerOf } from "./auth.ts";
import { prisma } from "./db.ts";
import { createTable } from "./factories.ts";

export async function menuFixture(name = `menu-${randomUUID()}`) {
  const owner = await ownerOf(name);
  const getDraft = () => prisma.menus.findUniqueOrThrow({ where: { restaurant_id: owner.restaurantId } });
  const categoryResponse = await api()
    .post("/api/v1/menu/categories")
    .set(auth(owner.token))
    .send({ name: "Lanches", expected_draft_version: (await getDraft()).draft_version });
  if (categoryResponse.status !== 201) throw new Error(`Categoria: ${JSON.stringify(categoryResponse.body)}`);
  const category = await prisma.menu_categories.findFirstOrThrow({
    where: { restaurant_id: owner.restaurantId },
  });
  const productResponse = await api()
    .post("/api/v1/menu/products")
    .set(auth(owner.token))
    .send({
      category_id: category.id,
      name: "Hambúrguer",
      initial_variant: { name: "Grande", price_cents: 3000 },
      expected_draft_version: (await getDraft()).draft_version,
    });
  if (productResponse.status !== 201) throw new Error(`Produto: ${JSON.stringify(productResponse.body)}`);
  const product = await prisma.menu_products.findFirstOrThrow({
    where: { restaurant_id: owner.restaurantId },
  });
  const variant = await prisma.menu_product_variants.findFirstOrThrow({ where: { product_id: product.id } });
  const table = await createTable(owner.restaurantId);
  const publish = async () => {
    const res = await api()
      .post("/api/v1/menu/publications")
      .set(auth(owner.token))
      .send({ expected_draft_version: (await getDraft()).draft_version });
    if (![200, 201].includes(res.status)) throw new Error(`Publicação: ${JSON.stringify(res.body)}`);
    return res.body.publication_id as string;
  };
  const publicationId = await publish();
  await api()
    .patch("/api/v1/ordering-settings")
    .set(auth(owner.token))
    .send({ expected_version: 1, customer_ordering_enabled: true });
  const scan = await api().post(`/api/v1/public/tables/${table.public_code}/scan`);
  if (scan.status !== 201) throw new Error(`Scan: ${JSON.stringify(scan.body)}`);
  const deviceToken = scan.body.token as string;
  const submission = (quantity = 1) => ({
    submission_key: randomUUID(),
    publication_id: publicationId,
    items: [
      {
        product_id: product.id,
        variant_id: variant.id,
        quantity,
        selections: [] as { option_id: string; quantity: number }[],
      },
    ],
  });
  return {
    ...owner,
    category,
    product,
    variant,
    table,
    getDraft,
    publish,
    publicationId,
    deviceToken,
    submission,
  };
}
export async function categoryToken(restaurantId: string, category: staff_category) {
  const email = `${randomUUID()}@teste.com`;
  const user = await prisma.users.create({
    data: {
      name: category,
      restaurant_id: restaurantId,
      email,
      password_hash: await passwordHash("senha-forte-123"),
      role: "STAFF",
      category,
    },
  });
  const login = await api().post("/api/v1/auth/login").send({ email, password: "senha-forte-123" });
  const token = cookieOf(login, "access_token");
  if (!token) throw new Error("Cookie ausente no login do funcionário");
  return { user, token };
}
