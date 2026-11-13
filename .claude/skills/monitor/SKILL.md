---
name: monitor
description: Abre o painel de controle do projeto (agentes controláveis, sessão ao vivo, estrutura do projeto, verificações, decisões). Uso: /monitor [texto]
disable-model-invocation: true
---

Argumento: $ARGUMENTS.
- Sem argumento: inicie `python3 .claude/scripts/painel.py` em segundo plano (Bash com run_in_background), leia a linha "Painel: http://..." que ele imprime e informe a URL. Se a porta estiver ocupada, use `--port 8766`. Diga como parar (encerrar a tarefa em segundo plano).
- "texto": rode `python3 .claude/scripts/monitor.py --text` (somente leitura, sem navegador).
Abas: Conversa (orquestrador local sem custo de tokens: monta o plano por regras e dispara até 3 especialistas; também conversa com um agente único), Orquestrar (receitas com aprovação), Ao vivo (somente leitura), Análise, Linha do tempo, Commits (grafo, alterações não commitadas, diff), Saúde do código (candidatos a refatorar, churn, histórico de verificações), Arquivos, Verificar, Decisões. Agentes do painel têm permissões mínimas e gastam tokens: o teto por agente é definido ao iniciar.
