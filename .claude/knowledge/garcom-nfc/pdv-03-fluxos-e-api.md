# PDV · 03 · Fluxos, Matemática Financeira, API REST e Tempo Real

> Especificação completa de regras de negócio, casos de borda, payloads JSON, códigos de erro, rate limits e eventos Socket.IO.
> Prefixo de todas as rotas: `/api/v1`. Formato padrão de erro: `{ error, code, message, details? }`.

---

## 1. Matemática financeira e invariantes (sempre no servidor!)

Todo cálculo roda em centavos (`Int`) dentro de `tabs-pricing.ts` (função pura, fácil de testar com Vitest):

1. **Subtotal da comanda (`subtotal_cents`):**
   - Soma de `active_total_cents` de todos os `orders` vinculados à `tab`:
     `active_line = unit_price_cents * (quantity - cancelled_quantity)`.
2. **Taxa de serviço (`service_fee_cents`):**
   - Se `tab.service_fee_waived === true` ou `tab.service_fee_bps === 0` → `0`.
   - Caso contrário → `Math.round((subtotal_cents * tab.service_fee_bps) / 10000)`.
   - *(Incide sobre `subtotal_cents`, antes de gorjetas extras e sem duplicar sobre couvert, salvo se desejado no futuro.)*
3. **Ajustes (`adjustments_cents`):**
   - Para cada `tab_adjustment` com `removed_at === null`:
     - Se `mode === 'FIXED_CENTS'`: `abs = value`.
     - Se `mode === 'PERCENT_BPS'`: `abs = Math.round((subtotal_cents * value) / 10000)`.
     - Se `type === 'DISCOUNT'`: `computed_cents = -abs`; se `COUVERT` ou `TIP`: `computed_cents = +abs`.
   - `adjustments_cents = Σ computed_cents`.
4. **Total e saldo (`total_cents`, `paid_cents`, `pending_cents`, `remaining_cents`):**
   - `total_cents = Math.max(0, subtotal_cents + service_fee_cents + adjustments_cents)`.
   - `paid_cents = Σ amount_cents` de `payments` com `status === 'APPROVED'`.
   - `pending_cents = Σ amount_cents` de `payments` com `status IN ('PENDING', 'PROCESSING')`.
   - `remaining_cents = total_cents - paid_cents`.
   - `available_to_charge_cents = total_cents - paid_cents - pending_cents`.
5. **Divisão igual por `N` pessoas (helper para o front e validação):**
   - `base = Math.floor(remaining_cents / N)`, `rest = remaining_cents - base * N`.
   - As `N - 1` primeiras pessoas pagam `base`; a última paga `base + rest` (fecha no centavo exato!).
6. **Divisão por item (`payment_allocations`):**
   - Para cada item `i`, `item_allocated = Σ covered_cents` de `payment_allocations` cujo pagamento está em `('PENDING', 'PROCESSING', 'APPROVED')`.
   - `item_remaining = active_line_cents(i) - item_allocated`.
   - Ao criar pagamento com `allocations[]`, o servidor valida `covered_cents <= item_remaining` para todo item (senão `409 ALLOCATION_EXCEEDS_ITEM`).
   - Se o cliente/operador marcar `"incluir taxa proporcional"` na divisão por item: `amount_cents = Σ covered_cents + Math.round((Σ covered_cents * effective_service_fee_bps) / 10000)` (limitado a `available_to_charge_cents`).
7. **Dinheiro e troco (`CASH`):**
   - `received_cents` opcional; se informado, precisa ser `>= amount_cents`; `change_cents = received_cents - amount_cents`.
   - Na gaveta (`cash_shifts.expected_cash_cents`), soma **`amount_cents`** (equivalente a `received_cents - change_cents`).

---

## 2. Regras de borda críticas (interação com módulos existentes!)

