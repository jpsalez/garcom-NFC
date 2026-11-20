---
name: pdv-etapa
description: "Orquestra a implementação completa de uma etapa do PDV (0 a 6) no Codex usando os agentes construtores em .codex/agents/ (schema, testes TDD, domínio/integrações/analytics e auditoria). Uso: /pdv-etapa <0|1|2|3|4|5|6>"
---

Etapa solicitada: os argumentos fornecidos pelo usuário (`0`, `1`, `2`, `3`, `4`, `5` ou `6`).
Este comando é a autorização explícita do usuário para implementar a etapa indicada em `back-end/` seguindo `.claude/knowledge/garcom-nfc/pdv-06-guia-de-implementacao-e-testes.md`.

## Pré-condições (pare e avise se falhar)
1. Confirme qual etapa (`0..6`) foi pedida e leia o checklist daquela etapa em `.claude/knowledge/garcom-nfc/pdv-06-guia-de-implementacao-e-testes.md`.
2. Verifique `git status --short`: se houver alterações não relacionadas do usuário em `back-end/`, NÃO misture — pergunte antes de criar/trocar branch.
3. Para Etapas `1..6`, confirme que a etapa anterior já está concluída no código.
4. Para Etapa `0`, confirme primeiro o alinhamento de branches `main` vs `dev` com o usuário (não faça push, merge ou force-push sem pedido explícito).
5. Confirme que o banco de testes sobe (`cd back-end && npm run test:db:up`).

## Orquestração dos agentes construtores (`.codex/agents/`)
Crie uma branch local dedicada: `pdv/etapa-<N>-<slug>` (a partir de `dev`; nunca trabalhe direto em `main`).

1. **Plano curto (antes de codar):** apresente em até 15 linhas os arquivos a criar/editar, migrations e riscos da etapa. Aguarde o "ok" do usuário (a menos que ele já tenha pedido para executar direto).
2. **Banco e Repositories (`pdv_schema_builder`):** delegue alterações de `schema.prisma`, migrations SQL (seguindo `/pdv-migration`) e `*.repository.ts` da etapa.
3. **Testes primeiro — TDD (`pdv_test_builder`):** delegue a escrita dos testes da matriz da etapa em `back-end/tests/`. Rode e confirme a falha pelo motivo certo.
4. **Implementação principal** (escolha conforme a etapa):
   - Etapas 0, 1, 2, 3 → **`pdv_domain_builder`** (`tabs`, `orders` PDV, `payments` N0, `cash-shifts`, `capabilities`, `Socket.IO`, OpenAPI).
   - Etapas 4 e 6 → **`pdv_integrations_builder`** (`Mercado Pago Point`, `crypto.ts`, webhooks HMAC, `Notaas`/`Focus NFe`, jobs).
   - Etapa 5 → **`pdv_analytics_builder`** (`reports`, `daily_sales`, `product_sales_daily`, KPIs SQL, `forecast.engine.ts`, `anomaly.engine.ts`).
5. **Verificação verde (`pdv_test_builder`):** rode toda a suíte afetada + regressão de `menu-orders`, `sessions`, `tables` e `tenant-isolation`.
6. **Auditoria obrigatória (`pdv_auditor` — read-only):** rode o auditor sobre todo o diff + scripts (`verify.py`, `check_tenant.py`, `routes_inventory.py`, `doc_drift.py`). Corrija TODOS os achados `CRÍTICO` e `MÉDIO` antes de encerrar.
7. **Commit local:** faça commit local limpo na branch da etapa (mensagem curta em português no imperativo). **NUNCA faça push, merge ou PR sem pedido explícito.**

## Relatório final (máx. 12 linhas)
- Etapa concluída, branch e commit local.
- Migrations e módulos/arquivos criados ou alterados.
- Resultado de `verify.py`, `check_tenant.py` e dos novos testes Vitest.
- Pontos de atenção para o usuário revisar e comando para desfazer.
