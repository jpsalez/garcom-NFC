# PDV · 05 · Histórico de vendas, KPIs e Previsões — Especificação Técnica

> Fórmulas exatas, SQLs de agregação e consulta, contratos JSON de resposta e algoritmo numérico do motor de previsões.
> Todas as consultas filtram por `restaurant_id` vindo do JWT e usam `business_date` no fuso/corte do restaurante (`PDV-D09`).

---

## 1. Dia operacional (`business_date`) e hora local (`hour_bucket`)
Função utilitária no banco e em TypeScript (`back-end/src/modules/reports/business-date.ts`):
```sql
-- business_date (DATE):
DATE((ts AT TIME ZONE 'UTC' AT TIME ZONE r.timezone) - make_interval(mins => r.business_day_cutoff_minutes))

-- hour_bucket (0..23 no horário local do restaurante):
EXTRACT(HOUR FROM (ts AT TIME ZONE 'UTC' AT TIME ZONE r.timezone))::int
```
- **Exemplo (`America/Sao_Paulo`, `cutoff = 300` = `05:00`):**
  - Venda fechada sábado `01:40` local (`04:40` UTC) → `business_date = sexta-feira`, `hour_bucket = 1`.
- **Exemplo padrão (`cutoff = 0` = `00:00`):** calendário normal no fuso de Brasília.

---

## 2. Estratégia de agregação (`daily_sales` e `product_sales_daily`)

### 2.1 Atualização incremental no fechamento da comanda (`sign = +1`) ou estorno (`sign = -1`)
Chamada dentro do mesmo `unit.run` de `TabsService.close` (e revertida em caso de estorno/cancelamento pós-fechamento):
```sql
INSERT INTO daily_sales (
  restaurant_id, business_date, tabs_closed_count, table_tabs_count, counter_tabs_count,
  guests_total, gross_sales_cents, cancelled_items_cents, discounts_cents,
  service_fee_cents, couvert_cents, tips_cents, net_sales_cents,
  cash_cents, credit_cents, debit_cents, pix_cents, voucher_cents, other_cents,
  provider_fees_cents, total_stay_seconds, rebuilt_at
) VALUES ($1, $2, $3, ...)
ON CONFLICT (restaurant_id, business_date) DO UPDATE SET
  tabs_closed_count     = daily_sales.tabs_closed_count     + EXCLUDED.tabs_closed_count,
  table_tabs_count      = daily_sales.table_tabs_count      + EXCLUDED.table_tabs_count,
  counter_tabs_count    = daily_sales.counter_tabs_count    + EXCLUDED.counter_tabs_count,
  guests_total          = daily_sales.guests_total          + EXCLUDED.guests_total,
  gross_sales_cents     = daily_sales.gross_sales_cents     + EXCLUDED.gross_sales_cents,
  cancelled_items_cents = daily_sales.cancelled_items_cents + EXCLUDED.cancelled_items_cents,
  discounts_cents       = daily_sales.discounts_cents       + EXCLUDED.discounts_cents,
  service_fee_cents     = daily_sales.service_fee_cents     + EXCLUDED.service_fee_cents,
  couvert_cents         = daily_sales.couvert_cents         + EXCLUDED.couvert_cents,
  tips_cents            = daily_sales.tips_cents            + EXCLUDED.tips_cents,
  net_sales_cents       = daily_sales.net_sales_cents       + EXCLUDED.net_sales_cents,
  cash_cents            = daily_sales.cash_cents            + EXCLUDED.cash_cents,
  credit_cents          = daily_sales.credit_cents          + EXCLUDED.credit_cents,
  debit_cents           = daily_sales.debit_cents           + EXCLUDED.debit_cents,
  pix_cents             = daily_sales.pix_cents             + EXCLUDED.pix_cents,
  voucher_cents         = daily_sales.voucher_cents         + EXCLUDED.voucher_cents,
  other_cents           = daily_sales.other_cents           + EXCLUDED.other_cents,
  provider_fees_cents   = daily_sales.provider_fees_cents   + EXCLUDED.provider_fees_cents,
  total_stay_seconds    = daily_sales.total_stay_seconds    + EXCLUDED.total_stay_seconds,
  rebuilt_at            = now();
```
E o mesmo padrão `INSERT ... ON CONFLICT (restaurant_id, business_date, product_id, variant_id, hour_bucket) DO UPDATE` para `product_sales_daily` usando os itens dos pedidos da comanda fechada.

