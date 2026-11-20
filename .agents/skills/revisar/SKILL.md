---
name: revisar
description: "Revisa o código que o usuário escreveu contra as regras do projeto (tenant, camadas, erros, validação, transações). Uso: /revisar [arquivos ou módulo]"
---

Alvo: os argumentos fornecidos pelo usuário (se vazio, os arquivos alterados mais recentemente em back-end/src).
1. Rode `python3 .claude/scripts/check_tenant.py` e `python3 .claude/scripts/verify.py`; use a saída em vez de reler o código inteiro.
2. Use as orientações de `.claude/agents/garcom-revisor.md` para revisar diretamente os arquivos e os resultados dos scripts.
3. Responda: achados por gravidade (arquivo:linha, motivo, correção em uma frase), depois "o que está bom" em uma linha. Sem elogio longo, sem reescrever o código do usuário.
