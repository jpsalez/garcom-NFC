# Instruções do projeto para o Codex

Leia `.claude/CLAUDE.md` para conhecer o projeto, as preferências do usuário e as convenções. A base de conhecimento e os scripts continuam em `.claude/`; consulte `.claude/knowledge/garcom-nfc/00-resumo-e-mapa.md` e use `INDEX.md` para localizar detalhes quando necessário. O código prevalece sobre a documentação.

## Skills (Codex e Claude)
As skills adaptadas para o Codex ficam em `.agents/skills/`. São versões independentes das skills em `.claude/skills/`: ao alterar um fluxo, mantenha as duas versões coerentes.

Skills específicas do PDV disponíveis no Codex:
- `/pdv-etapa <0..6>` — orquestra a implementação completa de uma etapa do PDV (Etapas 0 a 6) seguindo `.claude/knowledge/garcom-nfc/pdv-06-guia-de-implementacao-e-testes.md`.
- `/pdv-migration` — cria e valida migrations Prisma/PostgreSQL do PDV preservando IDs `TEXT`, `ALTER TYPE ADD VALUE` isolado, índices parciais e triggers.
- `/pdv-provider` — cria/estende adaptadores de maquininha (`IPaymentProvider`) e NFC-e (`IFiscalProvider`) com AES-256-GCM, webhooks HMAC e zero HTTP dentro de lock.
- `/pdv-kpi` — cria/evolui histórico, agregados, KPIs e previsões em `modules/reports/` usando dia operacional e snapshots.

## Subagentes customizados do Codex (`.codex/agents/`)
Os subagentes construtores do PDV vivem em `.codex/agents/*.toml` (lidos nativamente pelo Codex CLI):
- `pdv_schema_builder` (`workspace-write`) — Prisma, migrations SQL seguras (índices parciais, CHECKs, triggers) e repositories multi-tenant.
- `pdv_domain_builder` (`workspace-write`) — services, matemática em centavos, controllers, Zod, capabilities, Socket.IO, OpenAPI e tsyringe.
- `pdv_integrations_builder` (`workspace-write`) — providers de maquininhas (Manual, Mercado Pago Point), módulo fiscal NFC-e (Notaas, Focus NFe), AES-256-GCM, webhooks HMAC e jobs.
- `pdv_analytics_builder` (`workspace-write`) — `business_date`, agregados `daily_sales`/`product_sales_daily`, SQLs de KPIs, `forecast.engine.ts` e `anomaly.engine.ts`.
- `pdv_test_builder` (`workspace-write`) — TDD com Vitest + PostgreSQL real (regras, tenant, permissões, idempotência, bordas).
- `pdv_auditor` (`read-only`) — auditoria pré-commit (`verify.py`, `check_tenant.py`, `routes_inventory.py`, `doc_drift.py`, triggers, segurança e estilo).

Documentação técnica do PDV: `.claude/knowledge/garcom-nfc/pdv-00-levantamento.md` até `pdv-06-guia-de-implementacao-e-testes.md`.
Os arquivos em `.claude/agents/` continuam como referências de especialidade (não são subagentes nativos do Codex). Configurações e hooks do Claude não são automaticamente configurações do Codex.
