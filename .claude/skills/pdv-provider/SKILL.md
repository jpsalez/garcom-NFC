---
name: pdv-provider
description: Cria ou estende adaptadores de maquininha (IPaymentProvider) ou nota fiscal NFC-e (IFiscalProvider) em providers/ com segurança, criptografia AES-256-GCM, webhooks HMAC e zero HTTP dentro de lock. Uso: /pdv-provider <payment|fiscal> <nome>
---

Workflow para criar ou atualizar provedores externos do PDV (`back-end/src/modules/payments/providers/` ou `back-end/src/modules/fiscal/providers/`).

## Referência obrigatória
Leia `.claude/knowledge/garcom-nfc/pdv-04-maquininhas-e-fiscal.md` antes de iniciar.

## Regras invioláveis
1. **Zero HTTP dentro de `RestaurantUnitOfWork.run`:** sempre grave `PENDING` numa transação curta → chame a API externa fora do lock (com `AbortSignal.timeout`) → confirme resultado em nova transação curta → emita Socket.IO após commit.
2. **Zero custódia / PCI:** nunca peça ou salve número de cartão ou CVV.
3. **Segredos cifrados:** tokens OAuth, chaves de API e CSC entram/saem via `encryptSecret`/`decryptSecret` (`back-end/src/shared/utils/crypto.ts`, AES-256-GCM) e nunca vão para logs ou respostas HTTP.
4. **Webhooks seguros:** use `req.rawBody` + HMAC-SHA256 com `crypto.timingSafeEqual` + verificação de timestamp anti-replay; em pagamentos (Mercado Pago), faça `GET` autoritativo antes de aprovar.
5. **Idempotência dupla:** `idempotency_key` no banco (`UNIQUE`) e no header/referência do provedor.
6. **Invariante fiscal (para `IFiscalProvider`):** `fiscal.mapper.ts` garante `Σ(vProd - vDesc + vOutro) === Σ(vPag - vTroco)` no centavo exato antes do envio.

## Passos
1. Implemente a classe na pasta `providers/` seguindo `IPaymentProvider` ou `IFiscalProvider`.
2. Registre no `*-provider.registry.ts` e em `back-end/src/shared/container/container.ts`.
3. Escreva testes sem rede (stub/mock) cobrindo sucesso, falha HTTP/timeout, webhook HMAC válido e inválido, idempotência e liberação de saldo em erro.
4. Rode `python3 .claude/scripts/verify.py` e `python3 .claude/scripts/check_tenant.py`.
