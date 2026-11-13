# Painel: frontend

Sem build: ES modules nativos servidos por `painel.py` em `/static/`. Nada de CDN (bibliotecas em `vendor/`).

```
index.html               casca (menu e topo são montados pelo router)
css/                     tokens · layout · components · code · git
js/main.js               início: tema, menu, status, primeira tela
js/api.js                fetch com token, timeout, cancelamento por tela, ApiError
js/store.js              estado único (S) e agentCounts()
js/status.js             agentes/gasto (menu, topo, Visão geral): uma consulta por assunto do Socket.IO
js/lib/realtime.js       cliente Socket.IO: watch('assunto', fn); sem socket, consulta de reserva
js/poll.js               poll(): pausa com a aba oculta e recua em erro (hoje só serve a quem não usa Socket.IO)
js/router.js             tabela única de telas (ROUTES), #tela/sub?param=valor
js/views/*.js            uma por tela
js/ui/*.js               componentes: code-view, diff-view, commit-graph, file-tree, ...
js/lib/*.js              dom, format, lang, highlight
vendor/                  highlight.js e socket.io-client (veja vendor/README.md)
```

## Verificar (rodar da raiz do projeto)

```
back-end/node_modules/.bin/tsc -p .claude/scripts/static/jsconfig.json   # tipos (@ts-check) e nomes
python3 -B -m unittest discover -s .claude/scripts/tests                  # servidor: segurança, git, grafo, blame
node .claude/scripts/tests/smoke.mjs [--only tela1,tela2] [--shots pasta] # abre as telas no chromium e falha em erro de console
node .claude/scripts/tests/smoke.mjs --only "arquivos?path=README.md" --eval "<js>"   # cenário com script
PAINEL_GIT_ROOT=/caminho/do/repo node ...smoke.mjs --only commits         # painel apontando para outro repositório
```

`PAINEL_GIT_ROOT` existe só para teste: aponta as telas de git para um repositório descartável.

## Tempo real (Socket.IO)

`realtime.py` (na pasta acima) é um servidor Socket.IO mínimo (Engine.IO v4, só WebSocket) feito com a biblioteca padrão; o cliente é o `socket.io-client` oficial.
O servidor manda só `changed` com os assuntos que mudaram: `runs · pipelines · live · git · tasks · decisions`. Cada tela assina o que precisa:

```js
S.timers.push(watch('git', refresh, 20_000));   // 20 s = consulta de reserva, só se o socket cair
```

Quem publica: o próprio painel (`realtime.publish(...)` ao salvar conversas, tarefas, decisões, limite) e um vigia que só olha `mtime`
e a assinatura do git, e apenas enquanto houver alguém conectado. Nada chama LLM. Teste: `tests/test_realtime.py`.
