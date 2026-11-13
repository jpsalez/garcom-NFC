---
name: novo-modulo
description: Guia o planejamento de um módulo novo do back-end (ex.: tables, sessions, calls) no padrão do projeto. Uso: /novo-modulo <nome>
disable-model-invocation: true
---

Módulo: $ARGUMENTS. Modo GUIA: não crie nem edite arquivos em back-end/ (o usuário escreve).
1. Leia `.claude/knowledge/garcom-nfc/00-resumo-e-mapa.md` e `decisoes.md`. Use `python3 .claude/scripts/repo_map.py` para ver o que já existe do módulo (não explore pasta por pasta).
2. Acione `garcom-arquiteto` (e, em paralelo, `garcom-dados` se houver tabela/índice novo), com briefing curto.
3. Entregue, em tópicos curtos: arquivos a criar (nomes e pastas no padrão), interface do repository/service, regras e erros, o que bloqueia por decisão pendente, e a ordem de escrita (repository → service → schema → controller → rota → registro no container).
4. Termine com o próximo passo único para o usuário e o comando de conferência (`/verificar`).
