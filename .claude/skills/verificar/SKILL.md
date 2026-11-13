---
name: verificar
description: Roda a verificação rápida do projeto (typecheck, lint/testes se existirem, tenant, rotas, divergência da documentação) e resume em poucas linhas. Uso: /verificar
disable-model-invocation: true
---

Rode, nesta ordem, e mostre só o essencial:
1. `python3 .claude/scripts/verify.py`
2. `python3 .claude/scripts/check_tenant.py`
3. `python3 .claude/scripts/doc_drift.py`
Resuma em no máximo 8 linhas: o que passou, o que falhou e qual o próximo passo. Não corrija nada sem o usuário pedir.
