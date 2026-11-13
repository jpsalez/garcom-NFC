# Bibliotecas de terceiros (cópia local, sem CDN)

O painel precisa funcionar sem internet: nada é carregado de fora.

| Pasta | Biblioteca | Versão | Licença | Como foi copiada |
|---|---|---|---|---|
| `highlight/` | [highlight.js](https://highlightjs.org) | 11.11.1 | BSD-3-Clause | `npm pack highlight.js@11.11.1`; `lib/core.js` (CommonJS) embrulhado como módulo ES e `es/languages/*.js` copiados sem alteração |
| `socketio/` | [socket.io-client](https://socket.io) | 4.8.1 | MIT | `npm pack socket.io-client@4.8.1`; `dist/socket.io.esm.min.js` sem o mapa de fontes |

Linguagens incluídas: typescript, javascript, json, yaml, dockerfile, markdown, sql, bash, css, xml (html/svg), python, ini, diff. A do Prisma não existe no pacote: está em `js/lib/prisma-lang.js`.

Para atualizar: baixe a nova versão, repita a cópia e ajuste a tabela acima.