### 2.2 Reconciliação (`reports-reconciliation.job.ts`)
- Roda 1× por dia (e pode ser acionado por `POST /reports/rebuild` para `OWNER`) reconstruindo os últimos 7 `business_date` a partir de `tabs` + `orders` + `order_items` + `payments` dentro de transação por restaurante. Garante 0% de desvio acumulado.

---

## 3. Consultas SQL dos principais KPIs

### 3.1 Série histórica (Diário / Semanal / Mensal)
```sql
-- granularity = 'day' | 'week' | 'month'
SELECT
  date_trunc($2, business_date)::date AS bucket_date,
  SUM(tabs_closed_count)::int         AS tabs_closed,
  SUM(gross_sales_cents)::bigint      AS gross_sales_cents,
  SUM(discounts_cents)::bigint        AS discounts_cents,
  SUM(net_sales_cents)::bigint        AS net_sales_cents,
  SUM(provider_fees_cents)::bigint    AS provider_fees_cents,
  SUM(guests_total)::int              AS guests_total,
  SUM(cash_cents)::bigint             AS cash_cents,
  SUM(credit_cents)::bigint           AS credit_cents,
  SUM(debit_cents)::bigint            AS debit_cents,
  SUM(pix_cents)::bigint              AS pix_cents,
  CASE WHEN SUM(tabs_closed_count) > 0
       THEN ROUND(SUM(net_sales_cents)::numeric / SUM(tabs_closed_count))::int
       ELSE 0 END                     AS avg_ticket_cents
FROM daily_sales
WHERE restaurant_id = $1 AND business_date BETWEEN $3 AND $4
GROUP BY 1
ORDER BY 1 ASC;
```

### 3.2 Curva ABC e Ranking de Produtos
```sql
WITH ranked AS (
  SELECT
    product_id,
    MAX(product_name_snapshot)  AS product_name,
    MAX(category_name_snapshot) AS category_name,
    SUM(quantity_sold)::int     AS quantity_sold,
    SUM(quantity_cancelled)::int AS quantity_cancelled,
    SUM(revenue_cents)::bigint  AS revenue_cents
  FROM product_sales_daily
  WHERE restaurant_id = $1 AND business_date BETWEEN $2 AND $3
  GROUP BY product_id
),
tot AS (SELECT NULLIF(SUM(revenue_cents), 0) AS total_rev FROM ranked)
SELECT
  r.*,
  ROUND((r.revenue_cents::numeric / tot.total_rev) * 100, 2) AS revenue_share_pct,
  ROUND((SUM(r.revenue_cents) OVER (ORDER BY r.revenue_cents DESC)::numeric / tot.total_rev) * 100, 2) AS cumulative_pct,
  CASE
    WHEN (SUM(r.revenue_cents) OVER (ORDER BY r.revenue_cents DESC)::numeric / tot.total_rev) <= 0.80 THEN 'A'
    WHEN (SUM(r.revenue_cents) OVER (ORDER BY r.revenue_cents DESC)::numeric / tot.total_rev) <= 0.95 THEN 'B'
    ELSE 'C'
  END AS abc_class
FROM ranked r CROSS JOIN tot
ORDER BY r.revenue_cents DESC;
```

### 3.3 Cesta de Produtos (vendidos juntos na mesma comanda)
```sql
WITH tab_products AS (
  SELECT DISTINCT o.tab_id, oi.product_id, oi.product_name_snapshot AS product_name
  FROM orders o
  JOIN order_items oi ON oi.restaurant_id = o.restaurant_id AND oi.order_id = o.id
  JOIN tabs t ON t.restaurant_id = o.restaurant_id AND t.id = o.tab_id
  WHERE o.restaurant_id = $1 AND t.status = 'CLOSED'
    AND t.business_date BETWEEN $2 AND $3
    AND (oi.quantity - oi.cancelled_quantity) > 0
)
SELECT
  a.product_id AS product_a_id, MAX(a.product_name) AS product_a_name,
  b.product_id AS product_b_id, MAX(b.product_name) AS product_b_name,
  COUNT(*)::int AS co_occurrences
FROM tab_products a
JOIN tab_products b ON a.tab_id = b.tab_id AND a.product_id < b.product_id
GROUP BY a.product_id, b.product_id
HAVING COUNT(*) >= 3
ORDER BY co_occurrences DESC
LIMIT 20;
```

