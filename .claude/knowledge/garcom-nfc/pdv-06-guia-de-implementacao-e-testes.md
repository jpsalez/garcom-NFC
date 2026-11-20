# PDV · 06 · Guia de Implementação Etapa por Etapa e Matriz de Testes

> Roteiro prático de execução para construir o PDV no `back-end/` sem pular passos e sem regressões.
> Lembrete do `.claude/CLAUDE.md`: funções pequenas (~25 linhas), controller sem Prisma e sem `try/catch`, `restaurantId` sempre 1º parâmetro em todo repository, índices parciais criados manualmente na migration SQL.

---

## Definição de pronto obrigatória ao fim de CADA etapa
```bash
python3 .claude/scripts/verify.py        # typecheck + lint + testes
python3 .claude/scripts/check_tenant.py  # zero violação de isolamento multi-tenant
python3 .claude/scripts/doc_drift.py     # checar divergência de rotas/schema
```
Regra adicional: todo endpoint novo deve entrar em `back-end/src/docs/` (OpenAPI) e todo erro novo deve usar `code` estável (`DEC-12`).

---

## Etapa 0 — Alinhamento de branches e Fundação
**Objetivo:** resolver divergência `main`/`dev` e preparar configuração de restaurante + papel `CASHIER` + novas capabilities.

### Checklist de arquivos
1. **Git:** alinhar `main` e `dev` (garantir que o histórico de migrations fique linear e sem conflito com `20261120010000_revert_pos_orders_and_tabs`).
2. **Migration 0a (`add_cashier_staff_category`):** `ALTER TYPE staff_category ADD VALUE 'CASHIER';` *(isolada em migration própria por regra do Postgres)*.
3. **Migration 0b (`pdv_restaurant_foundation`):**
   - Colunas em `restaurants`: `timezone`, `business_day_cutoff_minutes`, `service_fee_bps`, `next_tab_number` + CHECK `restaurants_pdv_config_valid`.
   - Atualizar CHECK `order_event_valid_actor_snapshot` incluindo `'CASHIER'`.
4. **Schema Prisma:** atualizar `restaurants` e `staff_category` em `back-end/prisma/schema.prisma`.
5. **Capabilities:** atualizar `back-end/src/shared/authorization/capabilities.ts` com todas as novas capabilities da matriz (`PDV-D06`) e suporte a `CASHIER`.
6. **Settings do restaurante:** expor `GET/PATCH /api/v1/restaurant/settings` (`OWNER`/`MANAGER`) para editar `timezone`, `business_day_cutoff_minutes` e `service_fee_bps` (validando IANA timezone com `Intl.DateTimeFormat`).
7. **Ajuste de segurança pendente:** restringir `POST /sessions/:id/close` e `PATCH /calls/:id/done` para não permitir `CLEANING`/`OTHER`.

`restaurant-settings.controller.ts`, `restaurant-settings.service.ts` e `restaurant-settings.schema.ts`
implementam consulta e atualização parcial com autorização por restaurante. Mudanças ficam no histórico
de operações, e `public-restaurant.ts` preserva o formato das respostas de cadastro e administração.

### Testes obrigatórios (`tests/pdv-foundation.test.ts`)
- Criar usuário `STAFF` com `category = 'CASHIER'` e validar matriz completa de `hasCapability` para `OWNER`, `MANAGER`, `CASHIER`, `WAITER`, `KITCHEN`, `CLEANING`, `OTHER`.
- `PATCH /restaurant/settings` aceita `timezone`, `business_day_cutoff_minutes` (`0..719`), `service_fee_bps` (`0..3000`); rejeita timezone inválido e valores fora do intervalo.
- Isolamento multi-tenant: `OWNER` do restaurante A não lê/altera settings do restaurante B.

---