| Cenário | Regra obrigatória | Código HTTP / `code` |
|---|---|---|
| **Desativar mesa** (`PATCH /tables/:id { active: false }`) com comanda `OPEN`/`CLOSING` | **Bloquear!** Não fechar comanda silenciosamente (corrige lacuna de `tables.service.ts`). | `409 TABLE_HAS_OPEN_TAB` |
| **Fechar sessão manual** (`POST /sessions/:id/close`) com comanda aberta com consumo ou saldo > 0 | **Bloquear!** Equipe deve fechar pela comanda (`POST /tabs/:id/close`) ou cancelar a comanda. Se a comanda tiver 0 pedidos, fecha ambos juntos. Sem comanda aberta, também bloqueia se a sessão tiver pedidos pendentes [Implementado]. | `409 TAB_HAS_UNPAID_BALANCE` ou `409 SESSION_HAS_PENDING_ORDERS` |
| **Timeout da sessão NFC (4 h)** (`session-expiry.job.ts`) | Fecha `table_session` (`TIMEOUT`), revoga tokens e cancela `calls` + `payment_requests` abertos daquela sessão. **NÃO fecha a `tab`!** Novo scan na mesa cria nova `table_session` ligada ao mesmo `tab_id`. | — (job) |
| **Novo pedido com comanda em `CLOSING`** | Permite o pedido e volta a `tab` automaticamente para `OPEN`, emitindo `tab:updated`. | `201 Created` |
| **Cancelar item de pedido** (`POST /orders/:id/transitions → CANCELLED`) | Bloqueia se `tab.status IN ('CLOSED', 'CANCELLED')` (`TAB_NOT_OPEN`), ou se o novo `total_cents < paid_cents + pending_cents` (`TOTAL_BELOW_PAID` — exige estornar/cancelar pagamento antes). | `409` |
| **Aplicar desconto** que derrube `total_cents` abaixo de `paid_cents + pending_cents` | **Bloquear!** Estornar/cancelar pagamento antes. | `409 TOTAL_BELOW_PAID` |
| **Estornar pagamento** de comanda já `CLOSED` | Permitido só para `OWNER`/`MANAGER` dentro do **mesmo `business_date`** (ou com reabertura controlada). Estorna `payments` → `REFUNDED`, reverte delta em `daily_sales` e audita. A comanda continua `CLOSED`: `paid_cents` diminui e `closed_refunded_cents` aumenta pelo mesmo valor [Implementado, `applyRefund`]. Pagamento integrado (Point) não é estornável: `409 INTEGRATED_REFUND_UNAVAILABLE` (DEC-17, decidido: o estorno Point continua bloqueado). | `200 OK` ou `409 REFUND_WINDOW_EXPIRED` |
| **Concorrência de 2 operadores na mesma comanda** | Tudo serializado em `RestaurantUnitOfWork.run` (`SELECT ... FOR UPDATE` no restaurante) + `expected_version` em `close`/`cancel`/`merge`/`transfer`. | `409 VERSION_CONFLICT` |
| **Scan sem pedido** | Scan (`POST /public/tables/:code/scan`) cria `table_session` e vincula a uma `tab` se já existir; **só cria `tab` automaticamente no 1º pedido** (ou abertura explícita em `POST /tabs`), evitando centenas de comandas vazias. | — |

---

## 3. Contratos REST detalhados (Request / Response)

### 3.1 Comandas (`back-end/src/modules/tabs/`)

#### `POST /api/v1/tabs` (`tabs:manage`)
- **Request:**
  ```json
  { "kind": "TABLE", "table_id": "uuid-mesa", "label": "Aniversário Ana", "guests_count": 4 }
  // ou balcão:
  { "kind": "COUNTER", "label": "João - Balcão", "guests_count": 1 }
  ```
- **Response `201 Created`:** `{ "tab": TabSummary }`
- **Erros:** `404 TABLE_NOT_FOUND`, `409 TABLE_INACTIVE`, `409 TAB_ALREADY_OPEN`.

#### `GET /api/v1/tabs` (`tabs:read`)
- **Query:** `status=OPEN|CLOSING|CLOSED|CANCELLED` (aceita múltiplos, ex.: `OPEN,CLOSING`), `kind=TABLE|COUNTER`, `table_id`, `business_date=YYYY-MM-DD`, `from`, `to`, `cursor`, `limit` (padrão 50, máx 100).
- **Response `200 OK`:**
  ```json
  {
    "serverTime": "2026-11-20T22:15:00.000Z",
    "nextCursor": "opaque...",
    "tabs": [
      {
        "id": "uuid",
        "number": 42,
        "kind": "TABLE",
        "table_id": "uuid-mesa",
        "table_label": "Mesa 12",
        "label": "Aniversário Ana",
        "guests_count": 4,
        "status": "OPEN",
        "subtotal_cents": 16500,
        "service_fee_cents": 1650,
        "adjustments_cents": 0,
        "total_cents": 18150,
        "paid_cents": 6050,
        "pending_cents": 0,
        "remaining_cents": 12100,
        "has_pending_kitchen_items": false,
        "open_payment_requests_count": 1,
        "opened_at": "2026-11-20T20:10:00.000Z",
        "version": 5
      }
    ]
  }
  ```

