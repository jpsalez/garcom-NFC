import { z } from "zod";
import { createRestaurantSchema, setActiveSchema } from "../modules/administration/administration.schema.ts";
import { createUserSchema, loginUserSchema } from "../modules/auth/auth.schema.ts";
import { createTableSchema, updateTableSchema } from "../modules/tables/tables.schemas.ts";
import { createRestaurantUserSchema, createStaffSchema, updateUserSchema } from "../modules/users/users.schema.ts";

type Options = {
  tag: string;
  summary: string;
  success?: number;
  body?: z.ZodType;
  auth?: boolean;
  params?: string[];
};

const uuidParam = (name: string) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
});

// Corpo vem do próprio schema Zod: a documentação não sai de sincronia com a validação
function operation({ tag, summary, success = 200, body, auth = true, params = [] }: Options) {
  const responses: Record<string, { description: string }> = {
    [success]: { description: "Sucesso" },
    400: { description: "Dados inválidos" },
  };
  if (auth) {
    responses[401] = { description: "Token ausente ou inválido" };
    responses[403] = { description: "Sem permissão para este papel" };
  }
  return {
    tags: [tag],
    summary,
    ...(auth && { security: [{ bearerAuth: [] }] }),
    ...(params.length && { parameters: params.map(uuidParam) }),
    ...(body && {
      requestBody: {
        required: true,
        content: { "application/json": { schema: z.toJSONSchema(body, { io: "input" }) } },
      },
    }),
    responses,
  };
}

const restaurantUsers = "/admin/restaurants/{restaurantId}/users";

export const openApiSpec = {
  openapi: "3.0.3",
  servers: [{ url: "/api/v1" }],
  info: {
    title: "garcom-NFC API",
    version: "1.0.0",
    description:
      "SaaS multi-restaurante: o cliente chama o garçom ou pede a conta por QR/NFC. " +
      "Faça login em /auth/login e use o token em Authorize (o restaurantId vem do token).",
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
  },
  paths: {
    "/health": { get: operation({ tag: "Sistema", summary: "Verifica se a API está no ar", auth: false }) },
    "/auth/register": {
      post: operation({ tag: "Auth", summary: "Cadastra restaurante e dono", success: 201, body: createUserSchema, auth: false }),
    },
    "/auth/login": {
      post: operation({ tag: "Auth", summary: "Login (retorna token e usuário)", body: loginUserSchema, auth: false }),
    },
    "/admin/restaurants": {
      get: operation({ tag: "Administração (SUPER_ADMIN)", summary: "Lista restaurantes" }),
      post: operation({ tag: "Administração (SUPER_ADMIN)", summary: "Cria restaurante", success: 201, body: createRestaurantSchema }),
    },
    "/admin/restaurants/{restaurantId}": {
      patch: operation({ tag: "Administração (SUPER_ADMIN)", summary: "Ativa ou desativa restaurante", body: setActiveSchema, params: ["restaurantId"] }),
    },
    [restaurantUsers]: {
      get: operation({ tag: "Administração (SUPER_ADMIN)", summary: "Lista usuários do restaurante", params: ["restaurantId"] }),
      post: operation({ tag: "Administração (SUPER_ADMIN)", summary: "Cria usuário (OWNER ou STAFF); 409 se o restaurante estiver desativado", success: 201, body: createRestaurantUserSchema, params: ["restaurantId"] }),
    },
    [`${restaurantUsers}/{id}`]: {
      patch: operation({ tag: "Administração (SUPER_ADMIN)", summary: "Atualiza usuário", body: updateUserSchema, params: ["restaurantId", "id"] }),
      delete: operation({ tag: "Administração (SUPER_ADMIN)", summary: "Remove usuário", success: 204, params: ["restaurantId", "id"] }),
    },
    "/staff": {
      get: operation({ tag: "Equipe (OWNER)", summary: "Lista a equipe do restaurante" }),
      post: operation({ tag: "Equipe (OWNER)", summary: "Cria funcionário (STAFF)", success: 201, body: createStaffSchema }),
    },
    "/staff/{id}": {
      patch: operation({ tag: "Equipe (OWNER)", summary: "Atualiza funcionário", body: updateUserSchema, params: ["id"] }),
      delete: operation({ tag: "Equipe (OWNER)", summary: "Remove funcionário", success: 204, params: ["id"] }),
    },
    "/tables": {
      get: operation({ tag: "Mesas", summary: "Lista mesas (OWNER ou STAFF)" }),
      post: operation({ tag: "Mesas", summary: "Cria mesa (OWNER)", success: 201, body: createTableSchema }),
    },
    "/tables/{id}": {
      patch: operation({ tag: "Mesas", summary: "Atualiza mesa (OWNER)", body: updateTableSchema, params: ["id"] }),
      delete: operation({ tag: "Mesas", summary: "Exclui mesa sem atendimentos; com histórico dá 409 (OWNER)", success: 204, params: ["id"] }),
    },
    "/tables/{id}/qrcode": {
      get: operation({ tag: "Mesas", summary: "QR Code da mesa em SVG; reativa a mesa se estiver inativa (OWNER)", params: ["id"] }),
    },
  },
};
