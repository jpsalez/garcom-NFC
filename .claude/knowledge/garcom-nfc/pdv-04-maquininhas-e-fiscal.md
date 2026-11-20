# PDV · 04 · Maquininhas (PaymentProvider) e Módulo Fiscal (NFC-e)

> Regras centrais:
> 1. **Zero custódia:** o dinheiro vai direto da maquininha para a conta bancária do restaurante na adquirente.
> 2. **Zero HTTP dentro de lock:** nenhuma chamada à API de maquininha ou API fiscal roda dentro de `RestaurantUnitOfWork.run`.
> 3. **Uma interface, múltiplos provedores:** tanto maquininhas quanto emissão fiscal entram via pasta `providers/` dentro do respectivo módulo, registrados em `back-end/src/shared/container/container.ts`.
> 4. **Segredos sempre cifrados:** tokens OAuth, chaves de API e CSC são cifrados com **AES-256-GCM** (`back-end/src/shared/utils/crypto.ts`).

---

## 1. Variáveis de ambiente e infra compartilhada

### 1.1 Novas variáveis de ambiente (`back-end/.env`)
```env
# Obrigatória para a integração Point (32 bytes em hex: `openssl rand -hex 32`)
CREDENTIALS_ENCRYPTION_KEY=...

# Etapa 4 — Mercado Pago Point (credenciais do seu App de Parceiro no MP Developers)
MERCADO_PAGO_CLIENT_ID=...
MERCADO_PAGO_CLIENT_SECRET=...
MERCADO_PAGO_REDIRECT_URI=https://seu-dominio/api/v1/payment-providers/mercado-pago/oauth/callback
MERCADO_PAGO_WEBHOOK_SECRET=...   # global por env (DEC-18); não há segredo por conta
MERCADO_PAGO_API_URL=https://api.mercadopago.com

# Etapa 6 — Módulo Fiscal (opcional; cada restaurante informa seu próprio token na config ou usa Org Token)
NOTAAS_API_URL=https://platform.notaas.com.br/api/v1
FOCUS_NFE_HOMOLOG_URL=https://homologacao.focusnfe.com.br/v2
FOCUS_NFE_PROD_URL=https://api.focusnfe.com.br/v2
```

### 1.2 Criptografia de segredos (`back-end/src/shared/utils/crypto.ts`)
- Algoritmo: **`aes-256-gcm`** com IV aleatório de 12 bytes (`crypto.randomBytes(12)`).
- Formato salvo no banco: `v1:<iv_base64>:<authTag_base64>:<ciphertext_base64>`.
- Funções pequenas: `encryptSecret(plain: string): string` e `decryptSecret(encoded: string): string`.
- O prefixo `v1:` permite rotação futura de chave sem quebrar dados antigos.

### 1.3 Corpo bruto (`rawBody`)
Não é capturado. O HMAC do Mercado Pago assina um manifesto montado com query e headers (seção 3.3), e o retorno fiscal vem por consulta (DEC-21). Capture o `rawBody` só para uma integração que assine o corpo.

---

## 2. Arquitetura de Maquininhas (`back-end/src/modules/payments/`)

### 2.1 Estrutura de arquivos
```text
back-end/src/modules/payments/
├── payments.routes.ts
├── webhooks.routes.ts               # rotas /webhooks/payments/* (sem JWT, com HMAC)
├── payments.controller.ts
├── payments.service.ts              # regra de negócio + coordenação transacional
├── payments.schemas.ts
├── payments.interfaces.ts
├── payments.repository.interface.ts
├── payments.repository.ts           # Prisma (restaurantId sempre 1º param)
├── terminals.service.ts             # OAuth, sync e CRUD de maquininhas
└── providers/
    ├── payment-provider.interface.ts
    ├── payment-provider.registry.ts # resolve provider por enum (tsyringe)
    ├── manual.provider.ts           # N0 — funciona com qualquer maquininha
    ├── mercado-pago.provider.ts     # N1 — piloto integrado (Point API)
    └── (futuro: stone.provider.ts, pagbank.provider.ts, cielo.provider.ts)
```

### 2.2 Interface dos provedores

