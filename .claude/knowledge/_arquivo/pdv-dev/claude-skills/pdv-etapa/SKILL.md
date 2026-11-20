---
name: pdv-etapa
description: Orquestra a implementação completa de uma etapa do PDV (0 a 6) seguindo o roteiro de pdv-06-guia-de-implementacao-e-testes.md (schema, testes TDD, código, verificação e auditoria). Uso: /pdv-etapa <0|1|2|3|4|5|6>
disable-model-invocation: true
---

Etapa solicitada: $ARGUMENTS (`0`, `1`, `2`, `3`, `4`, `5` ou `6`).
Este comando é a autorização explícita do usuário para implementar a etapa indicada em `back-end/` seguindo `.claude/knowledge/garcom-nfc/pdv-06-guia-de-implementacao-e-testes.md`.

## Pré-condições (pare e avise se falhar)
1. Confirme qual etapa (`0..6`) foi pedida e leia o checklist daquela etapa em `.claude/knowledge/garcom-nfc/pdv-06-guia-de-implementacao-e-testes.md`.
2. Verifique `git status --short`: se houver alterações não relacionadas do usuário em `back-end/`, NÃO misture — pergunte antes de criar/trocar branch.
3. Para Etapas `1..6`, confirme que a etapa anterior já está concluída no código.
4. Para Etapa `0`, confirme primeiro o alinhamento de branches `main` vs `dev` com o usuário (não faça push, merge ou force-push sem pedido explícito).
5. Confirme que o banco de testes sobe (`cd back-end && npm run test:db:up`).

## Ciclo da etapa
Crie uma branch local dedicada: `pdv/etapa-<N>-<slug>` (a partir de `dev`; nunca trabalhe direto em `main`).

1. **Plano curto (antes de codar):** consulte `garcom-pdv` se precisar confirmar detalhe; apresente em até 15 linhas os arquivos, migrations e riscos da etapa e aguarde "ok".
2. **Banco e Repositories:** aplique alterações de `schema.prisma`, migrations SQL (seguindo `/pdv-migration`) e `*.repository.ts`.
3. **Testes primeiro (TDD):** escreva os testes da matriz da etapa em `back-end/tests/`, rode e confirme a falha pelo motivo certo.
4. **Implementação:** implemente services, controllers, schemas Zod, providers/reports, OpenAPI e container seguindo `pdv-02` a `pdv-06` e `.claude/CLAUDE.md`.
5. **Verificação:** rode `python3 .claude/scripts/verify.py`, `check_tenant.py`, `routes_inventory.py` e `doc_drift.py`.
6. **Revisão:** acione `garcom-revisor` (e/ou `garcom-pdv`) sobre o diff e corrija todos os achados críticos e médios.
7. **Commit local:** faça commit local na branch da etapa. **NUNCA faça push, merge ou PR sem pedido explícito.**

## Relatório final (máx. 12 linhas)
- Etapa concluída, branch e commit local.
- Migrations e módulos/arquivos criados ou alterados.
- Resultado de `verify.py`, `check_tenant.py` e dos novos testes Vitest.
- Pontos de atenção para o usuário revisar e comando para desfazer.
