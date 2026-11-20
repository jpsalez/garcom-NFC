# PDV · 01 · Planejamento consolidado

> **Status:** Planejamento macro fechado (20/11/2026). Todas as decisões de produto (`PDV-D01` a `PDV-D12`) estão resolvidas.
> **Mapa da documentação do PDV:**
> - [pdv-00-levantamento.md](pdv-00-levantamento.md) — estado atual do código (`dev`), divergência `main`/`dev` e lacunas.
> - [pdv-01-planejamento.md](pdv-01-planejamento.md) — visão geral, decisões fechadas, permissões e roadmap em etapas.
> - [pdv-02-modelo-de-dados.md](pdv-02-modelo-de-dados.md) — tabelas, campos, índices parciais, triggers e alterações no schema atual.
> - [pdv-03-fluxos-e-api.md](pdv-03-fluxos-e-api.md) — fluxos passo a passo, endpoints REST, códigos de erro e eventos Socket.IO.
> - [pdv-04-maquininhas-e-fiscal.md](pdv-04-maquininhas-e-fiscal.md) — arquitetura `PaymentProvider` (N0 Manual + N1 Mercado Pago Point + expansão) e módulo fiscal NFC-e opcional (`FiscalProvider`).
> - [pdv-05-kpis-e-previsoes.md](pdv-05-kpis-e-previsoes.md) — histórico diário/semanal/mensal, agregados, catálogo de KPIs e motor de previsões.
> - [pdv-06-guia-de-implementacao-e-testes.md](pdv-06-guia-de-implementacao-e-testes.md) — roteiro etapa por etapa (0 a 6), checklist de arquivos e matriz de testes Vitest.

## 1. Objetivo
Controlar o consumo e o fechamento das contas do restaurante (mesa e balcão), **registrar** todos os pagamentos (maquininhas integradas, manual, Pix, dinheiro), gerenciar turnos de caixa, suportar emissão opcional de NFC-e e transformar os dados em histórico, KPIs e previsões de demanda/faturamento.

**Regra de ouro:** o dinheiro **não** circula dentro do sistema — cai direto na conta do restaurante na adquirente. O PDV captura e concilia todos os dados das transações para operação, auditoria, métricas e previsão.

## 2. Princípios de arquitetura
- **Pedidos imutáveis:** `orders`, `order_items` e `order_item_options` mantêm suas triggers de imutabilidade. Ajustes (desconto, 10%, couvert, gorjeta) moram em `tab_adjustments`; pagamentos e divisões moram em `payments` e `payment_allocations`.
- **Dinheiro em centavos (`Int`):** moeda `BRL`; totais da comanda congelados no fechamento.
- **Sem rede dentro de transação:** nenhuma chamada HTTP a maquininha ou API fiscal ocorre dentro do `RestaurantUnitOfWork.run` (lock do restaurante). Padrão sempre em 3 passos: grava intenção `PENDING` → chama API externa → confirma por webhook/consulta.
- **Isolamento multi-tenant:** todo repositório recebe `restaurantId` (vindo do JWT) como primeiro parâmetro e usa FKs compostas `(restaurant_id, ...)`.
- **Desenho limpo do zero (`PDV-D04`):** não aproveitar o modelo revertido (`6217c87`). Alinhar `main` e `dev` antes de criar as novas migrations.