## Etapa 1 — Núcleo de Comandas (`tabs`) + Pedido pelo PDV
**Objetivo:** comandas por mesa e balcão, lançamento de pedidos pela equipe (`source=POS`), `category_name_snapshot`, transferência/junção e timeout desacoplado.

### Checklist de arquivos
1. **Migration 1a (`add_pos_order_enums`):** `ALTER TYPE order_source ADD VALUE 'POS'; ALTER TYPE order_fulfillment ADD VALUE 'COUNTER';`.
2. **Migration 1b (`tabs_and_pos_orders`):**
   - Criar enums `tab_kind`, `tab_status` e tabela `tabs` + índice parcial `tabs_one_open_per_table` + CHECK `tabs_valid_invariants`.
   - Adicionar `table_sessions.tab_id`, `orders.tab_id`, `orders.submitted_by_user_id`, `order_items.category_id_snapshot`, `order_items.category_name_snapshot`.
   - Backfill seguro sob `DISABLE/ENABLE TRIGGER order_snapshot_guard`.
   - Atualizar CHECKs `order_valid_current_source`, `order_event_valid_transition` e função `menu_guard_order_record`.
3. **Módulo `back-end/src/modules/tabs/`:**
   - `tabs.interfaces.ts`, `tabs.schemas.ts`, `tabs-pricing.ts` (função pura de cálculo de totais).
   - `tabs.repository.interface.ts`, `tabs.repository.ts` (`restaurantId` 1º param, aceita `DbClient`).
   - `tabs.service.ts` (`open`, `getOrCreateForTable`, `list`, `getDetail`, `update`, `transferTable`, `merge`, `recalculate`).
   - `tabs.controller.ts`, `tabs.routes.ts`.
4. **Atualizações em módulos existentes:**
   - `orders/orders.service.ts`: adicionar `posSubmit` (`POST /orders`), gravar `tab_id` e `category_name_snapshot`, recalcular `tab` ao criar pedido ou cancelar item (`TRANSITIONED → CANCELLED` bloqueia se `tab` fechada).
   - `sessions/sessions.service.ts`: no scan, vincular `table_session.tab_id` à comanda aberta da mesa (se existir); no timeout (`expireDue`), **não** fechar a comanda; no fechamento manual, bloquear se `tab` tiver consumo/saldo aberto (`TAB_HAS_UNPAID_BALANCE`).
   - `tables/tables.service.ts`: bloquear desativação de mesa com comanda aberta (`TABLE_HAS_OPEN_TAB`).
   - `shared/realtime/socket-notifier.ts`: adicionar sala `restaurant:{id}:pos` e método `toPos()`.
   - `shared/container/container.ts` e `src/routes.ts`: registrar `TabsRepository`, `TabsService` e `tabsRoutes`.

`tabs-state.ts` coordena operações dentro da transação do restaurante, `tabs-view.ts` monta os DTOs e
`tab-events.ts` publica as alterações após o commit. `tab-business-date.ts` aplica o fuso e o corte
configurado ao fechar uma comanda vazia junto com a sessão manual.

### Testes obrigatórios (`tests/tabs-core.test.ts`)
- Abrir comanda `TABLE` (1 aberta por mesa — 2ª retorna `409 TAB_ALREADY_OPEN`) e `COUNTER` (várias simultâneas, numeração sequencial).
- Pedido via NFC abre comanda automaticamente no 1º pedido; pedido via PDV (`POST /orders`) funciona mesmo com `customer_ordering_enabled = false`, gera impressão e recalcula `subtotal_cents`/`service_fee_cents`/`total_cents`.
- Cancelamento parcial de item recalcula `tabs.total_cents`; bloqueia se comanda fechada.
- Timeout da sessão NFC fecha `table_session`, mantém `tab` `OPEN`, e novo scan cria nova `table_session` apontando para o **mesmo `tab_id`**.
- Desativar mesa com comanda aberta retorna `409 TABLE_HAS_OPEN_TAB`.
- Transferir mesa (move sessão + pedidos) e juntar comandas (`merge`).
- Isolamento multi-tenant em todas as rotas de `/tabs` e `POST /orders`.