#### `GET /api/v1/tabs/:id` (`tabs:read`)
- **Response `200 OK`:** `{ "tab": TabDetail }`. Além dos campos do resumo, `tab` retorna:
  - `orders[]` (cada pedido com `items[]`, cada item com `active_line_cents`, `allocated_cents`, `unallocated_cents`, `submitted_by_token_id`, `guest_label`).
  - `by_guest[]` — agrupamento pronto para o caixa/garçom:
    ```json
    [
      { "key": "token:<id>", "label": "João", "subtotal_cents": 5500, "estimated_service_fee_cents": 550, "item_ids": ["..."] },
      { "key": "staff", "label": "Mesa / Equipe", "subtotal_cents": 11000, "estimated_service_fee_cents": 1100, "item_ids": ["..."] }
    ]
    ```
  - `adjustments[]`, `payments[]` (com `allocations[]`), `payment_requests[]`, `fiscal_documents[]`.

#### `POST /api/v1/tabs/:id/pre-bill` (`tabs:read`)
- Muda `OPEN → CLOSING`, devolve o payload de pré-conta completo + `equal_split_preview` opcional se passar `?split_by=4`.

#### `POST /api/v1/tabs/:id/adjustments` (`tabs:discount` para `DISCOUNT`; `tabs:manage` para `COUVERT`/`TIP`)
- **Request:** `{ "type": "DISCOUNT", "mode": "PERCENT_BPS", "value": 1000, "reason": "Cortesia atraso cozinha" }`
- **Response `201 Created`:** `{ "adjustment": ..., "tab": TabSummary }`

#### `POST /api/v1/tabs/:id/service-fee/waive` (`tabs:service_fee_waive`)
- **Request:** `{ "waived": true, "reason": "Cliente optou por não pagar os 10%" }`
- **Response `200 OK`:** `{ "tab": TabSummary }`

#### `PATCH /api/v1/tabs/:id` (`tabs:manage`)
- **Request:** `{ "expected_version": 5, "label": "João", "guests_count": 2 }`. Envie os campos que deseja alterar. Use `null` para limpar o nome ou o número de pessoas.
- **Response `200 OK`:** `{ "tab": TabSummary }`.

#### `POST /api/v1/tabs/:id/transfer-table` (`tabs:manage`)
- **Request:** `{ "target_table_id": "uuid-mesa-destino", "expected_version": 5 }`
- **Erros:** `409 TAB_ALREADY_OPEN` (mesa destino ocupada), `409 VERSION_CONFLICT`.
- A transferência move a sessão ativa da mesa principal. As sessões de mesas secundárias preservam suas mesas e a comanda vinculada.

#### `POST /api/v1/tabs/:id/merge` (`tabs:manage`)
- **Request:** `{ "source_tab_id": "uuid-comanda-origem", "expected_version": 5 }`
- Transfere pedidos, sessões, ajustes, pagamentos e solicitações da origem para `:id`. Marca a origem como `CANCELLED` e bloqueia se houver pagamento `PENDING` ou `PROCESSING` nela. As parcelas pagas continuam ligadas aos mesmos itens.
- O vínculo secundário dura até o fim da sessão original. Depois de um timeout, o scan na mesa principal reencontra a comanda aberta pela mesa; nas secundárias, começa uma nova sessão sem vínculo.

#### `POST /api/v1/tabs/:id/close` (`tabs:close`)
- **Request:** `{ "expected_version": 6, "customer_document": "12345678909" }` *(CPF/CNPJ opcional para NFC-e)*
- **Response `200 OK`:** `{ "tab": TabSummary, "fiscal_document": FiscalDocumentSummary | null }`
- **Erros:** `409 TAB_HAS_UNPAID_BALANCE`, `409 TAB_HAS_PENDING_PAYMENTS`, `409 TAB_HAS_PENDING_ORDERS`, `409 VERSION_CONFLICT`.