## 3. Decisões fechadas (`PDV-D01` a `PDV-D12`)
| ID | Tema | Decisão |
|---|---|---|
| PDV-D01 | Comanda × mesa | **1 comanda compartilhada por mesa**, com **fracionamento no fechamento** via `payments` + `payment_allocations` (valor livre/igual, por item/fração e atalho por aparelho NFC). |
| PDV-D02 | Papéis que fecham contas | `OWNER`, `MANAGER`, **`CASHIER` (nova categoria)** e **`WAITER`**. |
| PDV-D03 | Maquininhas (início) | **N0 (manual universal)** + **N1 Mercado Pago Point** como primeiro provedor integrado (OAuth por restaurante). Demais adquirentes entram como novos adaptadores na mesma interface. |
| PDV-D04 | Tentativa anterior (`6217c87`) | Descartada — construir do zero com esta arquitetura (alinhando `main`/`dev` na Etapa 0). |
| PDV-D05 | Experiência do cliente no NFC | Cliente vê *Conta da mesa* e *Meus pedidos* (via `session_token` + `guest_label` opcional), monta sua parte e envia uma **solicitação de pagamento** (`payment_requests`) para o garçom/caixa. Pix pago direto no celular fica como evolução futura. |
| PDV-D06 | Permissões sensíveis | `WAITER` recebe e fecha comanda quitada; `CASHIER` também opera turno de caixa e remove 10% (com motivo); desconto, estorno e cancelamento de comanda ficam restritos a `OWNER` e `MANAGER`, sempre auditados. |
| PDV-D07 | Escopo estruturado | Planejar o conjunto completo (mesa, balcão/avulsa, divisão, caixa, maquininhas, KPIs/previsões e fiscal opcional), implementando etapa por etapa. |
| PDV-D08 | Custo do produto (CMV) | Fora do PDV agora — responsabilidade de um módulo futuro de **Estoque / Insumos / Ficha Técnica**, que depois pluga nos relatórios do PDV. |
| PDV-D09 | Fuso e dia operacional | `restaurants.timezone` padrão `America/Sao_Paulo` (configurável por restaurante) + `business_day_cutoff` configurável (padrão `00:00`, ajustável para ex.: `05:00` em casas noturnas). |
| PDV-D10 | Numeração da comanda | **Sequencial contínua** por restaurante (`#1, #2, #3...`) + **identificador/apelido opcional** (`label`, ex.: `"Cartão 45"`, `"João - Balcão"`). |
| PDV-D11 | Taxa de serviço e timeout | Taxa de serviço **configurável por restaurante** (`service_fee_bps`, ex.: `1000` = 10% ou `0`), aplicada na pré-conta e removível com motivo. No **timeout da sessão NFC (4 h)**, a sessão expira por segurança, mas a **comanda permanece aberta** até pagamento/fechamento; novo scan da mesa reconecta à mesma comanda aberta. |
| PDV-D12 | Nota fiscal (NFC-e) | Entra no escopo como **Etapa 6 (módulo fiscal opcional via `IFiscalProvider` — Notaas para piloto gratuito + Focus NFe para escala)** usando perfis tributários reutilizáveis. Desde a Etapa 2, `payments` já salva os campos exigidos pelo fisco (NSU, autorização, bandeira, credenciadora). |

## 4. Matriz de permissões (capabilities)
Nova categoria em `staff_category`: `CASHIER` (atualizar também o CHECK `order_event_valid_actor_snapshot`).

| Capability | OWNER | MANAGER | CASHIER | WAITER | KITCHEN |
|---|:---:|:---:|:---:|:---:|:---:|
| `orders:create` (lançar pedido pelo PDV) | Sim | Sim | Sim | Sim | Não |
| `tabs:read` (comandas abertas, pré-conta, `payment_requests`) | Sim | Sim | Sim | Sim | Não |
| `tabs:manage` (abrir avulsa, transferir/juntar mesa) | Sim | Sim | Sim | Sim | Não |
| `payments:create` (receber / disparar maquininha) | Sim | Sim | Sim | Sim | Não |
| `tabs:close` (fechar comanda quitada) | Sim | Sim | Sim | Sim | Não |
| `tabs:service_fee_waive` (remover taxa de serviço com motivo) | Sim | Sim | Sim | Não | Não |
| `tabs:discount` (aplicar desconto com motivo) | Sim | Sim | Não | Não | Não |
| `payments:refund` (estornar pagamento com motivo) | Sim | Sim | Não | Não | Não |
| `tabs:cancel` (cancelar comanda com motivo) | Sim | Sim | Não | Não | Não |
| `cash_shift:operate` (abrir/fechar turno, sangria/suprimento) | Sim | Sim | Sim | Não | Não |
| `terminals:configure` (conectar Mercado Pago / maquininhas) | Sim | Sim | Não | Não | Não |
| `fiscal:configure` (certificado A1, CSC, perfis tributários) | Sim | Sim | Não | Não | Não |
| `fiscal:emit` (emitir/consultar NFC-e no fechamento) | Sim | Sim | Sim | Sim | Não |
| `reports:read` (histórico, KPIs e previsões) | Sim | Sim | Próprio turno* | Não | Não |