---

## Etapa 2 — Fechamento, Divisão, Ajustes, Solicitação NFC e Pagamento Manual (N0)
**Objetivo:** ciclo financeiro completo operando no modo N0 (manual), com divisão por valor/igual/item/NFC e fechamento real de conta.

### Checklist de arquivos
1. **Migration 2 (`tab_closing_and_payments`):**
   - `session_tokens.guest_label`.
   - Tabelas `tab_adjustments`, `payment_requests`, `payments`, `payment_allocations` + índice parcial `payment_requests_one_open_per_token` + CHECKs.
2. **Em `back-end/src/modules/tabs/`:**
   - `tab-adjustments.service.ts` (desconto, couvert, gorjeta, remover 10% com motivo).
   - `payment-requests.service.ts` (rotas NFC: `PATCH /public/table-session/guest`, `GET /public/tab`, `POST/DELETE /public/tab/payment-requests`).
   - `tabs.service.ts`: `preBill`, `close` (encerra `table_session` ativa, revoga tokens, cancela chamados/requests abertos, audita em `restaurant_operation_events`), `cancel`.
3. **Módulo `back-end/src/modules/payments/`:**
   - `payments.interfaces.ts`, `payments.schemas.ts`, `payments.repository.interface.ts`, `payments.repository.ts`.
   - `providers/payment-provider.interface.ts`, `providers/manual.provider.ts`, `providers/payment-provider.registry.ts`.
   - `payments.service.ts` (`create` com `allocations` e `idempotency_key`, `refund`), `payments.controller.ts`, `payments.routes.ts`.
4. **Eventos Socket.IO:** `tab:opened/updated/closed`, `payment_request:created/updated`, `payment:updated`.

`tab-ledger.ts` carrega os registros financeiros usados no recálculo e nas consultas. `close-tab.ts` reúne
o fechamento, as sessões vinculadas e as solicitações. `cancel-order-items.ts` encerra unidades ainda
na fila quando a comanda é cancelada. `payment-allocation.ts` valida saldo dos itens e taxa proporcional,
e `payment-view.ts` define o DTO de pagamentos da equipe. O fluxo NFC usa `payment-requests.schemas.ts`,
`payment-requests.routes.ts`, `payment-request-view.ts` e `payment-request-events.ts`.
As operações no banco usam `payment-requests.repository.ts` e `tab-adjustments.repository.ts`.

### Testes obrigatórios (`tests/tabs-closing-and-payments.test.ts`)
- **Permissões (`PDV-D06`):** `WAITER` recebe pagamento e fecha conta, mas toma `403` ao dar desconto, remover 10%, estornar ou cancelar comanda; `CASHIER` remove 10% com motivo mas toma `403` em desconto/estorno/cancelamento; `OWNER`/`MANAGER` fazem tudo.
- **Divisão completa:** mesa de 3 pessoas com item compartilhado — Pessoa 1 paga via `allocations` (item + 1/3 porção + 10%), Pessoa 2 paga valor livre, Pessoa 3 paga restante em dinheiro com troco → `remaining_cents === 0` → `close` fecha comanda e encerra sessão NFC.
- **Bloqueios:** fechar com saldo > 0 (`TAB_HAS_UNPAID_BALANCE`), desconto que deixa total < pago (`TOTAL_BELOW_PAID`), alocação maior que saldo do item (`ALLOCATION_EXCEEDS_ITEM`), cancelar item quando derrubaria total < pago.
- **Idempotência:** replay de `POST /tabs/:id/payments` com mesmo `idempotency_key` não duplica pagamento; payload divergente retorna `409 IDEMPOTENCY_CONFLICT`.
- **Fluxo NFC:** `guest_label` → `GET /public/tab` retorna `is_mine` corretamente → `POST /public/tab/payment-requests` → conversão em `payment` pelo garçom.

