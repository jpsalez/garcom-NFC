import { z } from "zod";
import {
  availabilitySchema,
  createEntitySchemas,
  identitySchema,
  imagesSchema,
  publishSchema,
  reorderSchema,
  unpublishSchema,
  updateEntitySchemas,
  variantGroupsSchema,
} from "../modules/menu/menu.schemas.ts";
import {
  deviceOrdersQuery,
  eventsQuery,
  ordersQuery,
  settingsSchema,
  submitSchema,
  transitionsSchema,
} from "../modules/orders/orders.schemas.ts";
type Guard = "staff" | "table" | "public";
function operation(
  summary: string,
  guard: Guard = "staff",
  body?: z.ZodType,
  success = 200,
  params: string[] = [],
  query?: z.ZodType,
) {
  const schema = query ? z.toJSONSchema(query, { io: "input" }) : undefined;
  const properties = (schema?.properties ?? {}) as Record<string, object>;
  return {
    tags: ["Cardápio e pedidos"],
    summary,
    security: guard === "public" ? [] : guard === "table" ? [{ tableToken: [] }] : [{ cookieAuth: [] }],
    parameters: [
      ...params.map((name) => ({
        name,
        in: "path",
        required: true,
        schema:
          name === "slug" || name === "code"
            ? { type: "string" }
            : name === "variant"
              ? { type: "string", enum: ["main", "thumb"] }
              : { type: "string", format: "uuid" },
      })),
      ...Object.entries(properties).map(([name, value]) => ({ name, in: "query", schema: value })),
    ],
    ...(body
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: z.toJSONSchema(body, { io: "input" }) } },
          },
        }
      : {}),
    responses: {
      [success]: { description: "Sucesso; DTOs e exemplos em docs/menu/API.md" },
      ...(success === 201
        ? { 200: { description: "Envio ou publicação já confirmados (replayed=true)" } }
        : {}),
      400: { description: "VALIDATION_ERROR" },
      401: { description: "Token inválido/expirado" },
      403: { description: "Capacidade insuficiente" },
      404: { description: "Recurso não encontrado no restaurante/contexto" },
      409: { description: "Versão desatualizada, indisponibilidade ou conflito de estado" },
      413: { description: "Limite de tamanho excedido" },
      429: { description: "Limite de requisições" },
      503: { description: "Falha transitória; repetir envio com mesma chave" },
    },
  };
}
type PathItem = Record<string, ReturnType<typeof operation> | object>;
export const menuPaths: Record<string, PathItem> = {
  "/menu/draft": {
    get: operation("Rascunho completo (OWNER/MANAGER)"),
    patch: operation("Edita identidade do rascunho", "staff", identitySchema),
  },
  "/menu/preview": { get: operation("Prévia privada; não cria pedido") },
  "/menu/order": { put: operation("Reordena todos os irmãos ativos de uma coleção", "staff", reorderSchema) },
  "/menu/publications": {
    post: operation("Publica revisão validada; OWNER/MANAGER", "staff", publishSchema, 201),
  },
  "/menu/unpublish": { post: operation("Retira publicação sem cancelar pedidos", "staff", unpublishSchema) },
  "/menu/availability": {
    patch: operation(
      "Disponibilidade operacional; OWNER/MANAGER/WAITER/KITCHEN",
      "staff",
      availabilitySchema,
    ),
  },
  "/menu/variants/{id}/option-groups": {
    put: operation("Substitui grupos da variante", "staff", variantGroupsSchema, 200, ["id"]),
  },
  "/menu/products/{id}/images": {
    put: operation("Substitui imagens ordenadas do produto", "staff", imagesSchema, 200, ["id"]),
  },
  "/public/restaurants/{slug}/menu": {
    get: operation("Cardápio publicado; não abre atendimento", "public", undefined, 200, ["slug"]),
  },
  "/public/tables/{code}/menu": {
    get: operation("Cardápio da mesa; não abre atendimento", "public", undefined, 200, ["code"]),
  },
  "/ordering-settings": {
    get: operation("Consulta habilitação de pedidos; OWNER/MANAGER"),
    patch: operation("Habilita/desabilita novos pedidos imediatamente", "staff", settingsSchema),
  },
  "/orders": {
    get: operation("Fila persistente por mesa/período/andamento", "staff", undefined, 200, [], ordersQuery),
  },
  "/orders/{id}": { get: operation("Pedido administrativo", "staff", undefined, 200, ["id"]) },
  "/orders/{id}/events": {
    get: operation("Auditoria paginada por sequência", "staff", undefined, 200, ["id"], eventsQuery),
  },
  "/orders/{id}/transitions": {
    post: operation(
      "Lote atômico de preparo/entrega/cancelamento com versão esperada",
      "staff",
      transitionsSchema,
      200,
      ["id"],
    ),
  },
  "/public/orders": {
    post: operation("Envia pedido idempotente com token de mesa", "table", submitSchema, 201),
    get: operation(
      "Somente pedidos enviados pelo token atual",
      "table",
      undefined,
      200,
      [],
      deviceOrdersQuery,
    ),
  },
  "/public/orders/{id}": {
    get: operation("Pedido do próprio aparelho na sessão ativa", "table", undefined, 200, ["id"]),
  },
  "/public/table-context": { get: operation("Verifica contexto e can_order; não emite token", "table") },
  "/media/{id}": { delete: operation("Exclui mídia sem referências", "staff", undefined, 204, ["id"]) },
  "/media/{id}/{variant}": {
    get: operation("Imagem privada do restaurante; OWNER/MANAGER", "staff", undefined, 200, [
      "id",
      "variant",
    ]),
  },
  "/public/media/{id}/{variant}": {
    get: operation("Imagem da publicação atual; cache até 5 minutos", "public", undefined, 200, [
      "id",
      "variant",
    ]),
  },
  "/media": {
    post: {
      ...operation("Upload JPEG/PNG/WebP até 8 MiB; OWNER/MANAGER", "staff", undefined, 201),
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["file"],
              properties: { file: { type: "string", format: "binary" } },
              additionalProperties: false,
            },
          },
        },
      },
    },
  },
};
for (const [kind, createPath, updatePath, params] of [
  ["categories", "/menu/categories", "/menu/categories/{id}", []],
  ["products", "/menu/products", "/menu/products/{id}", []],
  ["variants", "/menu/products/{productId}/variants", "/menu/variants/{id}", ["productId"]],
  ["groups", "/menu/products/{productId}/option-groups", "/menu/option-groups/{id}", ["productId"]],
  ["options", "/menu/option-groups/{groupId}/options", "/menu/options/{id}", ["groupId"]],
] as const) {
  menuPaths[createPath] = {
    post: operation(`Cria ${kind}; incrementa draft_version`, "staff", createEntitySchemas[kind], 201, [
      ...params,
    ]),
  };
  menuPaths[updatePath] = {
    patch: operation(
      `Edita/arquiva/restaura ${kind}; incrementa draft_version`,
      "staff",
      updateEntitySchemas[kind],
      200,
      ["id"],
    ),
  };
}