### 3.4 Mapa de Calor (Dia da semana × Hora) e Tempo Médio de Preparo (KDS)
```sql
-- Mapa de calor: EXTRACT(DOW FROM business_date) -> 0=Dom .. 6=Sáb
SELECT
  EXTRACT(DOW FROM business_date)::int AS weekday,
  hour_bucket,
  SUM(quantity_sold)::int              AS items_sold,
  SUM(revenue_cents)::bigint           AS revenue_cents
FROM product_sales_daily
WHERE restaurant_id = $1 AND business_date BETWEEN $2 AND $3
GROUP BY 1, 2
ORDER BY 1, 2;

-- Tempo médio de preparo (CREATED -> primeiro READY do item, em segundos):
SELECT
  ROUND(AVG(EXTRACT(EPOCH FROM (ready_ev.created_at - created_ev.created_at))))::int AS avg_prep_seconds,
  PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ready_ev.created_at - created_ev.created_at)))::int AS p90_prep_seconds
FROM order_events created_ev
JOIN LATERAL (
  SELECT MIN(created_at) AS created_at
  FROM order_events e2
  WHERE e2.restaurant_id = created_ev.restaurant_id
    AND e2.order_id = created_ev.order_id
    AND e2.action = 'TRANSITIONED' AND e2.to_stage = 'READY'
) ready_ev ON ready_ev.created_at IS NOT NULL
WHERE created_ev.restaurant_id = $1
  AND created_ev.action = 'CREATED'
  AND created_ev.created_at BETWEEN $2 AND $3;
```

---

## 4. Motor de Previsões (`back-end/src/modules/reports/forecast.engine.ts`)

Função pura em TypeScript rodando sobre os dados de `daily_sales` e `product_sales_daily` (sem precisar de serviço Python no início; contrato REST já pronto para evoluir depois):

### 4.1 Algoritmo WMA Sazonal + Fator de Tendência (exemplo numérico)
Para prever a demanda do produto `P` na próxima **sexta-feira** (`weekday = 5`):
1. Busca as últimas até **8 sextas-feiras** em que o restaurante abriu (`daily_sales.tabs_closed_count > 0` naquela data).
   - Ex.: últimas 4 sextas (da mais recente para a mais antiga): `q = [48, 42, 44, 36]` unidades.
2. Aplica pesos exponenciais `w_k = 0.75^k` (`k = 0, 1, 2, 3`):
   - `w = [1.0, 0.75, 0.5625, 0.4219]`, `Σw = 2.7344`.
   - Média ponderada `μ = (48×1 + 42×0.75 + 44×0.5625 + 36×0.4219) / 2.7344 = 43.68`.
3. Calcula **fator de tendência recente** (com `clamp` para evitar distorções):
   - `trend = clamp(receita_ultimos_14d / receita_14d_anteriores, 0.80, 1.25)`. Ex.: `trend = 1.05`.
   - `expected_qty = Math.round(μ * trend) = 46` unidades.
4. Calcula faixa de segurança pelo desvio padrão `σ` das ocorrências:
   - `range_min = Math.max(0, Math.floor(expected_qty - σ))`
   - `range_max = Math.ceil(expected_qty + σ)`
5. Define nível de confiança pelo nº de ocorrências `n`:
   - `n < 3`: `INSUFFICIENT_DATA` (não chuta; avisa que precisa de mais histórico)
   - `3 <= n <= 5`: `LOW`
   - `6 <= n <= 11`: `MEDIUM`
   - `n >= 12`: `HIGH`

