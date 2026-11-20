import { z } from "zod";
import {
  restaurantSettingsPatchSchema,
  restaurantSettingsSchema,
} from "../modules/restaurants/restaurant-settings.schema.ts";

const settingsAccess = {
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

export const pdvPaths = {
  "/restaurant/settings": {
    get: {
      ...settingsAccess,
      summary: "Consulta a configuração do restaurante (OWNER ou MANAGER)",
      responses: settingsResponses,
    },
    patch: {
      ...settingsAccess,
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