#### `POST /api/v1/tabs/:id/cancel` (`tabs:cancel`)
- **Request:** `{ "expected_version": 6, "reason": "Mesa desistiu antes do preparo" }`
- **Erros:** `409 TAB_HAS_APPROVED_PAYMENTS`, `409 TAB_HAS_PENDING_PAYMENTS`.

---

### 3.2 Pedidos pelo PDV (`back-end/src/modules/orders/`)

#### `POST /api/v1/orders` (`orders:create`)
- **Request:**
  ```json
  {
    "tab_id": "uuid-comanda-opcional",
    "table_id": "uuid-mesa-opcional",
    "publication_id": "uuid-publicacao",
    "submission_key": "uuid-idempotencia",
    "items": [
      { "product_id": "uuid", "variant_id": "uuid", "quantity": 2, "notes": "Sem cebola", "options": [{ "option_id": "uuid", "quantity": 1 }] }
    ]
  }
  ```
- Exige exatamente um entre `tab_id` ou `table_id`. Se `table_id`, reutiliza ou abre a comanda `TABLE` da mesa.
- **Response `201 Created`** (ou `200 OK` com `replayed: true` em retry idempotente): `{ "order": OrderView, "tab": TabSummary, "replayed": false }`.

---

### 3.3 Cliente NFC (`X-Table-Token` + rate limiters dedicados)

- **`PATCH /api/v1/public/table-session/guest`** (`tableSessionLimiter`, 15 req/min):
  - Request: `{ "guest_label": "João" }` → Response `200 OK`: `{ "guest_label": "João" }`.
- **`GET /api/v1/public/tab`** (`orderReadLimiter`, 60 req/min):
  - Response `200 OK`: `{ "tab": PublicTabView | null }` contendo `number`, `table_label`, `status`, `subtotal_cents`, `service_fee_cents`, `adjustments_cents`, `total_cents`, `paid_cents`, `remaining_cents`, `my_subtotal_cents`, `my_estimated_total_cents`, `orders[]` (com `is_mine: boolean`, `guest_label`), `my_open_payment_request`.
- **`POST /api/v1/public/tab/payment-requests`** (`callLimiter`, 10 req/min):
  - Request:
    ```json
    {
      "preferred_method": "CREDIT",
      "mode": "MY_ORDERS",            // "MY_ORDERS" | "ITEMS" | "AMOUNT"
      "include_service_fee": true,
      "items": [{ "order_item_id": "uuid", "covered_cents": 4000 }], // se mode = ITEMS
      "amount_cents": 6050                                           // se mode = AMOUNT
    }
    ```
  - Response `201 Created`: `{ "payment_request": PaymentRequestView }`.
  - Se o mesmo `session_token` já tiver uma solicitação `OPEN`, retorna `409 PAYMENT_REQUEST_ALREADY_OPEN`. O cliente pode cancelar via `DELETE /public/tab/payment-requests/:id`. Timeout expira a solicitação e o fechamento da comanda cancela solicitações restantes.

---

### 3.4 Pagamentos (`back-end/src/modules/payments/`)

#### `POST /api/v1/tabs/:id/payments` (`payments:create`)
- **Request:**
  ```json
  {
    "idempotency_key": "uuid-gerado-no-cliente",
    "provider": "MANUAL",                 // "MANUAL" | "MERCADO_PAGO"
    "terminal_id": "uuid-terminal",       // obrigatório se provider = MERCADO_PAGO
    "method": "CREDIT",                   // CASH | CREDIT | DEBIT | PIX | VOUCHER | OTHER
    "amount_cents": 6050,
    "received_cents": null,               // opcional, apenas CASH
    "tip_cents": 0,
    "installments": 1,
    "payer_label": "João",
    "payment_request_id": "uuid-opcional",
    "allocations": [{ "order_item_id": "uuid", "covered_cents": 5500, "covered_units_bps": 10000 }],
    "manual_details": { "card_brand": "VISA", "nsu": "123456", "authorization_code": "987654" },
    "auto_close": true                    // se MANUAL e quitou tudo sem pendência na cozinha, já fecha
  }
  ```