`IPaymentProvider` é discriminada por `kind`. `MANUAL` confirma localmente com `recordCharge`. `MERCADO_PAGO` oferece OAuth, terminais, criação e consulta de cobranças e cancelamento. O registry retorna o adaptador apropriado. O estado financeiro é aplicado pelos serviços depois de validar o retorno externo.

Arquivos da integração Point: `payment-provider-accounts.repository.ts`, `payment-terminals.repository.ts`, `payment-sync.queries.ts`, `payment-events.ts`, `point-account.ts`, `point-oauth-state.ts`, `point-credential-refresh.service.ts`, `point-payment-state.ts`, `point-payments.service.ts`, `mercado-pago-http.ts`, `mercado-pago-order.ts`, `terminals.routes.ts` e `terminals.schemas.ts`.

### 2.3 Os 4 níveis de integração (convivem na mesma interface)
| Nível | Provedor | Como funciona | Quando usar |
|---|---|---|---|
| **N0** | `MANUAL` | Operador informa meio + valor (+ bandeira/NSU opcionais). Nasce `APPROVED`. | Dia 1, contingência sem internet, dinheiro, qualquer maquininha não integrada. |
| **N1** | `MERCADO_PAGO` (1º piloto), depois `STONE`, `PAGBANK`, `CIELO` | API REST em nuvem dispara o valor para a Smart POS; webhook confirma com NSU, bandeira, parcelas e taxa. | Restaurante com Smart POS conectada ao Wi-Fi/4G. |
| **N2** | `PAYGO`, `SITEF` (futuro) | Estação local no caixa (mesmo modelo da estação de impressão) conversa com PinPad/TEF multi-adquirente. | Redes maiores que exigem TEF dedicado ou múltiplas bandeiras num único PinPad. |
| **N3** | Conciliação (futuro) | Importação de extrato/API da adquirente (D+1) para enriquecer `payments` manuais com taxa real e recebíveis. | Restaurantes no N0 que querem conciliação financeira automática. |

---

## 3. Especificação do piloto N1: Mercado Pago Point (`mercado-pago.provider.ts`)

### 3.1 Conexão OAuth2 por restaurante

- `GET /api/v1/payment-providers/mercado-pago/oauth/url?environment=SANDBOX` gera a URL de autorização para OWNER/MANAGER. O `state` assinado por HMAC vincula restaurante, usuário e ambiente e vence em dez minutos. Use `environment=PRODUCTION` para credenciais de produção.
- `GET /api/v1/payment-providers/mercado-pago/oauth/callback` exige a sessão do usuário que iniciou a conexão. Valida o `state` antes da troca em `POST /oauth/token` e revalida a permissão ao salvar as credenciais cifradas. A conta já vinculada mantém sua identidade externa para preservar a conciliação.
- `POST /api/v1/payment-terminals/sync?environment=SANDBOX` importa terminais em modo PDV via `GET /terminals/v1/list`. A sincronização preserva rótulos e desativa no sistema os terminais que saírem do modo PDV ou da conta.
- `GET /api/v1/payment-terminals` lista terminais para operadores de pagamento. OWNER/MANAGER cadastram um terminal PDV com um rótulo via `POST`, alteram rótulo ou disponibilidade via `PATCH /api/v1/payment-terminals/:id` e desativam via `DELETE`, preservando o histórico.

### 3.2 Cobrança e idempotência

1. `POST /api/v1/tabs/:id/payments` com `provider=MERCADO_PAGO` reserva saldo e alocações como `PENDING` na transação do restaurante. A operação vincula a conta, o terminal e o turno do operador.
2. Depois do commit, o adaptador cria a order em `POST /v1/orders` com o `X-Idempotency-Key` local, o ID do pagamento como `external_reference` e validade `PT5M`. O Point aceita crédito, débito, voucher e Pix. Para crédito parcelado, o vendedor assume o custo do parcelamento e precisa habilitar o plano de parcelas na conta.
3. O retorno válido da criação vincula o ID da order e muda o estado para `PROCESSING` em nova transação. A API responde `202`. A confirmação de crédito depende da consulta autenticada.
4. Em rejeição definitiva da primeira criação, o pagamento passa a `CANCELLED`, liberando saldo e alocações, e a API responde `502 PROVIDER_UNAVAILABLE`. Após timeout ou resposta ambígua, a API responde `202 PENDING` e mantém a reserva.
   Quando uma cobrança vinda de solicitação do cliente termina `DECLINED`, `CANCELLED` ou `EXPIRED`, a solicitação volta de `CONVERTED` para `ACCEPTED` na mesma transação e o balcão recebe `payment_request:updated`.
