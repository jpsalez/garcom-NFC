---
name: modo-ia
description: Mostra e prepara o "modo IA" (testes, lint, banco de teste, seed, CI) sem alterar nada sem confirmação. Uso: /modo-ia [status|ligar|desligar]
disable-model-invocation: true
---

Argumento: $ARGUMENTS (vazio = status).
- status: rode `python3 .claude/scripts/ai_mode.py status` e resuma em 5 linhas o que falta.
- ligar: rode `python3 .claude/scripts/ai_mode.py enable` (simulação), mostre o que será copiado em back-end/ e PEÇA confirmação. Só então rode com `--apply`, depois o `npm i -D` que o script imprime. Teste com `npm run test:db:up && npm test`. Se o Docker negar permissão, diga ao usuário (grupo `docker`) em vez de contornar.
- desligar: simule com `disable`, peça confirmação e aplique com `--apply`.
Nunca altere back-end/ sem a confirmação explícita desta sessão.