### 4.2 Regras dos Alertas de Anomalia (`anomaly.engine.ts`)
| Código do alerta | Regra de disparo | Severidade |
|---|---|---|
| `REVENUE_DROP` | Faturamento do dia/semana > **25% abaixo** da média das últimas 6 ocorrências do mesmo dia da semana | `WARNING` / `CRITICAL` (>40%) |
| `CANCELLATION_SPIKE` | Taxa de cancelamento do dia > **2×** a média dos últimos 30 dias (e mínimo 3 itens) | `WARNING` |
| `DISCOUNT_SPIKE` | Descontos do dia > **2×** a média dos últimos 30 dias | `WARNING` |
| `PRODUCT_TREND_DOWN` | Produto Curva A caiu > **30%** nas últimas 2 semanas vs. 2 anteriores | `INFO` |
| `PRODUCT_TREND_UP` | Produto Curva B/C cresceu > **50%** nas últimas 2 semanas (candidato a destaque no NFC) | `POSITIVE` |
| `CASH_DIFF_RECURRENT` | ≥ 2 turnos nos últimos 7 dias com quebra negativa > R$ 10,00 | `CRITICAL` |

---

## 5. Contratos JSON dos endpoints `/api/v1/reports/*`

### `GET /api/v1/reports/sales/summary?from=2026-11-01&to=2026-11-20&compare=previous_period`
```json
{
  "period": { "from": "2026-11-01", "to": "2026-11-20", "days": 20 },
  "kpis": {
    "gross_sales_cents": 8450000,
    "discounts_cents": 210000,
    "cancelled_items_cents": 135000,
    "service_fee_cents": 760000,
    "net_sales_cents": 8240000,
    "provider_fees_cents": 198000,
    "net_after_fees_cents": 8042000,
    "tabs_closed_count": 620,
    "avg_ticket_cents": 13290,
    "avg_ticket_per_guest_cents": 5420,
    "avg_stay_seconds": 3840
  },
  "payment_mix": [
    { "method": "CREDIT", "amount_cents": 3950000, "share_pct": 47.94 },
    { "method": "PIX",    "amount_cents": 2470000, "share_pct": 29.98 },
    { "method": "DEBIT",  "amount_cents": 1320000, "share_pct": 16.02 },
    { "method": "CASH",   "amount_cents": 500000,  "share_pct": 6.07 }
  ],
  "comparison": {
    "net_sales_delta_pct": 8.4,
    "tabs_closed_delta_pct": 5.1,
    "avg_ticket_delta_pct": 3.1
  }
}
```

### `GET /api/v1/reports/forecasts/demand?target_date=2026-11-27&limit=20`
```json
{
  "target_date": "2026-11-27",
  "weekday": 5,
  "confidence": "MEDIUM",
  "trend_factor": 1.05,
  "items": [
    {
      "product_id": "uuid",
      "product_name": "Picanha na Chapa",
      "category_name": "Pratos Principais",
      "abc_class": "A",
      "expected_qty": 46,
      "range_min": 41,
      "range_max": 51,
      "peak_hours": [20, 21, 22]
    }
  ]
}
```

---

## 6. Implementação (Etapa 5)

Código em `back-end/src/modules/reports/`; migration `20261121090000_sales_aggregates`.

### Fonte única dos números
- `sales-contribution.ts` calcula, de forma pura, quanto uma comanda fechada soma em `daily_sales` e `product_sales_daily`. O incremental e o rebuild somam exatamente essa função, então os dois sempre dão o mesmo resultado.
- `sales-aggregator.ts`:
  - `applyTabSalesChange` roda dentro do `unit.run` do fechamento (`close-tab.ts`, que cobre o fechamento manual, o automático e o da sessão) e do estorno de comanda já fechada (`payments.service.ts`). No estorno ele aplica `contribuição depois − contribuição antes`.
  - `rebuildRange` apaga e recria o intervalo a partir das comandas.
- O incremental atualiza com `updateMany` + `create`. O lock do restaurante serializa as escritas.
- Apesar do nome, `daily_sales.rebuilt_at` registra a última escrita da linha, seja incremental ou rebuild. Renomear exigiria outra migration.
- `daily_sales` não tem CHECK de não-negativo de propósito: um agregado defasado não pode bloquear um estorno, e o rebuild corrige. `product_sales_daily` mantém o CHECK, porque estornos não alteram produtos.
- O rebuild usa uma transação por dia, para não segurar o lock do restaurante pelo período inteiro.
- Ficam fora: comandas `legacy_closed`, abertas e canceladas. `tabs_cancelled_count` não foi criado, porque a comanda cancelada não tem `business_date`.