---

## Etapa 3 — Turno de Caixa (`cash-shifts`)
**Objetivo:** controle de gaveta, sangria, suprimento e fechamento com apuração de quebra de caixa.

### Checklist de arquivos
1. **Migration 3 (`cash_shifts`):** tabelas `cash_shifts` e `cash_movements` + índice parcial `cash_shifts_one_open_per_operator` + CHECKs + FK em `payments.cash_shift_id`.
2. **Módulo `back-end/src/modules/cash-shifts/`:** `cash-shifts.interfaces.ts`, `cash-shifts.schemas.ts`, `cash-shifts.repository.interface.ts`, `cash-shifts.repository.ts`, `cash-shifts.service.ts`, `cash-shifts.controller.ts`, `cash-shifts.routes.ts`.
3. **Integração em `payments.service.ts`:** ao registrar pagamento, associar automaticamente `cash_shift_id` do turno aberto do operador (e somar `amount_cents` em `expected_cash_cents` quando `method === 'CASH'`; subtrair no estorno).

### Testes obrigatórios (`tests/cash-shifts.test.ts`)
- Abrir turno (2º turno aberto do mesmo operador retorna `409 CASH_SHIFT_ALREADY_OPEN`), receber em dinheiro com troco (soma só o líquido!), receber em cartão (não altera `expected_cash_cents`), registrar sangria (`-`) e suprimento (`+`), fechar informando `counted_cash_cents` e verificar `difference_cents` exato.
- `WAITER` toma `403` em `/cash-shifts/*`; `CASHIER` vê apenas o próprio turno na listagem.

---

## Etapa 4 — Maquininhas Integradas (Mercado Pago Point — N1)
**Objetivo:** OAuth por restaurante, sync de maquininhas, cobrança assíncrona fora do `unit.run`, webhook HMAC e job de reconciliação.

### Checklist de arquivos
1. **Migration 4 (`payment_providers_and_terminals`):** `payment_provider_accounts`, `payment_terminals` + índice parcial `payment_terminals_unique_device` + FK em `payments.terminal_id`.
2. **Infra compartilhada:**
   - `back-end/src/shared/utils/crypto.ts` (`encryptSecret` / `decryptSecret` AES-256-GCM).
   - `back-end/src/server.ts`: captura de `req.rawBody` para `/api/v1/webhooks/*`.
3. **Em `back-end/src/modules/payments/`:**
   - `providers/mercado-pago.provider.ts` (OAuth, `listTerminals`, `createCharge`, `getChargeStatus`, `cancelCharge`, `parseWebhook` com `timingSafeEqual`).
   - `terminals.service.ts` (OAuth URL + callback + sync + CRUD terminais).
   - `webhooks.routes.ts` (`POST /webhooks/payments/mercado-pago`).
   - Atualizar `payments.service.ts` para fluxo assíncrono em 3 passos (nunca HTTP dentro do `unit.run`!).
4. **Job:** `back-end/src/shared/jobs/payment-reconciliation.job.ts` registrado em `main.ts`.

### Testes obrigatórios (`tests/payments-mercado-pago.test.ts`)
- Criptografia `crypto.ts` (roundtrip, tamper no authTag falha, nunca vaza plaintext).
- Cobrança N1 com `MercadoPagoProvider` mockado via `nock`/stub: grava `PENDING` → HTTP fora do lock → `PROCESSING` → webhook com assinatura HMAC inválida retorna `401` → webhook válido confirma `APPROVED`, grava NSU/bandeira/parcelas e soma `paid_cents`.
- Falha HTTP na criação da cobrança marca `CANCELLED` e libera saldo/alocações da comanda.
- Job de reconciliação expira cobrança travada após 5 min e libera saldo.

---

## Etapa 5 — Histórico de Vendas, KPIs e Previsões (`reports`)
**Objetivo:** agregação em tempo real, reconciliação noturna, histórico diário/semanal/mensal, catálogo de KPIs e motor de previsão/alertas.