*\*`CASHIER` consulta apenas o resumo do próprio turno para conferência de gaveta.*

## 5. Roadmap estruturado (7 etapas)
| Etapa | Nome | Entregáveis no back-end | Dependência |
|---|---|---|---|
| **0** | Alinhamento & Fundação | Alinhar `main`/`dev`; migration com `restaurants.timezone`, `business_day_cutoff`, `service_fee_bps`, `next_tab_number`; enum `staff_category += CASHIER` + CHECKs; capabilities novas. | — |
| **1** | Comandas (`tabs`) + Pedido PDV | Módulo `tabs` (mesa + balcão), vínculo `table_sessions.tab_id` e `orders.tab_id`, `orders.source += POS`, `order_items.category_name_snapshot`, transferir/juntar mesas, timeout desacoplado da comanda. | Etapa 0 |
| **2** | Fechamento, Divisão & NFC | `tab_adjustments`, pré-conta, `session_tokens.guest_label`, `payment_requests` (NFC), `payments` + `payment_allocations` no adaptador **N0 Manual**, fechar/estornar/cancelar, eventos Socket.IO. | Etapa 1 |
| **3** | Turno de Caixa | Módulo `cash-shifts`: `cash_shifts` + `cash_movements` (abertura, sangria, suprimento, fechamento com conferência de gaveta e diferença). | Etapa 2 |
| **4** | Maquininhas (Mercado Pago Point) | Interface `PaymentProvider`, `payment_provider_accounts` (OAuth cifrado), `payment_terminals`, adaptador **N1 Mercado Pago Point**, webhook assinado + polling fallback + reconexão segura. | Etapa 2 |
| **5** | Histórico, KPIs & Previsões | Tabelas agregadas `daily_sales` e `product_sales_daily`, atualização transacional no fechamento/estorno + job de reconciliação, endpoints de histórico (diário/semanal/mensal), KPIs e previsões. | Etapas 2 e 3 |
| **6** | Módulo Fiscal (NFC-e opcional) | Interface `IFiscalProvider` (`notaas.provider.ts` grátis no piloto + `focus-nfe.provider.ts` para escala), `fiscal_settings`, `fiscal_tax_profiles` no cardápio, `fiscal_documents`, emissão assíncrona no fechamento, cancelamento e DANFE/QR. | Etapa 2 |

## 6. Módulos sugeridos no back-end (`back-end/src/modules/`)
Para manter funções pequenas e uma responsabilidade por arquivo (conforme `.claude/CLAUDE.md`):
- `tabs/` — ciclo de vida da comanda, ajustes, transferência/junção, pré-conta, `payment_requests`.
- `payments/` — pagamentos, alocações de itens, estornos, `PaymentProvider` + subpasta `providers/` (`manual.provider.ts`, `mercado-pago.provider.ts`) e gestão de terminais/OAuth.
- `cash-shifts/` — abertura/fechamento de turno, sangria, suprimento e conferência.
- `reports/` — atualização de agregados, histórico de vendas, KPIs e previsões.
- `fiscal/` (Etapa 6) — perfis tributários, configuração fiscal e adaptador `FiscalProvider`.

## 7. Histórico da conversa
- 20/11/2026 (rodada 1): levantamento do código + primeira proposta.
- 20/11/2026 (rodada 2): fechadas `PDV-D01` a `PDV-D04`; lógica de fracionamento integrada ao NFC.
- 20/11/2026 (rodada 3): fechadas `PDV-D05` a `PDV-D08`; escopo completo em etapas; CMV movido para futuro módulo de Estoque/Insumos.
- 20/11/2026 (rodada 4): fechadas `PDV-D09` a `PDV-D12` (timezone/dia operacional, numeração contínua + apelido, taxa configurável + timeout desacoplado, NFC-e opcional na Etapa 6). Criados os documentos técnicos `pdv-02` a `pdv-05`.