- **Response:**
  - `MANUAL`: `201 Created` `{ "payment": PaymentView, "tab": TabSummary, "auto_closed": true|false }`.
  - `MERCADO_PAGO`: `202 Accepted` `{ "payment": PaymentView (status=PROCESSING), "tab": TabSummary }`.
- **Idempotência:** mesmo `idempotency_key` com mesmo payload devolve `200 OK` (`replayed: true`); com payload diferente devolve `409 IDEMPOTENCY_CONFLICT`.
- Ao converter uma solicitação ativa, a seleção e o valor são preenchidos pelo servidor. A equipe pode ajustar o meio efetivo de pagamento. A taxa proporcional informada em `include_service_fee` é limitada ao saldo disponível.

#### `POST /api/v1/tabs/:id/payments/:paymentId/refund` (`payments:refund`)
- **Request:** `{ "reason": "Cobrança duplicada na maquininha" }`
- **Response `200 OK`:** `{ "payment": PaymentView (status=REFUNDED), "tab": TabSummary }`.

---

### 3.5 Turno de caixa (`back-end/src/modules/cash-shifts/`)

As rotas exigem `cash_shift:operate`. `OWNER` e `MANAGER` administram os turnos do próprio restaurante. `CASHIER` acessa apenas seus turnos. Turnos fora desse escopo retornam `404`.

- `POST /api/v1/cash-shifts/open` recebe `{ "opening_cents": 20000 }` e retorna `201 { "shift": ... }`. Se já houver um turno aberto para o operador, retorna `409 CASH_SHIFT_ALREADY_OPEN`.
- `GET /api/v1/cash-shifts/current` retorna `{ "shift": ... }` do operador autenticado ou `{ "shift": null }`.
- `GET /api/v1/cash-shifts` retorna `{ "shifts": [...] }` com filtros opcionais `status`, `limit` e `offset`.
- `GET /api/v1/cash-shifts/:id` retorna `{ "shift": ... }` com `movements` e `totals_by_method`, um mapa dos totais em centavos de pagamentos aprovados por meio.
- `POST /api/v1/cash-shifts/:id/movements` recebe `{ "type": "SANGRIA", "amount_cents": 5000, "reason": "Depósito no cofre" }` e retorna `201 { "shift": ... }`. Sangria reduz o saldo e suprimento aumenta.
- `POST /api/v1/cash-shifts/:id/close` recebe `{ "counted_cash_cents": 45200, "notes": "Tudo certo" }` e retorna `{ "shift": ... }` com a diferença em centavos entre o contado e o esperado.

O pagamento é vinculado ao turno aberto do operador, quando houver. Dinheiro acrescenta apenas o valor líquido pago ao saldo esperado. O estorno corrige o turno vinculado mesmo após o fechamento, preservando a contagem física e recalculando a diferença. Sangria ou estorno que levaria o saldo abaixo de zero retorna `409 CASH_SHIFT_INSUFFICIENT_CASH`.

---

## 4. Eventos Socket.IO (`shared/realtime/socket-notifier.ts`)

Adicionar a sala **`restaurant:{id}:pos`** no handshake do Socket.IO para usuários com `hasCapability(actor, "tabs:read")` (ou seja: `OWNER`, `MANAGER`, `CASHIER`, `WAITER`):

| Evento | Sala | Payload mínimo (emitido só após commit!) |
|---|---|---|
| `tab:opened` | `restaurant:{id}:pos` | `{ tab_id, number, kind, table_id }` |
| `tab:updated` | `restaurant:{id}:pos` | `{ tab_id, version, status, total_cents, paid_cents, pending_cents }` |
| `tab:closed` | `restaurant:{id}:pos` | `{ tab_id, number, table_id }` |
| `payment_request:created` | `restaurant:{id}:pos` | `{ request_id, tab_id, table_label, payer_label, preferred_method, requested_amount_cents }` |
| `payment_request:updated` | `restaurant:{id}:pos` | `{ request_id, tab_id, status }` |
| `payment:updated` | `restaurant:{id}:pos` | `{ payment_id, tab_id, status, amount_cents, method, provider }` |
| `fiscal:updated` | `restaurant:{id}:pos` | `{ document_id, tab_id, status, qrcode_url? }` |