### Definições adotadas
- KPIs, mix de pagamentos e buckets do histórico ficam em `sales-summary.ts`.
- `gross_sales_cents` = `tabs.subtotal_cents`: itens ativos, antes de taxa e ajustes.
- `net_sales_cents` = soma dos pagamentos `APPROVED`. É o que foi efetivamente recebido, inclui taxa de serviço, couvert e gorjeta e diminui com estornos. `avg_ticket_cents` usa esse valor.
- `discounts_cents`, `couvert_cents` e `tips_cents` saem dos ajustes ativos.
- `cancelled_items_cents` = `unit_price_cents × cancelled_quantity`.
- `hour_bucket` é a hora local de criação do pedido (`localHour` em `tab-business-date.ts`). O `business_date` é o da comanda, calculado no fechamento pelo `businessDate` já existente.

### Endpoints (`reports:read`: OWNER e MANAGER; o CASHIER recebe 403)
| Rota | Resposta |
|---|---|
| `GET /reports/sales/summary?from&to&compare=previous_period` | `period`, `kpis`, `payment_mix`, `comparison` (delta em pontos percentuais; `null` sem base) |
| `GET /reports/sales/history?from&to&granularity=day\|week\|month` | `items[]` por bucket; a semana começa na segunda-feira |
| `GET /reports/products/abc?from&to` | curva ABC (`abc-curve.ts`); o produto que cruza 80% ou 95% fica na classe anterior, então o primeiro é sempre A |
| `GET /reports/products/basket?from&to` | pares com ≥ 3 co-ocorrências, top 20 (`basket-and-prep.ts`) |
| `GET /reports/heatmap?from&to` | `weekday × hour_bucket`; o dia é o operacional, então um pedido à 01:00 antes do corte conta na hora 1 do dia anterior |
| `GET /reports/kitchen/prep-time?from&to` | média e p90 (percentil contínuo) do envio ao primeiro `READY` |
| `GET /reports/forecasts/demand?target_date&limit` | WMA sazonal (`forecast.engine.ts`, `demand-forecast.ts`) |
| `GET /reports/forecasts/alerts?date` | regras da §4.2 (`anomaly.engine.ts`, `sales-alerts.ts`); sem data, avalia o último dia operacional completo |
| `POST /reports/rebuild {from,to}` | só OWNER, até 92 dias |

Períodos: `from ≤ to` e no máximo 366 dias (`reports.schemas.ts`; datas em `report-dates.ts`). Contrato do serviço em `reports.interfaces.ts`.

### Previsão
- Usa até 12 ocorrências do mesmo dia da semana com venda. A §4.1 fala em 8, mas com 8 o nível `HIGH` (n ≥ 12) nunca seria alcançado.
- O σ é o desvio padrão populacional das ocorrências.
- A tendência compara os 14 dias anteriores ao alvo com os 14 dias antes deles. Sem base, vale 1.

### Alertas
- `REVENUE_DROP` exige pelo menos 3 ocorrências do mesmo dia da semana.
- `DISCOUNT_SPIKE` exige média de descontos maior que zero.
- Dias sem venda não geram alerta de dia.
- `CASH_DIFF_RECURRENT` considera os turnos fechados nos 7 dias que terminam na data avaliada, com limites em UTC, e não os 7 dias até hoje.

### Reconciliação
`back-end/src/shared/jobs/reports-reconciliation.job.ts` roda no boot e depois a cada 24 h. Reconstrói os últimos 7 dias operacionais de cada restaurante ativo (`ReportsService.reconcile`). A falha de um restaurante é registrada com o `restaurant_id` e não interrompe os demais.

As queries de `/reports/*` são validadas uma única vez, no controller (`schema.parse`). O `ZodError` vira `400 VALIDATION_ERROR` no `errorHandler`. O rebuild por quem não é OWNER responde `403 REBUILD_OWNER_ONLY`.

### Limitações conhecidas
- `basketTabs` carrega em memória os itens de todas as comandas fechadas do período (até 366 dias). Em restaurantes grandes, vale migrar para SQL agregado.
- A tendência da previsão usa os 28 dias anteriores ao `target_date`. Para uma data muito à frente, essa janela cai no futuro, sem vendas, e o fator vira 1.

Testes em `back-end/tests/reports-and-forecasts.test.ts`.
