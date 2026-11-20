---
name: pdv-migration
description: Cria e valida migrations PostgreSQL + Prisma do PDV sem quebrar triggers, índices parciais, FKs TEXT ou regras de ALTER TYPE do Postgres. Uso: /pdv-migration <etapa-ou-nome>
---

Workflow obrigatório para qualquer alteração de schema do PDV em `back-end/prisma/`.

## Regras críticas (nunca violar)
1. **IDs são `TEXT`:** todas as tabelas existentes (`restaurants`, `users`, `tables`, `table_sessions`, `orders`, `order_items`) usam `String @id @default(uuid())` (`TEXT` no PostgreSQL). Nunca crie FK com tipo `UUID` nativo apontando para elas.
2. **Enum `ADD VALUE` isolado:** `ALTER TYPE <enum> ADD VALUE '...'` SEMPRE vai numa migration SQL separada, anterior à migration que referencia o novo valor em `CHECK`, `DEFAULT`, `INSERT` ou `UPDATE`.
3. **Índices parciais preservados:** confira o SQL gerado para garantir que nenhum índice parcial existente (`table_sessions_one_active`, `calls_one_open_per_type`, `tabs_one_open_per_table`, `payment_requests_one_open_per_token`, `cash_shifts_one_open_per_operator`, `payment_terminals_unique_device`) foi dropado.
4. **Triggers de imutabilidade:** se a migration alterar/fazer backfill em `orders` ou `order_items`, envolva o backfill em `ALTER TABLE ... DISABLE TRIGGER ...` / `ENABLE TRIGGER ...` e atualize `menu_guard_order_record()` conforme `.claude/knowledge/garcom-nfc/pdv-02-modelo-de-dados.md`.
5. **Isolamento multi-tenant:** toda tabela nova de domínio tem `restaurant_id TEXT NOT NULL`, `@@unique([restaurant_id, id])` quando referenciada por outras tabelas e FKs compostas `(restaurant_id, ...)`.

## Passo a passo
1. Leia a seção correspondente em `.claude/knowledge/garcom-nfc/pdv-02-modelo-de-dados.md`.
2. Atualize `back-end/prisma/schema.prisma`.
3. Crie a migration com `--create-only` (`npx prisma migrate dev --create-only --name <nome>`) e **revise o SQL gerado** adicionando manualmente os `CHECK`s, índices parciais e triggers.
4. Aplique no banco de teste limpo (`npm run test:db:up && npx prisma migrate deploy && npx prisma generate`).
5. Rode `python3 .claude/scripts/verify.py` e `python3 .claude/scripts/check_tenant.py`.