### Checklist de arquivos
1. **Migration 5 (`sales_aggregates`):** tabelas `daily_sales` e `product_sales_daily`.
2. **Módulo `back-end/src/modules/reports/`:**
   - `business-date.ts` (cálculo de `business_date` e `hour_bucket` com timezone + cutoff).
   - `sales-aggregator.service.ts` (`applyTabDelta`, `rebuildRange`).
   - `reports.repository.interface.ts`, `reports.repository.ts` (SQLs do `pdv-05`).
   - `forecast.engine.ts` (WMA sazonal + tendência + confiança) e `anomaly.engine.ts`.
   - `reports.service.ts`, `reports.controller.ts`, `reports.routes.ts`, `reports.schemas.ts`.
3. **Hook em `tabs.service.ts` e `payments.service.ts`:** chamar `applyTabDelta` dentro do `unit.run` no fechamento e no estorno pós-fechamento.
4. **Job:** `back-end/src/shared/jobs/reports-reconciliation.job.ts`.

### Testes obrigatórios (`tests/reports-and-forecasts.test.ts`)
- **Fronteira de dia operacional:** restaurante com `America/Sao_Paulo` + `cutoff = 300` (05:00): venda às 01:40 de sábado cai na `business_date` de sexta e `hour_bucket = 1`.
- Consistência: soma de `daily_sales` após 10 fechamentos + 1 estorno bate 100% com `rebuildRange`.
- Curva ABC, cesta de produtos, mapa de calor, tempo de preparo KDS e previsão WMA com 4+ semanas simuladas (e retorno `INSUFFICIENT_DATA` com < 3 semanas).
- Permissões: `WAITER` toma `403`; `CASHIER` não acessa `/reports/forecasts/*`.

---

## Etapa 6 — Módulo Fiscal NFC-e Opcional (`fiscal`)
**Objetivo:** emissão opcional de NFC-e por restaurante via `IFiscalProvider` (`Notaas` grátis no piloto + `Focus NFe` em escala).

### Checklist de arquivos
1. **Migration 6 (`fiscal_nfce`):** `fiscal_tax_profiles`, `fiscal_settings`, `fiscal_documents` + `menu_products.fiscal_tax_profile_id`.
2. **Módulo `back-end/src/modules/fiscal/`:**
   - `fiscal.interfaces.ts`, `fiscal.schemas.ts`, `fiscal.mapper.ts` (rateio exato no centavo + `tPag`).
   - `fiscal.repository.interface.ts`, `fiscal.repository.ts`, `fiscal.service.ts`, `fiscal.controller.ts`, `fiscal.routes.ts`.
   - `providers/fiscal-provider.interface.ts`, `fiscal-provider.registry.ts`, `mock-fiscal.provider.ts`, `notaas.provider.ts`, `focus-nfe.provider.ts`.
3. **Hook em `tabs.service.ts`:** no `close`, se `fiscal_settings.enabled`, reserva `fiscal_document(PENDING)` no `unit.run` e dispara emissão assíncrona após o commit.

### Testes obrigatórios (`tests/fiscal-nfce.test.ts`)
- `fiscal.mapper.ts` (unitário): testa rateio de desconto percentual + taxa de serviço 10% + troco em dinheiro garantindo `Σ(vProd - vDesc + vOutro) === Σ(vPag - vTroco)` até o último centavo em 20 casos de dízima.
- Emissão automática no fechamento com `MockFiscalProvider` → `AUTHORIZED`, salva chave/QR Code e emite `fiscal:updated`.
- Rejeição SEFAZ mantém comanda fechada/paga e permite `POST /tabs/:id/nfce/retry` após corrigir perfil tributário.
- Cancelamento fiscal exige justificativa de 15–255 chars e permissão `OWNER`/`MANAGER`.
