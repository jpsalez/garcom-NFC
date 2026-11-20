import { z } from "zod";
import {
  cashMovementSchema,
  cashShiftsQuery,
  closeCashShiftSchema,
  openCashShiftSchema,
} from "../modules/cash-shifts/cash-shifts.schemas.ts";
import { posSubmitSchema } from "../modules/orders/orders.schemas.ts";

import {
  createPaymentSchema,
  refundPaymentSchema,
  resolvePointPaymentSchema,
} from "../modules/payments/payments.schemas.ts";
import { createTerminalSchema, updateTerminalSchema } from "../modules/payments/terminals.schemas.ts";
import {
  alertsQuery,
  forecastQuery,
  historyQuery,
  rangeQuery,
  rebuildSchema,
  summaryQuery,
} from "../modules/reports/reports.schemas.ts";
import {
  restaurantSettingsPatchSchema,
  restaurantSettingsSchema,
} from "../modules/restaurants/restaurant-settings.schema.ts";
import { guestSchema, paymentRequestSchema } from "../modules/tabs/payment-requests.schemas.ts";
import {
  cancelTabSchema,
  closeTabSchema,
  listTabsQuery,
  mergeTabSchema,
  openTabSchema,
  tabAdjustmentSchema,
  transferTabSchema,
  updateTabSchema,
  waiveFeeSchema,
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

function queryOf(schema: z.ZodType) {
  const { properties = {}, required = [] } = z.toJSONSchema(schema, { io: "input" });
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: "query",
    required: required.includes(name),
    schema: property,
  }));
}
const reportErrors = {
  400: { description: "VALIDATION_ERROR (período inválido ou acima do limite)" },
  401: settingsResponses[401],
  403: { description: "Somente OWNER e MANAGER (reports:read)" },
};
function report(summary: string, schema: z.ZodType) {
  return {
    get: {
      ...pdvAccess,
      summary,
      parameters: queryOf(schema),
      responses: { ...reportErrors, 200: { description: summary } },
    },
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

const deviceAccess = { ...pdvAccess, security: [{ tableToken: [] }] };

const cashShiftErrors = {
  400: tabErrors[400],
  401: tabErrors[401],
  403: { description: "Operação exige cash_shift:operate" },
  404: { description: "Turno de caixa não encontrado no escopo do operador" },
  409: { description: "Turno já aberto ou encerrado, ou saldo insuficiente" },
};
const cashShiftQueryParameters = Object.entries(
  z.toJSONSchema(cashShiftsQuery, { io: "input" }).properties ?? {},
).map(([name, schema]) => ({ name, in: "query", schema }));

const pointEnvironment = {
  name: "environment",
  in: "query",
  schema: { type: "string", enum: ["SANDBOX", "PRODUCTION"], default: "SANDBOX" },
};
const pointErrors = {
  ...tabErrors,
  404: { description: "Terminal não encontrado no restaurante autenticado" },
  502: { description: "PROVIDER_UNAVAILABLE" },
  503: { description: "Credenciais indisponíveis" },
};

export const pdvPaths = {
  "/payment-providers/mercado-pago/oauth/url": {
    get: {
      ...pdvAccess,
      summary: "Gera URL OAuth para o restaurante autenticado",
      parameters: [pointEnvironment],
      responses: { ...pointErrors, 200: { description: "URL no campo url" } },
    },
  },
  "/payment-providers/mercado-pago/oauth/callback": {
    get: {
      ...pdvAccess,
      summary: "Vincula a conta Point usando state e código OAuth",
      parameters: ["code", "state"].map((name) => ({
        name,
        in: "query",
        required: true,
        schema: { type: "string" },
      })),
      responses: { ...pointErrors, 200: { description: "Conta vinculada sem credenciais na resposta" } },
    },
  },
  "/payment-terminals/sync": {
    post: {
      ...pdvAccess,
      summary: "Sincroniza os terminais em modo PDV da conta do restaurante",
      parameters: [pointEnvironment],
      responses: { ...pointErrors, 200: { description: "Terminais no campo terminals" } },
    },
  },
  "/payment-terminals": {
    get: {
      ...pdvAccess,
      summary: "Lista terminais Point do restaurante",
      responses: { ...pointErrors, 200: { description: "Terminais no campo terminals" } },
    },
    post: {
      ...pdvAccess,
      summary: "Cadastra um terminal PDV da conta Point com um rótulo",
      requestBody: tabBody(createTerminalSchema),
      responses: { ...pointErrors, 201: { description: "Terminal cadastrado" } },
    },
  },
  "/payment-terminals/{id}": {
    get: {
      ...pdvAccess,
      summary: "Consulta terminal do restaurante",
      parameters: [tabId],
      responses: { ...pointErrors, 200: { description: "Terminal no campo terminal" } },
    },
    patch: {
      ...pdvAccess,
      summary: "Altera rótulo ou disponibilidade do terminal",
      parameters: [tabId],
      requestBody: tabBody(updateTerminalSchema),
      responses: { ...pointErrors, 200: { description: "Terminal atualizado" } },
    },
    delete: {
      ...pdvAccess,
      summary: "Desativa terminal sem remover histórico de pagamento",
      parameters: [tabId],
      responses: { ...pointErrors, 204: { description: "Terminal desativado" } },
    },
  },
  "/webhooks/payments/mercado-pago": {
    post: {
      tags: ["PDV"],
      security: [],
      summary: "Recebe notificação Point assinada e consulta a Orders API",
      parameters: [
        { name: "data.id", in: "query", required: true, schema: { type: "string" } },
        ...["x-request-id", "x-signature"].map((name) => ({
          name,
          in: "header",
          required: true,
          schema: { type: "string" },
        })),
      ],
      responses: {
        200: { description: "Notificação autenticada" },
        401: { description: "INVALID_WEBHOOK_SIGNATURE" },
        502: pointErrors[502],
        503: pointErrors[503],
      },
    },
  },
  "/cash-shifts": {
    get: {
      ...pdvAccess,
      summary: "Lista turnos do restaurante. CASHIER consulta apenas os próprios turnos",
      parameters: cashShiftQueryParameters,
      responses: { ...cashShiftErrors, 200: { description: "Lista no campo shifts" } },
    },
  },
  "/cash-shifts/current": {
    get: {
      ...pdvAccess,
      summary: "Consulta o turno aberto do operador autenticado",
      responses: {
        ...cashShiftErrors,
        200: { description: "shift com movimentos e totais por meio, ou null" },
      },
    },
  },
  "/cash-shifts/{id}": {
    get: {
      ...pdvAccess,
      summary: "Consulta o saldo, os movimentos e os totais por meio de pagamento do turno",
      parameters: [tabId],
      responses: { ...cashShiftErrors, 200: { description: "Turno detalhado no campo shift" } },
    },
  },
  "/cash-shifts/open": {
    post: {
      ...pdvAccess,
      summary: "Abre o turno do operador com o valor inicial informado",
      requestBody: tabBody(openCashShiftSchema),
      responses: { ...cashShiftErrors, 201: { description: "Turno aberto no campo shift" } },
    },
  },
  "/cash-shifts/{id}/movements": {
    post: {
      ...pdvAccess,
      summary: "Registra sangria ou suprimento em um turno aberto",
      parameters: [tabId],
      requestBody: tabBody(cashMovementSchema),
      responses: { ...cashShiftErrors, 201: { description: "Turno atualizado no campo shift" } },
    },
  },
  "/cash-shifts/{id}/close": {
    post: {
      ...pdvAccess,
      summary: "Fecha o turno e apura a diferença entre o valor contado e o esperado",
      parameters: [tabId],
      requestBody: tabBody(closeCashShiftSchema),
      responses: { ...cashShiftErrors, 200: { description: "Turno encerrado no campo shift" } },
    },
  },
  "/tabs/{id}/pre-bill": {
    post: {
      ...pdvAccess,
      summary: "Emite pré-conta e calcula divisão igual em centavos quando solicitada",
      parameters: [
        tabId,
        { name: "split_by", in: "query", schema: { type: "integer", minimum: 2, maximum: 100 } },
      ],
      responses: { ...tabErrors, 200: { description: "tab detalhada e equal_split_preview opcional" } },
    },
  },
  "/tabs/{id}/close": {
    post: tabMutation("Fecha comanda quitada e encerra as sessões vinculadas", closeTabSchema),
  },
  "/tabs/{id}/cancel": {
    post: tabMutation("Cancela comanda sem pagamentos ativos e retira os itens da fila", cancelTabSchema),
  },
  "/tabs/{id}/adjustments": {
    post: {
      ...tabMutation("Aplica desconto, couvert ou gorjeta com motivo", tabAdjustmentSchema),
      responses: { ...tabErrors, 201: { description: "Ajuste e comanda atualizada" } },
    },
  },
  "/tabs/{id}/service-fee/waive": {
    post: tabMutation("Remove ou restaura a taxa de serviço com motivo", waiveFeeSchema),
  },
  "/tabs/{id}/payments": {
    post: {
      ...tabMutation("Registra pagamento manual ou reserva valor para cobrança Point", createPaymentSchema),
      responses: {
        ...tabErrors,
        200: { description: "Pagamento já registrado para a chave, com replayed=true" },
        201: { description: "Pagamento manual confirmado, tab e indicação de fechamento automático" },
        202: { description: "Cobrança Point reservada, aguardando resultado ou confirmação" },
        502: pointErrors[502],
        503: pointErrors[503],
      },
    },
  },
  "/tabs/{id}/payments/{paymentId}/refund": {
    post: {
      ...tabMutation(
        "Estorna pagamento manual. Comanda fechada exige o mesmo dia operacional",
        refundPaymentSchema,
      ),
      parameters: [tabId, { ...tabId, name: "paymentId" }],
      responses: { ...tabErrors, 200: { description: "Pagamento estornado e comanda atualizada" } },
    },
  },
  "/tabs/{id}/payments/{paymentId}/resolve": {
    post: {
      ...tabMutation(
        "Confere cobrança Point sem retorno após 11 min: NOT_CHARGED libera a reserva; CHARGED vincula a order após consulta ao Mercado Pago",
        resolvePointPaymentSchema,
      ),
      parameters: [tabId, { ...tabId, name: "paymentId" }],
      responses: {
        ...tabErrors,
        200: { description: "Cobrança conferida e comanda atualizada" },
        502: { description: "Mercado Pago indisponível ou order não corresponde à cobrança" },
      },
    },
  },
  "/public/table-session/guest": {
    patch: {
      ...deviceAccess,
      summary: "Define ou limpa o apelido do aparelho autenticado",
      requestBody: tabBody(guestSchema),
      responses: {
        200: { description: "guest_label atualizado" },
        400: tabErrors[400],
        401: tabErrors[401],
        429: { description: "Limite por aparelho" },
      },
    },
  },
  "/public/tab": {
    get: {
      ...deviceAccess,
      summary: "Consulta a comanda NFC, os pedidos da mesa e a solicitação do próprio aparelho",
      responses: {
        200: { description: "tab com pedidos, ou tab nula quando ainda não há comanda" },
        401: tabErrors[401],
      },
    },
  },
  "/public/tab/payment-requests": {
    post: {
      ...deviceAccess,
      summary: "Solicita pagamento por pedido próprio, item ou valor",
      requestBody: tabBody(paymentRequestSchema),
      responses: {
        ...tabErrors,
        201: { description: "payment_request criada" },
        429: { description: "Limite por aparelho" },
      },
    },
  },
  "/public/tab/payment-requests/{id}": {
    delete: {
      ...deviceAccess,
      summary: "Cancela solicitação aberta do próprio aparelho",
      parameters: [tabId],
      responses: {
        ...tabErrors,
        204: { description: "Solicitação cancelada" },
        429: { description: "Limite por aparelho" },
      },
    },
  },
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
  "/reports/sales/summary": report("KPIs do período com mix de pagamentos e comparação", summaryQuery),
  "/reports/sales/history": report("Série diária, semanal ou mensal por dia operacional", historyQuery),
  "/reports/products/abc": report("Ranking de produtos com curva ABC", rangeQuery),
  "/reports/products/basket": report("Pares de produtos vendidos juntos na mesma comanda", rangeQuery),
  "/reports/heatmap": report("Itens e receita por dia da semana e hora local", rangeQuery),
  "/reports/kitchen/prep-time": report("Tempo médio e p90 até o primeiro item pronto", rangeQuery),
  "/reports/forecasts/demand": report("Previsão de demanda por produto (WMA sazonal)", forecastQuery),
  "/reports/forecasts/alerts": report("Alertas de anomalia do dia operacional", alertsQuery),
  "/reports/rebuild": {
    post: {
      ...pdvAccess,
      summary: "Reconstrói os agregados do período a partir das comandas fechadas (somente OWNER)",
      requestBody: tabBody(rebuildSchema),
      responses: { ...reportErrors, 200: { description: "Período e dias com venda reconstruídos" } },
    },
  },
};
