---
name: nova-rota
description: Define o contrato e o passo a passo de uma rota REST nova (método, caminho, perfil, entrada, saída, erros). Uso: /nova-rota <METODO caminho>
disable-model-invocation: true
---

Rota: $ARGUMENTS. Modo GUIA: não edite back-end/.
1. Confira em `python3 .claude/scripts/routes_inventory.py` se já existe e em `cap-08-api-realtime-seguranca-config-erros.md` (Grep pelo caminho) como a especificação a descreve.
2. Entregue o contrato: método, caminho, quem pode chamar (público com token de mesa, STAFF, ADMIN), schema Zod em prosa, resposta de sucesso, erros possíveis com status e classe de erro, e regra de tenant.
3. Liste os pontos de ligação: schema → rota (`routes.ts`) → middlewares na ordem → controller → service. Lembre: sem try/catch no controller.
4. Aponte qualquer decisão pendente que afete a rota e pergunte antes de seguir.
