import { z } from "zod";
import {
  restaurantSettingsPatchSchema,
  restaurantSettingsSchema,
} from "../modules/restaurants/restaurant-settings.schema.ts";

import { posSubmitSchema } from "../modules/orders/orders.schemas.ts";
import {
  listTabsQuery,
  mergeTabSchema,
  openTabSchema,
  transferTabSchema,
  updateTabSchema,
} from "../modules/tabs/tabs.schemas.ts";

const pdvAccess = {
  tags: ["PDV"],
  security: [{ cookieAuth: [] }],
};
const settingsResponses = {
  200: {
    description: "Configuração do restaurante autenticado",
    content: { "application/json": { schema: z.toJSONSchema(restaurantSettingsSchema) } },
  },
  401: { description: "Token ausente ou inválido" },
  403: { description: "Operação restrita a OWNER e MANAGER" },
  404: { description: "Restaurante ativo não encontrado" },
};

const queryParameters = Object.entries(z.toJSONSchema(listTabsQuery, { io: "input" }).properties ?? {}).map(
  ([name, schema]) => ({
    name,
    in: "query",
    schema,
  }),
);
const tabId = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
const tabErrors = {
  400: { description: "VALIDATION_ERROR" },
  401: settingsResponses[401],
  403: { description: "Capacidade insuficiente" },
  404: { description: "TAB_NOT_FOUND ou TABLE_NOT_FOUND" },
  409: { description: "Conflito de estado, de versão ou de idempotência" },
};
function tabBody(schema: z.ZodType) {
  return {
    required: true,
    content: { "application/json": { schema: z.toJSONSchema(schema, { io: "input" }) } },
  };
}
function tabMutation(summary: string, schema: z.ZodType) {
  return {
    ...pdvAccess,
    summary,
    parameters: [tabId],
    requestBody: tabBody(schema),
    responses: { ...tabErrors, 200: { description: "Comanda atualizada no campo tab" } },
  };
}

export const posOrderOperation = {
  ...pdvAccess,
  summary: "Envia pedido pelo PDV com a capability orders:create",
  description:
    "Informe exatamente um entre tab_id e table_id. O corpo da resposta contém order, tab e replayed.",
  requestBody: tabBody(posSubmitSchema),
  responses: {
    ...tabErrors,
    200: { description: "Pedido já confirmado, com replayed=true" },
    201: { description: "Pedido confirmado, com replayed=false" },
  },
};

export const pdvPaths = {
  "/tabs": {
    get: {
      ...pdvAccess,
      summary: "Lista as comandas do restaurante com paginação por cursor",
      parameters: queryParameters,
      responses: { ...tabErrors, 200: { description: "tabs, nextCursor e serverTime" } },
    },
    post: {
      ...pdvAccess,
      summary: "Abre uma comanda de mesa ou balcão",
      requestBody: tabBody(openTabSchema),
      responses: { ...tabErrors, 201: { description: "Comanda criada no campo tab" } },
    },
  },
  "/tabs/{id}": {
    get: {
      ...pdvAccess,
      summary: "Consulta a comanda, seus pedidos e o consumo por aparelho",
      parameters: [tabId],
      responses: { ...tabErrors, 200: { description: "Comanda detalhada no campo tab" } },
    },
    patch: tabMutation("Altera nome ou quantidade de pessoas com versão esperada", updateTabSchema),
  },
  "/tabs/{id}/transfer-table": {
    post: tabMutation("Transfere a comanda e sua sessão principal a uma mesa livre", transferTabSchema),
  },
  "/tabs/{id}/merge": {
    post: tabMutation("Reúne os pedidos e sessões da origem na comanda de destino", mergeTabSchema),
  },
  "/restaurant/settings": {
    get: {
      ...pdvAccess,
      summary: "Consulta a configuração do restaurante (OWNER ou MANAGER)",
      responses: settingsResponses,
    },
    patch: {
      ...pdvAccess,
      summary: "Atualiza fuso, corte do dia operacional ou taxa de serviço (OWNER ou MANAGER)",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              ...z.toJSONSchema(restaurantSettingsPatchSchema, { io: "input" }),
              minProperties: 1,
            },
          },
        },
      },
      responses: { ...settingsResponses, 400: { description: "VALIDATION_ERROR" } },
    },
  },
};
