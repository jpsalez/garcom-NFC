---
name: monitor
description: "Abre o painel de controle do projeto (git, arquivos, tarefas, decisões, agentes). Uso: /monitor [texto]"
---

Argumento: os argumentos fornecidos pelo usuário.
- Sem argumento: inicie `python3 .claude/scripts/painel.py` em segundo plano usando os recursos disponíveis no ambiente, leia a linha "Painel: http://..." e informe a URL. Se a porta estiver ocupada, use `--port 8766`. Para parar, encerre a tarefa em segundo plano. Com `docker compose up` ele já sobe em http://localhost:8765.
- "texto": rode `python3 .claude/scripts/monitor.py --text` (somente leitura, sem navegador).
Mapa das telas e dos módulos: `.claude/scripts/README.md`. Agentes disparados pelo painel gastam tokens (teto por agente definido ao iniciar); o resto é leitura local.
