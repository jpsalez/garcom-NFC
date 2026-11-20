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
MERCADO_PAGO_WEBHOOK_SECRET=...
MERCADO_PAGO_API_URL=https://api.mercadopago.com

# Etapa 6 — Módulo Fiscal (opcional; cada restaurante informa seu próprio token na config ou usa Org Token)
NOTAAS_API_URL=https://api.notaas.com.br
FOCUS_NFE_HOMOLOG_URL=https://homologacao.focusnfe.com.br/v2
FOCUS_NFE_PROD_URL=https://api.focusnfe.com.br/v2
```

### 1.2 Criptografia de segredos (`back-end/src/shared/utils/crypto.ts`)
- Algoritmo: **`aes-256-gcm`** com IV aleatório de 12 bytes (`crypto.randomBytes(12)`).
- Formato salvo no banco: `v1:<iv_base64>:<authTag_base64>:<ciphertext_base64>`.
- Funções pequenas: `encryptSecret(plain: string): string` e `decryptSecret(encoded: string): string`.
- O prefixo `v1:` permite rotação futura de chave sem quebrar dados antigos.

### 1.3 Captura de `rawBody` no Express (`back-end/src/server.ts`)
O `express.json` preserva o buffer bruto apenas em `/api/v1/webhooks/*` para integrações que assinam o corpo. O Mercado Pago assina o manifesto descrito na seção 3.3.

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

Uma criação sem ID é retomada com a mesma chave dentro dos primeiros cinco minutos. Na retomada, só `400`/`422` (payload recusado) cancelam a reserva; `409` de terminal ocupado, `401`/`403` e `404` podem vir da order criada pela tentativa anterior e mantêm o pagamento `PENDING`. Se continuar ambígua depois dessa janela, a reserva permanece e exige conferência operacional. O job aplica `EXPIRED` apenas com confirmação de expiração ou de cancelamento da tentativa vencida. A renovação diária consulta contas com token a vencer em até 30 dias e usa atualização condicional ao gravar novas credenciais.

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

### 4.2 Estrutura do módulo `fiscal` e `providers/`
```text
back-end/src/modules/fiscal/
├── fiscal.routes.ts                 # /fiscal/settings, /fiscal/tax-profiles, /tabs/:id/nfce, /webhooks/fiscal/*
├── fiscal.controller.ts             # HTTP puro (sem try/catch, sem Prisma)
├── fiscal.service.ts                # emissão, consulta, reenvio, cancelamento e perfis tributários
├── fiscal.mapper.ts                 # converte tab + orders + payments -> payload fiscal neutro + rateio
├── fiscal.schemas.ts                # Zod (CNPJ 14 dígitos, NCM 8, CFOP 4, CSOSN 3-4, justificativa 15-255)
├── fiscal.interfaces.ts
├── fiscal.repository.interface.ts
├── fiscal.repository.ts             # Prisma (restaurantId sempre 1º param)
└── providers/
    ├── fiscal-provider.interface.ts # IFiscalProvider
    ├── fiscal-provider.registry.ts  # resolve MOCK | NOTAAS | FOCUS_NFE (tsyringe)
    ├── notaas.provider.ts           # piloto gratuito (5 CNPJs sandbox + 20 notas/mês grátis)
    ├── focus-nfe.provider.ts        # produção consolidada (3 endpoints REST v2)
    └── mock-fiscal.provider.ts      # testes Vitest sem rede
```

### 4.3 Contrato `IFiscalProvider` (`fiscal-provider.interface.ts`)
```ts
export type FiscalProviderType = "MOCK" | "NOTAAS" | "FOCUS_NFE";

export interface IFiscalProvider {
  readonly kind: FiscalProviderType;
  emitNfce(config: FiscalAccountConfig, input: NfceEmitInput): Promise<NfceProviderResult>;
  getNfceStatus(config: FiscalAccountConfig, reference: string): Promise<NfceProviderResult>;
  cancelNfce(config: FiscalAccountConfig, reference: string, reason: string): Promise<NfceProviderResult>;
  parseWebhook?(headers: Record<string, string>, rawBody: Buffer, secret: string): Promise<NfceProviderResult | null>;
}
```
Campos de entrada/saída:
- **`NfceEmitInput`:** `reference` (`fiscal_documents.id`), `number`, `issuedAt`, `customerDocument?`, `items[]` (`code`, `description`, `ncm`, `cfop`, `csosn`, `origin`, `unit`, `quantity`, `unitPriceCents`, `discountCents`, `additionCents`), `payments[]` (`method`, `amountCents`, `changeCents`, `card?: { brand, acquirerCnpj, authorizationCode, integrated }`).
- **`NfceProviderResult`:** `status` (`PENDING`/`AUTHORIZED`/`REJECTED`/`CANCELLED`), `accessKey` (44 dígitos), `protocol`, `sefazStatus`, `sefazMessage`, `xmlUrl`, `danfeUrl`, `qrcodeUrl`, `rawPayload`.

### 4.4 Mapeamento fiscal neutro (`fiscal.mapper.ts`)
- **Pagamentos (`tPag` SEFAZ):** `CASH→01` (envia `vTroco`), `CREDIT→03`, `DEBIT→04`, `VOUCHER→10/11`, `PIX→17`, `OTHER→99`. Para `CREDIT`/`DEBIT`: grupo `card` com `tpIntegra` (`1` para N1/N2, `2` para N0), `tBand`, `cAut`, `CNPJ` da credenciadora.
- **Invariante matemática SEFAZ:** `Σ(vProd - vDesc + vOutro) === Σ(vPag - vTroco)` no centavo exato. O mapper rateia `adjustments_cents` e `service_fee_cents` proporcionalmente pelos itens ativos e aloca qualquer resto de arredondamento (±1–2 centavos) no item de maior valor.
- **Perfis tributários reutilizáveis (`fiscal_tax_profiles`):** restaurante cria 2–3 perfis (ex.: *Refeição preparada*, *Bebida ST*) + define um `default_tax_profile_id` em `fiscal_settings`. Se faltar NCM/CFOP, falha localmente com `400 FISCAL_TAX_PROFILE_MISSING`.

### 4.5 Mapeamento HTTP dos adaptadores
- **`notaas.provider.ts`:** `Authorization: Bearer <token>`, `POST /api/v1/emitir` (modelo `65`), upload do A1 centralizado na Notaas, webhook assinado com **HMAC-SHA256**.
- **`focus-nfe.provider.ts`:** HTTP Basic Auth (`username = apiToken`, `password = ""`), 3 endpoints:
  - Emitir (síncrono): `POST /v2/nfce?ref=<doc_id>&completa=1`
  - Consultar: `GET /v2/nfce/<doc_id>?completa=1`
  - Cancelar (prazo SEFAZ 30 min): `DELETE /v2/nfce/<doc_id>` `{ "justificativa": "..." }` (15–255 chars).

### 4.6 Execução assíncrona segura
1. `POST /tabs/:id/close` fecha a comanda e, se `fiscal_settings.enabled`, reserva `fiscal_documents(PENDING, next_nfce_number)` dentro do `unit.run`.
2. **Após o commit**, `FiscalService.dispatchEmission(restaurantId, docId)` chama `provider.emitNfce` fora do lock, salva resultado (`AUTHORIZED` ou `REJECTED`) e emite `fiscal:updated` no Socket.IO.
3. Em caso de rejeição SEFAZ, a comanda permanece fechada/paga; o gerente ajusta o cadastro fiscal e aciona `POST /tabs/:id/nfce/retry`.
