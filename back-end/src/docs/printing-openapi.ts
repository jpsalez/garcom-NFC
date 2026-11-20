import { z } from "zod";
import {
  pairingCodeSchema,
  printingPairSchema,
  printingPatchSchema,
  printClaimSchema,
  printResultSchema,
  printingJobsQuery,
  reprintSchema,
  printAgentCredentialSchema,
} from "../modules/printing/printing.schemas.ts";

const tag = ["Impressão"];
const cookie = [{ cookieAuth: [] }];
const agent = [{ printAgentToken: [] }];
const kitchen = { type: "string", enum: ["KITCHEN"] };
const string = { type: "string" };
const integer = { type: "integer" };
const uuid = { type: "string", format: "uuid" };
const idPath = { name: "id", in: "path", required: true, schema: uuid };
const nullable = <T extends object>(schema: T) => ({ ...schema, nullable: true });
const array = <T extends object>(items: T) => ({ type: "array", items });
const object = <T extends object>(properties: T) => ({
  type: "object",
  required: Object.keys(properties),
  properties,
});
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
const operatorErrors = {
  ...errors,
  403: { description: "Operação restrita a OWNER, MANAGER e KITCHEN do restaurante" },
};
const jobStatus = schemaFor(printingJobsQuery.shape.status.unwrap());
const job = object({
  id: uuid,
  order_id: uuid,
  destination: kitchen,
  status: jobStatus,
  order_version: nullable(integer),
  attempts: integer,
  next_attempt_at: nullable(dateTime),
  expires_at: nullable(dateTime),
  original_job_id: nullable(uuid),
  requested_by: nullable(uuid),
  reason: nullable(string),
  created_at: dateTime,
});
const payload = object({
  order_id: uuid,
  created_at: dateTime,
  table_label: string,
  items: array(
    object({
      item_id: uuid,
      product_name: string,
      variant_name: string,
      quantity: integer,
      notes: nullable(string),
      selections: array(object({ group_name: string, option_name: string, quantity: integer })),
    }),
  ),
});
const claimedJob = object({
  id: uuid,
  destination: kitchen,
  reservation_id: uuid,
  expires_at: dateTime,
  payload_version: integer,
  order_version: integer,
  payload: {
    ...payload,
    properties: {
      ...payload.properties,
      reprint: object({ label: { type: "string", enum: ["SEGUNDA VIA"] } }),
    },
  },
});
const queryParameter = (name: string, schema: z.ZodType) => ({
  name,
  in: "query",
  required: false,
  schema: schemaFor(schema),
});
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
      summary: "Ativa, pausa ou revisa comandas retidas para a cozinha",
      description:
        "Use { enabled } para ativar ou pausar. A pausa retém pendências para revisão. Use { review: { job_ids, decision } } para liberar (RELEASE) ou descartar (DISCARD) comandas REVIEW_REQUIRED. Liberar exige contato do agente nos últimos 5 minutos.",
      security: cookie,
      requestBody: body(printingPatchSchema),
      responses: {
        200: stateResponse,
        ...errors,
        409: { description: "PRINT_AGENT_NOT_PAIRED, PRINT_AGENT_OFFLINE ou PRINT_REVIEW_CONFLICT" },
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
      security: agent,
      responses: {
        204: { description: "Contato registrado" },
        401: errors[401],
        503: errors[503],
      },
    },
  },
  "/print-jobs/claim": {
    post: {
      tags: tag,
      summary: "Reserva uma comanda por destino por 30 segundos",
      description:
        "A comanda usa a versão vigente do pedido e exclui unidades canceladas. Verifique expires_at antes do envio. Comandas retidas para revisão ficam fora da reserva.",
      security: agent,
      requestBody: { ...body(printClaimSchema), required: false },
      responses: {
        200: { description: "Comanda reservada", content: json(claimedJob) },
        204: { description: "Fila sem trabalho elegível, pausada ou destino ocupado" },
        400: errors[400],
        401: errors[401],
        503: errors[503],
      },
    },
  },
  "/print-jobs/{id}/result": {
    post: {
      tags: tag,
      summary: "Registra o resultado da reserva",
      description:
        "SENT indica aceite pelo transporte. FAILED_BEFORE_SEND permite até três tentativas no total, com esperas de 5 e 10 segundos. Use UNCERTAIN quando o envio pode ter ocorrido. Repetir o mesmo resultado da reserva vigente retorna 204.",
      parameters: [idPath],
      security: agent,
      requestBody: body(printResultSchema),
      responses: {
        204: { description: "Resultado registrado ou repetido" },
        400: errors[400],
        401: errors[401],
        404: { description: "Comanda ausente no restaurante e destino do agente" },
        409: {
          description: "PRINT_RESERVATION_CONFLICT: reserva expirada ou substituída, ou resultado divergente",
        },
        503: errors[503],
      },
    },
  },
  "/print-jobs": {
    get: {
      tags: tag,
      summary: "Lista as comandas do restaurante",
      description:
        "Ordena por criação e ID decrescentes. Use next_cursor para a próxima página. SENDING vencido aparece como UNCERTAIN. REVIEW_REQUIRED exige revisão da equipe.",
      security: cookie,
      parameters: Object.entries(printingJobsQuery.shape).map(([name, schema]) =>
        queryParameter(name, schema),
      ),
      responses: {
        200: {
          description: "Página de comandas",
          content: json(object({ jobs: array(job), next_cursor: nullable(string), server_time: dateTime })),
        },
        ...operatorErrors,
      },
    },
  },
  "/orders/{id}/reprints": {
    post: {
      tags: tag,
      summary: "Solicita uma segunda via da comanda original",
      description:
        "A chave UUID identifica a solicitação por pedido e destino. Repetir chave, motivo e autor retorna a mesma comanda. Uma segunda via elegível carrega a marca SEGUNDA VIA.",
      parameters: [idPath],
      security: cookie,
      requestBody: body(reprintSchema),
      responses: {
        200: { description: "Solicitação repetida", content: json(job) },
        201: { description: "Segunda via criada", content: json(job) },
        ...operatorErrors,
        404: { description: "Pedido ou comanda original ausente no restaurante" },
        409: { description: "PRINT_REPRINT_KEY_CONFLICT, PRINT_ORDER_CANCELLED ou PRINT_ORIGINAL_PENDING" },
      },
    },
  },
};
