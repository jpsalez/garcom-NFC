import { z } from "zod";
import {
  browserStationResultSchema,
  browserStationSetupSchema,
  browserTestConfirmSchema,
  cloudPollSchema,
  printingPatchSchema,
  printingJobsQuery,
  reprintSchema,
  printerCredentialSchema,
} from "../modules/printing/printing.schemas.ts";

const tag = ["Impressão"];
const cookie = [{ cookieAuth: [] }];
const printer = [{ cloudPrinterAuth: [] }];
const station = [{ printStationCookie: [] }];
const mode = { type: "string", enum: ["CLOUDPRNT", "BROWSER"] };
const paperWidth = { type: "integer", enum: [58, 80] };
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
  required: ["destination", "enabled", "paired", "last_contact_at", "test_status", "mode", "paper_width", "test_confirmed", "test_id"],
  properties: {
    destination: kitchen,
    enabled: { type: "boolean" },
    paired: { type: "boolean" },
    last_contact_at: { ...dateTime, nullable: true },
    test_status: { type: "string", nullable: true },
    mode,
    paper_width: paperWidth,
    test_confirmed: { type: "boolean" },
    test_id: nullable(uuid),
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
  delivery_mode: nullable(mode),
  order_version: nullable(integer),
  attempts: integer,
  next_attempt_at: nullable(dateTime),
  expires_at: nullable(dateTime),
  original_job_id: nullable(uuid),
  requested_by: nullable(uuid),
  reason: nullable(string),
  created_at: dateTime,
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
        "Use { enabled } para ativar ou pausar. A pausa retém pendências para revisão. Use { review: { job_ids, decision } } para liberar (RELEASE) ou descartar (DISCARD) comandas REVIEW_REQUIRED. Liberar exige contato da impressora nos últimos 5 minutos.",
      security: cookie,
      requestBody: body(printingPatchSchema),
      responses: {
        200: stateResponse,
        ...errors,
        409: { description: "PRINT_TEST_REQUIRED, PRINT_PRINTER_OFFLINE ou PRINT_REVIEW_CONFLICT" },
      },
    },
  },
  "/printing/kitchen/printer": {
    post: {
      tags: tag,
      summary: "Gera ou troca as credenciais da impressora CloudPRNT",
      security: cookie,
      responses: {
        201: {
          description: "Configuração; a senha só é devolvida nesta resposta",
          content: json(object({ url: string, username: string, password: schemaFor(printerCredentialSchema) })),
        },
        ...errors,
      },
    },
    delete: {
      tags: tag,
      summary: "Desconecta a impressora e pausa a impressão",
      security: cookie,
      responses: { 204: { description: "Credencial revogada" }, ...errors },
    },
  },
  "/printing/kitchen/test": {
    post: {
      tags: tag,
      summary: "Coloca uma via de teste na fila, inclusive durante a pausa",
      security: cookie,
      responses: { 200: stateResponse, ...errors, 409: { description: "PRINT_PRINTER_OFFLINE" } },
    },
  },
  "/printing/station/connect": {
    post: {
      tags: tag,
      summary: "Vincula o navegador atual e pausa o destino até validar a impressão",
      security: cookie,
      requestBody: body(browserStationSetupSchema),
      responses: { 204: { description: "Estação vinculada via cookie HttpOnly" }, ...errors },
    },
  },
  "/printing/station/verify-test": {
    post: {
      tags: tag,
      summary: "Confirma que a via de teste da estação saiu sem intervenção",
      security: cookie,
      requestBody: body(browserTestConfirmSchema),
      responses: { 200: stateResponse, ...errors, 409: { description: "PRINT_TEST_REQUIRED" } },
    },
  },
  "/printing/station/socket-ticket": {
    post: {
      tags: tag,
      summary: "Emite ingresso de um minuto para o namespace Socket.IO /print-station",
      security: station,
      responses: {
        200: { description: "Ingresso da estação", content: json(object({ ticket: string })) },
        401: errors[401],
      },
    },
  },
  "/printing/station/next": {
    post: {
      tags: tag,
      summary: "Reserva e entrega uma comanda de forma exclusiva à estação",
      security: station,
      responses: {
        200: { description: "Comanda reservada", content: json(object({
          token: uuid, paper_width: paperWidth, valid_for_ms: integer,
          document: { oneOf: [{ type: "string", enum: ["TEST"] }, { type: "object" }] },
        })) },
        204: { description: "Estação conectada, sem comanda disponível" },
        401: errors[401],
      },
    },
  },
  "/printing/station/result": {
    post: {
      tags: tag,
      summary: "Registra envio ao navegador ou resultado incerto",
      security: station,
      requestBody: body(browserStationResultSchema),
      responses: { 204: { description: "Resultado recebido" }, 401: errors[401] },
    },
  },
  "/printing/cloudprnt": {
    post: {
      tags: tag,
      summary: "A impressora consulta a fila CloudPRNT por HTTPS",
      security: printer,
      requestBody: body(cloudPollSchema),
      responses: {
        200: { description: "Disponibilidade, token e tipo da comanda", content: json({
          type: "object", required: ["jobReady"], properties: {
            jobReady: { type: "boolean" }, jobToken: uuid, mediaTypes: array(string), deleteMethod: string,
          },
        }) },
        401: errors[401],
      },
    },
    get: {
      tags: tag,
      summary: "Retorna a configuração HTTP ou baixa a comanda indicada pelo token",
      security: printer,
      parameters: [
        { name: "token", in: "query", schema: uuid },
        { name: "type", in: "query", schema: { type: "string", enum: ["image/png"] } },
      ],
      responses: {
        200: { description: "Configuração CloudPRNT ou comanda PNG", content: {
          "application/json": { schema: { type: "object" } },
          "image/png": { schema: { type: "string", format: "binary" } },
        } },
        401: errors[401],
        404: { description: "Comanda indisponível" },
        415: { description: "Formato incompatível" },
      },
    },
    delete: {
      tags: tag,
      summary: "Registra o resultado informado pela impressora",
      security: printer,
      parameters: [
        { name: "token", in: "query", required: true, schema: uuid },
        { name: "code", in: "query", required: true, schema: string },
      ],
      responses: { 200: { description: "Resultado recebido" }, 401: errors[401] },
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
