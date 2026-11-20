import { z } from "zod";
import {
  pairingCodeSchema,
  printingPairSchema,
  printingSettingsSchema,
  printAgentCredentialSchema,
} from "../modules/printing/printing.schemas.ts";

const tag = ["Impressão"];
const cookie = [{ cookieAuth: [] }];
const kitchen = { type: "string", enum: ["KITCHEN"] };
const dateTime = { type: "string", format: "date-time" };
const status = {
  type: "object",
  required: ["destination", "enabled", "paired", "last_contact_at"],
  properties: {
    destination: kitchen,
    enabled: { type: "boolean" },
    paired: { type: "boolean" },
    last_contact_at: { ...dateTime, nullable: true },
  },
};
const json = <T extends object>(schema: T) => ({ "application/json": { schema } });
const schemaFor = (schema: z.ZodType) => z.toJSONSchema(schema, { io: "input", target: "openapi-3.0" });
const body = (schema: z.ZodType) => ({
  required: true,
  content: json(schemaFor(schema)),
});
const errors = {
  400: { description: "VALIDATION_ERROR" },
  401: { description: "Credencial ausente, inválida, expirada ou revogada" },
  403: { description: "Operação restrita a OWNER e MANAGER do restaurante" },
  503: { description: "Falha transacional temporária" },
};
const stateResponse = { description: "Estado da impressão da cozinha", content: json(status) };

export const printingPaths = {
  "/printing/kitchen": {
    get: {
      tags: tag,
      summary: "Consulta o estado da impressão da cozinha do restaurante autenticado",
      security: cookie,
      responses: { 200: stateResponse, 401: errors[401], 403: errors[403] },
    },
    patch: {
      tags: tag,
      summary: "Ativa ou pausa a impressão automática para pedidos novos",
      description: "A ativação exige pareamento. A pausa mantém o pareamento e as comandas existentes.",
      security: cookie,
      requestBody: body(printingSettingsSchema),
      responses: {
        200: stateResponse,
        ...errors,
        409: { description: "PRINT_AGENT_NOT_PAIRED" },
      },
    },
  },
  "/printing/kitchen/pairing": {
    post: {
      tags: tag,
      summary: "Emite código de uso único válido por 10 minutos",
      description: "Substitui o código anterior. O código em texto é devolvido apenas nesta resposta.",
      security: cookie,
      responses: {
        201: {
          description: "Código de pareamento",
          content: json({
            type: "object",
            required: ["code", "expires_at"],
            properties: { code: schemaFor(pairingCodeSchema), expires_at: dateTime },
          }),
        },
        ...errors,
      },
    },
    delete: {
      tags: tag,
      summary: "Revoga credencial e código pendente e pausa a impressão",
      security: cookie,
      responses: {
        204: { description: "Pareamento removido e último contato limpo" },
        ...errors,
      },
    },
  },
  "/print-agent/pair": {
    post: {
      tags: tag,
      summary: "Troca o código de uso único pela credencial do agente",
      description: "A troca revoga a credencial anterior, registra contato e deixa a impressão pausada.",
      security: [],
      requestBody: body(printingPairSchema),
      responses: {
        201: {
          description: "Credencial do agente, devolvida apenas nesta resposta",
          content: json({
            type: "object",
            required: ["destination", "credential"],
            properties: { destination: kitchen, credential: schemaFor(printAgentCredentialSchema) },
          }),
        },
        400: errors[400],
        401: { description: "Código expirado, desconhecido ou já usado" },
        429: { description: "Limite de tentativas por IP" },
        503: errors[503],
      },
    },
  },
  "/print-agent/contact": {
    post: {
      tags: tag,
      summary: "Atualiza o último contato do agente, inclusive durante a pausa",
      security: [{ printAgentToken: [] }],
      responses: {
        204: { description: "Contato registrado" },
        401: errors[401],
        503: errors[503],
      },
    },
  },
};
