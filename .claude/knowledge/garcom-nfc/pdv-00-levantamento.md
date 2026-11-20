# PDV · 00 · Levantamento da estrutura atual (20/11/2026, branch `dev`)

> Instantâneo do código feito para planejar o PDV. O código manda. Marcações: [Implementado] = existe no `dev`; [Revertido] = existiu e saiu.

## 0. Alerta: PDV diverge entre branches
- `dev`: PDV revertido. Commits `6217c87` (PDV) → `fa82741` (corrige backfill) → `61adb5f` (revert). A migration `20261120010000_revert_pos_orders_and_tabs` desfaz o banco e **aborta se houver pedido `source='POS'`**.
- `origin/main` (último `66404ab`) **ainda tem o PDV** e não tem a migration de revert. Merge `dev`→`main` precisa de cuidado com o histórico de migrations.
- Nenhum commit explica o motivo do revert; a decisão "#11 PDV interno" foi removida de `decisoes.md`.

## 1. Módulos do back-end (`back-end/src/modules`)
| Módulo | O que faz | Relevância para o PDV |
|---|---|---|
| auth | JWT em cookie, refresh com rotação, reset de senha | identifica o operador do caixa |
| administration | SUPER_ADMIN gere restaurantes/usuários | métricas da plataforma (futuro) |
| users | OWNER gere STAFF (`/staff`) | operadores; não há categoria CASHIER |
| tables | CRUD de mesas, QR (`public_code`) | comanda por mesa |
| sessions | atendimento da mesa (scan/balcão, 4 h, extend, close) | hoje é o mais próximo de "conta aberta" |
| calls | chamados WAITER/BILL | **BILL é o único conceito de conta hoje** |
| menu | rascunho → publicação imutável (snapshot JSON), disponibilidade, archive-only | fonte dos preços |
| orders | pedido do cliente pelo QR, preço no servidor, idempotência, progresso por item | base das vendas |
| printing | CloudPRNT/navegador, só destino KITCHEN | pré-conta/recibo exigiria novo destino |
| media, restaurants | mídia; lock `FOR UPDATE` do restaurante; inicialização | infra |

## 2. Ciclo de vida atual
- **table_sessions**: ACTIVE/CLOSED; uma ACTIVE por mesa (índice parcial). Abre no 1º scan ou pelo balcão; cada scan gera `session_token`. Fechamento manual recusa pendências (`SESSION_HAS_PENDING_ORDERS`); **timeout (job 60 s) e desativar mesa fecham sem checar pedidos**. `keep_open` existe sem rota.
- **orders / order_items / order_item_options / order_events**: preço calculado no servidor a partir da publicação; `submission_key` + `request_hash` (idempotência); estado por item em contadores (`pending/preparing/ready/delivered/cancelled_quantity`, soma = `quantity`); cancelamento parcial com motivo; concorrência otimista (`version`).
- **Imutabilidade por trigger**: `orders` e itens não mudam valores; DELETE proibido. Desconto/taxa **não** podem morar no pedido.
- **CHECKs atuais**: `source='LOCAL_MENU'`, `DINE_IN`, `session_id` obrigatório; CREATED só por `TABLE_DEVICE` → equipe ainda não lança pedido.

## 3. Dinheiro
- Tudo em **centavos `Int`**, `currency='BRL'`. Total só por pedido (`total_cents`); líquido calculado em `orderView` (`active_total_cents`).
- **Não existe**: conta/comanda, pagamento, desconto, taxa de serviço, gorjeta, estorno, caixa/turno.

## 4. O que o PDV revertido fazia [Revertido]
- Banco: `order_source += 'POS'`; `restaurants.next_tab_number`; `table_sessions.tab_number` (comanda sequencial por restaurante = sessão); `orders.tab_number_snapshot`, `orders.submitted_by_user_id`; CHECKs aceitando POS e actor USER.
- API: capability `orders:create` (OWNER, MANAGER, WAITER); `GET /menu/published`; `POST /orders` (abre sessão se preciso, ignora `customer_ordering_enabled`, imprime na cozinha).
- Front `/admin/pdv`: mesa → cardápio → carrinho; retry seguro com a mesma `submission_key`.
- **Não tinha** fechamento, pagamento, total da comanda nem relatório.
- Lição técnica: backfill em tabela com trigger exige `DISABLE/ENABLE TRIGGER` (`fa82741`); novas colunas em `orders` exigem atualizar `menu_guard_order_record`.

## 5. Autorização
- Capabilities (`shared/authorization/capabilities.ts`): `menu:*`, `ordering:configure`, `printing:*`, `availability:write`, `orders:read|prepare|deliver|cancel`. OWNER e MANAGER: tudo; WAITER/KITCHEN: operacionais; CLEANING/OTHER: nada.
- Sessões, chamados e mesas usam `ensureRole(OWNER, STAFF)` (até CLEANING fecha atendimento).
- Nova categoria (ex.: CASHIER) exige: enum `staff_category`, capabilities e CHECK `order_event_valid_actor_snapshot`.

## 6. Infra reaproveitável
- `RestaurantUnitOfWork.run` (lock do restaurante, `now` do banco, retry em deadlock, capability revalidada na transação). Eventos só após commit.
- Erros `AppError` + `errorHandler` (`{error, code, message, details}`), Zod, cursor paginado (`shared/utils/cursor.ts`).
- Auditoria genérica imutável: `restaurant_operation_events` → serve para ações de caixa.
- Socket.IO: salas `restaurant:{id}`, `restaurant:{id}:orders`, `user:{id}`; uma instância.
- Jobs com `setInterval` (sem cron com horário fixo).
- Testes Vitest + Postgres real; helpers em `back-end/tests/helpers/`.

## 7. Front-end
- `/admin/waiter` (balcão: chamados, sessões, pedidos), `/admin/cozinha` (KDS), `/admin/mesas`, `/admin/equipe`, `/admin/cardapio`, `/m/[code]` (cliente).
- KPIs hoje (`kpiWaiter.tsx`): chamados pendentes, mesas ativas, pedidos de conta, chamados concluídos desde a meia-noite do navegador. **Sem faturamento, ticket médio nem endpoint de relatório.**

## 8. Lacunas e riscos para o PDV
1. Faltam entidades: comanda, pagamento, ajustes (desconto/taxa/gorjeta), estorno, caixa/turno.
2. Sessão ≠ conta: timeout e desativação de mesa fecham sem olhar pedidos ou pagamento.
3. Pedidos imutáveis: ajustes ficam na comanda.
4. Pedido pela equipe exige refazer CHECKs (o que a `6217c87` fez).
5. **Fuso horário**: timestamps sem tz, sem `restaurants.timezone`; ticket imprime em UTC. Relatórios precisam de fuso e "dia operacional".
6. Categoria não é gravada no pedido; relatório por categoria depende do catálogo/publicação.
7. Relatórios calculados em JS; sem agregados. `GET /orders` limita 100.
8. Integração com maquininha não pode fazer chamada de rede dentro de `unit.run` (lock do restaurante).
9. Impressão só KITCHEN; `order_events.actor_label_snapshot` grava id, não nome.