5. Repetir a mesma chave e o mesmo payload retorna o pagamento já registrado. O estorno integrado está indisponível no endpoint local (`INTEGRATED_REFUND_UNAVAILABLE`). O estorno de pagamento manual segue disponível.

[Processamento de pagamentos Point](https://www.mercadopago.com.br/developers/pt/docs/mp-point/payment-processing)

### 3.3 Validação do webhook

`POST /api/v1/webhooks/payments/mercado-pago` usa `data.id` da query, `x-request-id` e `ts` de `x-signature`. Valida HMAC-SHA256 do manifesto `id:${dataIdLowerCase};request-id:${requestId};ts:${ts};` com comparação em tempo constante e tolerância de dez minutos. Assinatura inválida retorna `401 INVALID_WEBHOOK_SIGNATURE`.

Depois da assinatura, a integração identifica o vínculo local e consulta `GET /v1/orders/{id}` com a credencial da conta correspondente. Antes de consolidar um pagamento, valida ID, referência local, conta, terminal, método e centavos pagos. A transação revalida o vínculo e o estado do pagamento, registrando mudanças em auditoria com ator SYSTEM. Eventos Socket.IO saem após o commit.

[Notificações de orders Point](https://www.mercadopago.com.br/developers/pt/docs/mp-point/notifications)

### 3.4 Reconciliação e renovação

O job `payment-reconciliation.job.ts` consulta em lotes os pagamentos pendentes. Os estados `created`, `at_terminal` e `action_required` mantêm a reserva. A order processada com pagamento creditado vira `APPROVED`. Cancelamento, expiração e falha definitiva confirmados liberam a reserva. Um `202` de cancelamento no terminal mantém `PROCESSING` até confirmação por consulta ou notificação posterior.

Uma criação sem ID é retomada com a mesma chave dentro dos primeiros cinco minutos. Na retomada, só `400`/`422` (payload recusado) cancelam a reserva; `409` de terminal ocupado, `401`/`403` e `404` podem vir da order criada pela tentativa anterior e mantêm o pagamento `PENDING`. Se continuar ambígua depois dessa janela, a reserva permanece e o pagamento sai com `needs_review: true`. Depois de 11 min (a última retomada cria uma order que ainda vale 5 min no terminal), a conferência é manual (DEC-16) em `POST /api/v1/tabs/:id/payments/:paymentId/resolve`, com `payments:create`. `NOT_CHARGED` exige motivo, cancela e libera a reserva com auditoria `POINT_PAYMENT_RELEASED`. `CHARGED` recebe o `order_id` do Mercado Pago e consolida o status pela consulta autenticada, com as mesmas validações do webhook. Antes da janela ou com ID externo vinculado, a rota responde `409 POINT_PAYMENT_NOT_REVIEWABLE`. O job aplica `EXPIRED` apenas com confirmação de expiração ou de cancelamento da tentativa vencida. A renovação diária consulta contas com token a vencer em até 30 dias e usa atualização condicional ao gravar novas credenciais.

[Estados de orders Point](https://www.mercadopago.com.br/developers/pt/docs/mp-point/resources/status-order-transaction)

---

## 4. Módulo Fiscal — NFC-e (Etapa 6)

### 4.1 Comparativo real de APIs NFC-e no Brasil (2026)
> **Nota importante:** a **Nuvem Fiscal** encerrou suas operações em 31/07/2026 e não está mais disponível.

| Opção | Custo em Homologação | Custo em Produção | Facilidade em Node.js | Indicação |
|---|---|---|---|---|
| **Notaas** | **Grátis** (até 5 CNPJs em sandbox multi-CNPJ, sem cartão) | **Grátis até 20 notas/mês** (1 CNPJ); planos pagos ao escalar | **Muito alta** (REST JSON, webhooks HMAC-SHA256, upload A1 por API) | **1º adaptador — ideal para MVP e piloto a custo R$ 0** |
| **Focus NFe** | **Grátis** (homologação ilimitada com a SEFAZ) | Pago (~R$ 95/mês solo; Growth ~R$ 572/mês multi-CNPJ) | **Muito alta** (apenas 3 endpoints REST v2, síncrono, Basic Auth) | **2º adaptador — produção consolidada em escala** |
| **ACBrLib (Open Source)** | Grátis | R$ 0 por nota | **Alta complexidade** (FFI `.so`/`.dll`, cert local, NTs SEFAZ na mão) | Só compensa em alto volume futuro |

### 4.2 Estrutura do módulo `fiscal` (implementada)
```text
back-end/src/modules/fiscal/
├── fiscal.routes.ts            # /fiscal/settings, /fiscal/tax-profiles, /fiscal/products/:id/tax-profile, /tabs/:id/nfce*
├── fiscal.controller.ts        # HTTP puro
├── fiscal.service.ts           # configuração, perfis, consulta, conferência/reenvio e cancelamento (com ator)
├── fiscal-emission.service.ts  # emissão pós-commit, aplicação do resultado e job de acompanhamento (sem ator)
├── fiscal-document.ts          # reserva no fechamento, valor da nota, needs_review e view
├── nfce-input.ts               # comanda + perfis → NfceInput
├── fiscal.mapper.ts            # tPag e rateio no centavo (desconto por item, pagamentos até o total da nota)
├── fiscal.schemas.ts / fiscal.interfaces.ts / fiscal-events.ts (fiscal:updated)
├── fiscal.repository.ts        # restaurantId sempre 1º parâmetro; updateDocument condicional por estado/tentativa
├── fiscal-sync.queries.ts      # chaves para o job (cross-tenant; o serviço revalida no tenant)
└── providers/
    ├── fiscal-provider.interface.ts  # IFiscalProvider
    ├── fiscal-provider.registry.ts   # MOCK | NOTAAS | FOCUS_NFE
    ├── fiscal-http.ts                # fetch com timeout, FiscalProviderError (ambíguo), bandeira tBand
    ├── notaas.provider.ts
    ├── focus-nfe.provider.ts
    └── mock-fiscal.provider.ts       # só homologação; recusado em PRODUCAO
```
Job: `back-end/src/shared/jobs/fiscal-reconciliation.job.ts` (a cada 30 s). Migration `20261121100000_fiscal_nfce`.

### 4.3 Contrato `IFiscalProvider`
```ts
interface IFiscalProvider {
  readonly kind: fiscal_provider_type;
  readonly idempotentReference: boolean; // Focus e Mock deduplicam pela ref; Notaas não
  emit(account, input: NfceInput): Promise<NfceResult>;          // PROCESSING | AUTHORIZED | REJECTED
  status(account, externalId): Promise<NfceResult | null>;       // null = não existe no provedor
  cancel(account, externalId, reason): Promise<CancelResult>;    // CANCELLED | REQUESTED | FAILED
}
```
Só resultado **ambíguo** (timeout, rede, 5xx, 429, 408, resposta ilegível) lança `FiscalProviderError`. Uma recusa definitiva (4xx) volta como `REJECTED`/`FAILED`, porque a nota não entrou no provedor.

### 4.4 Valor da nota e mapeamento (DEC-19)
- **Valor da nota** = itens ativos (`subtotal_cents`) − descontos ativos. Taxa de serviço, couvert e gorjeta ficam **fora** da NFC-e, porque nenhum dos provedores aceita `vOutro` por item. Comanda com valor ≤ 0 não gera nota.
- O desconto é rateado entre os itens pelo valor bruto. O resto do arredondamento vai para o maior item e, se passar do bruto dele, o excedente vai para os itens com folga.
- Os pagamentos aprovados são rateados até somar exatamente o valor da nota, sem `vTroco`, que nenhum dos provedores documenta. Invariante testada: `Σ(vProd − vDesc) = Σ vPag`.
- `tPag`: CASH→01, CREDIT→03, DEBIT→04, VOUCHER→10, PIX→17, OTHER→99. Cartão leva `tipoIntegracao` (1 se a maquininha é integrada, 2 se é manual), a bandeira (`tBand`) deduzida do `card_brand` e o `cAut` vindo de `authorization_code`.
- Perfil tributário: o do produto (`menu_products.fiscal_tax_profile_id`) ou, na falta dele, o `default_tax_profile_id`. Sem perfil, a nota é rejeitada localmente (`sefaz_status = LOCAL`) e a comanda continua fechada.
- Emitente, CSC, certificado A1, série e numeração ficam configurados **no provedor**. O número e a série vêm da resposta.

### 4.5 Contratos HTTP (conferidos na documentação oficial em 20/11/2026)
- **Notaas** (`https://docs.notaas.com.br/docs/nfe/endpoints`):
  - `x-api-key: <chave do projeto>`; base `NOTAAS_API_URL` (padrão `https://platform.notaas.com.br/api/v1`).
  - Emitir: `POST /nfe/emitir` com `modelo: 65`, `items[]` e `pagamentos[]` em reais → `202 { invoiceId }`. O resultado vem de `GET /nfe/invoices/{invoiceId}/status`.
  - Cancelar: `POST /nfe/cancelar { invoiceId, motivo }` → `202`.
  - **Não há idempotência**: reenviar cria outra nota.
  - O CPF/CNPJ do cliente não é enviado, porque a Notaas exige nome e endereço quando há destinatário.
  - A documentação diverge entre `/emitir` e `/nfe/emitir` e entre `/invoices/{id}/status` e `/nfe/invoices/{id}/status`. Foi usado o da página de endpoints; confirmar no sandbox.
- **Focus NFe** (`https://doc.focusnfe.com.br/docs/nfce-operacoes-disponiveis-na-api`):
  - Basic Auth com token como usuário e senha vazia; bases `FOCUS_NFE_HOMOLOG_URL` e `FOCUS_NFE_PROD_URL`.
  - Emitir: `POST /nfce?ref=<id>-<tentativa>` → `201` com `status` `autorizado` ou `erro_autorizacao`.
  - `422 pending_operation` e 2xx sem corpo legível → ambíguo.
  - `401`/`403` → recusa (nada foi processado).
  - Qualquer outro 4xx consulta a ref antes de virar recusa: se ela existe, o resultado é adotado; se dá 404, é recusa.
  - Consultar: `GET /nfce/<ref>` (404 = não existe).
  - Cancelar: `DELETE /nfce/<ref> { justificativa }` (15–255 caracteres, até 30 min).
  - `caminho_danfe` e `caminho_xml_nota_fiscal` são relativos e são convertidos em absolutos.
- O resultado assíncrono vem por **consulta periódica** (DEC-21). Não há webhook fiscal nem captura de `rawBody`.

### 4.6 Fluxo de emissão
1. O fechamento (`close-tab.ts`, que cobre o manual, o automático e o da sessão) reserva `fiscal_documents(PENDING)` no mesmo `unit.run`, se `fiscal_settings.enabled`.
2. Depois do commit, `FiscalEmissionService.dispatch`:
   - reivindica o documento numa transação curta (`dispatched_at`, e `external_id = ref` quando o provedor é idempotente) e monta a nota;
   - faz o HTTP fora do lock;
   - aplica o resultado com atualização condicional por estado e tentativa;
   - emite `fiscal:updated`.

   O `POST /tabs/:id/close` responde com `fiscal_document`. No fechamento automático por pagamento, o resultado chega pelo evento e por `GET /tabs/:id/nfce`.
3. **Ambíguo (DEC-20)**:
   - **Focus e Mock:** o job consulta a ref. Se ela não existe (404), reenvia com a mesma ref, o que é seguro.
   - **Notaas sem `invoiceId`:** **nunca reenvia**. Depois de 5 min, `needs_review = true`. A pessoa confere no painel da Notaas e chama `POST /tabs/:id/nfce/retry`:
     - com `{ invoice_id }`, que vincula a nota e só vale depois da consulta de status;
     - ou com `{ confirm_not_issued: true }`, que abre uma nova tentativa.
4. Rejeição: a comanda segue fechada e paga. Depois de corrigir o perfil ou a configuração, `POST /tabs/:id/nfce/retry` gera `attempt + 1` (nova ref) com o provedor atual.
5. Cancelamento: `POST /tabs/:id/nfce/cancel { reason }` (15–255 caracteres, `fiscal:configure` = OWNER/MANAGER).
   - A Focus é síncrona.
   - Na Notaas o pedido fica em `cancel_requested_at` até o job ver `cancelled`. Sem efeito em 10 min, o pedido é liberado.
   - Uma recusa responde `409 FISCAL_CANCEL_REJECTED`.
6. Permissões:
   - configuração e perfis: `fiscal:configure`;
   - consulta e reenvio: `fiscal:emit`.
7. Credencial:
   - É cifrada com AES-256-GCM (`crypto.ts`) e só pode ser escrita: a API devolve apenas `has_credential`.
   - Trocar de provedor descarta a credencial anterior.
   - Provedor real habilitado sem credencial é recusado pela API e por um CHECK, assim como o MOCK em `PRODUCAO`.
   - Um documento só usa a credencial do provedor em que foi emitido. Se o provedor mudar com notas em andamento, elas ficam paradas (`FISCAL_PROVIDER_CHANGED` no log) até voltar ao provedor anterior.
8. O mesmo `external_id` não pode ser vinculado a duas comandas (índice único parcial `fiscal_documents_external_unique`).
9. Notas que esperam configuração ou falham ao ser montadas:
   - Se o provedor ou o ambiente da configuração não bate com o da nota, ou se falta credencial, a nota espera sem HTTP e sem ser rejeitada. O motivo fica em `sefaz_message` ("Aguardando configuração fiscal (<code>)") e no log `fiscal.waiting_configuration`. O cancelamento também recusa nesse caso.
   - Uma falha determinística ao montar a nota (um `AppError`) vira `REJECTED` local com o code. Falha de infraestrutura (conexão, lock, deadlock) mantém a nota `PENDING` sem envio, e o job tenta de novo.
   - Sem pagamento aprovado, ou com pagamentos abaixo do valor da nota (por exemplo, depois de um estorno), o reenvio é rejeitado localmente.
   - Na Notaas, uma nota `PROCESSING` cujo `invoiceId` responde 404 volta para `PENDING` sem ID, ou seja, para a conferência humana. O motivo e o ID antigo ficam em `sefaz_status = NOT_FOUND` e `sefaz_message` ("Notaas não encontrou <id>; confira no painel antes de reenviar"), com o log `fiscal.external_id_not_found`. O 404 pode ser só atraso de consistência depois do 202, então confira no painel antes de `confirm_not_issued`. O job nunca reenvia.
   - Na Notaas, um 4xx no cancelamento consulta o status antes de declarar falha.
10. Estorno (DEC-22): bloqueado com NFC-e `AUTHORIZED` (`409 FISCAL_DOCUMENT_AUTHORIZED`) ou em emissão (`409 FISCAL_DOCUMENT_IN_PROGRESS`). Cancele a nota e depois estorne. Com a nota `REJECTED` ou `CANCELLED`, o estorno segue normal.
11. O job considera um documento parado depois de 45 s, mais que o timeout HTTP de 20 s, para não consultar uma emissão ainda em curso.

### 4.7 Limitações conhecidas
- Uma nota parada esperando configuração (credencial ausente, ou provedor ou ambiente trocado) bloqueia o estorno com `FISCAL_DOCUMENT_IN_PROGRESS` até a configuração ser corrigida. Não há prazo que a rejeite sozinha: quem corrige é quem configura o módulo.
- Devolução por nota de devolução (NF-e de entrada) fora do escopo. Depois do prazo de cancelamento da SEFAZ (30 min em SP; 24 h na maioria das UFs), o pagamento de uma comanda com NFC-e autorizada não pode ser estornado pelo sistema (DEC-22).
- Configuração fiscal e cancelamento de nota ainda não gravam na trilha de auditoria (`audit`).
- Para `tPag 99` a Notaas recebe `descricaoPagamento: "Outros"`. A documentação da Focus não especifica a descrição (`xPag`), que não é enviada.
- Na Notaas, o CPF/CNPJ do cliente não vai na nota (seção 4.5).
- `POST /tabs/:id/close` aguarda a emissão (até cerca de 20 s com um provedor lento) para responder com `fiscal_document`. O fechamento já está gravado antes disso.
