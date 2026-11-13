# Auditoria do painel e do harness (branch `chore/limpeza-e-redesenho`)

Gerado em 13/11/2026. Os números vêm de `.claude/scripts/medir.py` e `medir-telas.mjs` (arquivos em `.claude/painel/metricas/`); as capturas de tela, em `.claude/painel/capturas/antes` e `depois` (não versionadas).

## 1. Resumo

- **Concluído e verificado:** harness enxuto (agentes −13 KB de corpo, descrições −1,8 mil caracteres que entram em toda sessão); servidor com gzip, ETag/304 e cache por assinatura; tarefas migradas para o esquema novo com validação ao salvar; decisões fora da lista; nova tela **Tarefas**; casca nova (menu recolhível, cabeçalho enxuto), **Visão geral**, **Decisões**, **Conversa, Orquestrar, Ao vivo, Análise e Linha do tempo** no sistema visual novo.
- **Não concluído:** a corrida foi interrompida pelo limite de uso da conta (reinicia às 02:50). Faltam migrar para o visual novo as telas **Commits, Arquivos, Saúde do código, Verificar e GitHub** (só o CSS delas foi convertido), restilizar o **Dicionário** e apagar `css/_legacy` (hoje carregado de forma provisória só para essas telas).
- Tarefas: 122 itens antes; hoje 120 tarefas (68 a fazer, 2 fazendo, 19 feitas, 31 arquivadas) e 15 decisões movidas para o `decisoes.md`. Nada foi apagado.
- O ponto de volta é o primeiro commit da branch (`3e7343d`): `git rm`/`git revert` desfazem qualquer item. Nada foi enviado (sem push, merge ou PR) e `back-end/` e `front-end/` não foram tocados.

## 2. Antes × depois

| Medida | Antes | Depois |
|---|---|---|
| JS próprio do painel | 255.0 KB (54 arquivos, 318 funções) | 294.3 KB (66 arquivos, 376 funções) |
| CSS | 51.7 KB (8 arquivos) | 70.8 KB (10 arquivos; inclui o CSS legado provisório em `_legacy/`, que não entra na conta por ficar em subpasta) |
| Python do painel | 3514 linhas, 202 funções | 4115 linhas, 226 funções |
| Tokens fixos por sessão (≈ caracteres ÷ 4) | 2733 | 2259 |
| · descrições dos agentes | 3755 caracteres | 1935 caracteres |
| · corpo dos agentes (carregado só ao acioná-los) | 33120 caracteres | 20036 caracteres |
| `/api/health` (2ª chamada) | 120 ms | 5 ms |
| `/api/graph?limit=300` (2ª chamada) | 69 ms | 2 ms |
| `/api/sessions` (1ª chamada, a frio) | 560 ms | 191 ms |
| `/api/tasks` transferido | 41997 B | 11079 B (gzip: sim; o medidor pede gzip) |
| `/api/dictionary` transferido | 25658 B | 8768 B (gzip: sim; o medidor pede gzip) |
| `/api/live` transferido | 13069 B | 4099 B (gzip: sim; o medidor pede gzip) |
| Rota `/api/commits` (sem chamador) | existia | removida |
| Tempo até a tela ficar pronta (média de 14 telas) | 407 ms | 428 ms |
| Requisições por minuto com a tela parada (média) | 5 | 2 |
| JS baixado por tela (média, com gzip no depois) | 299 KB | 134 KB |
| Erros de console nas telas | 0 | 0 |
| Tarefas por status | a-fazer/todo 101, feita 20, fazendo 1 (122 itens, incl. 15 decisões) | feita 19, a-fazer 68, arquivada 31, fazendo 2 (120 tarefas) |

> Ressalva da medida de requisições: a sessão do Claude Code que estava rodando enquanto medi escreve no próprio transcript, e o painel reage a isso (assunto `live`). Parte dos valores "parada" é, portanto, atividade real e não polling.

| Tela | pronta antes → depois (ms) | req/min parada antes → depois |
|---|---|---|
| visao-geral | 864 → 963 | 10 → 10 |
| conversa | 305 → 335 | 10 → 5 |
| orquestrar | 329 → 393 | 10 → 0 |
| ao-vivo | 311 → 336 | 0 → 0 |
| analise | 328 → 302 | 0 → 10 |
| linha-do-tempo | 340 → 317 | 15 → 10 |
| tarefas | 451 → 382 | 5 → 0 |
| commits | 381 → 451 | 5 → 0 |
| github | 499 → 553 | 10 → 0 |
| saude-do-codigo | 507 → 341 | 5 → 0 |
| arquivos | 373 → 309 | 0 → 0 |
| verificar | 286 → 351 | 0 → 0 |
| decisoes | 306 → 394 | 5 → 0 |
| dicionario | 424 → 565 | 0 → 0 |

## 3. O que foi removido, arquivado, otimizado e reorganizado

| Item | Categoria | Evidência | Ação | Commit |
|---|---|---|---|---|
| Rota `GET /api/commits` | código morto | nenhuma tela chama (`grep "api('commits"` = 0 no frontend) | removida (a função `gitinfo.commits` fica: a linha do tempo a usa) | a4c4972 |
| Bloco "Economia de tokens" e "Regras de qualidade" repetido em 10 agentes | duplicação | ≈14 KB de linhas idênticas (script de comparação linha a linha) | extraído para `knowledge/garcom-nfc/_agentes-comum.md`; cada agente aponta para ele e mantém um resumo de 2 linhas | a4c4972 |
| Descrições dos 11 agentes | peso por sessão | entram no prompt de toda sessão (3755 caracteres) | reescritas em ~1,9 mil caracteres mantendo os gatilhos de delegação | a4c4972 |
| Linha do painel no `CLAUDE.md` e instrução de subir a aplicação | texto longo / desatualizado | comparação com `docker-compose.yml` (sem `.env`) e com o painel atual | encurtadas e corrigidas | a4c4972 |
| `sessao-2026-11-12-onde-paramos.md` | histórico | nenhuma referência (grep) em CLAUDE.md, agentes, skills e scripts | movido para `knowledge/_arquivo/` com uma linha no INDEX (nada apagado) | a4c4972 |
| Lista antiga de pendentes do `decisoes.md` (sem ids) | histórico | substituída pelo bloco estruturado DEC-NN | movida para `knowledge/_arquivo/decisoes-lista-antiga.md` | bf83ea9 |
| Respostas do painel sem compressão nem validação de cache | peso | JSON de 16–42 KB a cada pedido; `Cache-Control: no-store` em tudo | gzip (corpo > 1 KB), ETag e 304; estáticos com `no-cache`+ETag; testes | a4c4972 |
| `graph` e `health` recalculados a cada chamada | peso | ~75 ms e ~130 ms (medidos) | cache por assinatura (refs do git e mtime dos `.ts`): ~1 ms e ~3 ms; teste de invalidação ao commitar | 567a5b9 |
| `/api/sessions` relia sessões inteiras para achar o título | peso | ~660 ms (sessões de até 36 MB) | `analise.title_of` lê só os bytes novos (161 ms a frio, 0 ms depois) | 567a5b9 |
| `analise._cache` guardava uma versão por (tamanho, mtime) | vazamento de memória | cada gravação do transcript criava uma entrada nova que nunca saía | guarda só a versão mais nova de cada arquivo; teste | 567a5b9 |
| Esquema de tarefas em inglês, sem validação | organização | `tasks.json` aceitava qualquer coisa | `tarefas.py`: esquema novo em português, validação ao salvar (recusa JSON inválido, ids repetidos, dependência inexistente, ciclo), migração com diff e backup | bf83ea9 |
| Decisões (DEC-NN) misturadas às tarefas | organização | 15 itens `mode: decisão` em `tasks.json` | movidas para o `decisoes.md` (fonte única); tarefas guardam `bloqueada_por_decisao`; `GET/PUT /api/decisoes` | bf83ea9 |
| CSS genérico antigo (`layout`, `components`, `tokens`) | reorganização | misturava cores soltas, serifa, bento e animações | substituído por `tokens.css`, `base.css`, `ui.css`; antigos em `css/_legacy` (PROVISÓRIO, ainda carregado para as telas não migradas) | 91c761b |
| Botões, abas, tabelas, marcadores, painel lateral, estados | duplicação | cada tela montava as suas peças | componentes únicos em `static/js/ui/` (`button`, `tabs`, `table`, `badge`, `side-panel`, `section`, estados) | 91c761b |
| Telas Conversa, Orquestrar, Ao vivo, Análise, Linha do tempo | redesenho | bento, números gigantes, cartões vazios | reescritas no sistema novo (sugestões como links, opções recolhidas, seções vazias escondidas) | 4e83dca |
| Menu, cabeçalho, Visão geral, Decisões | redesenho | saudação gigante, contadores "0", editor sempre aberto | menu recolhível sem zeros, cabeçalho enxuto, Visão geral em seções, Decisões com caixas e editor atrás de "Editar" | ef5e2de |
| Tela Tarefas | redesenho | lista única de 122 itens, 5 cartões de números | Agora/Quadro/Todas, painel lateral, filtros na URL, teclado | 4c17084 |
| Paleta Ctrl+K lia campos antigos das tarefas | bug | título "undefined" na paleta | campos novos e decisões pendentes incluídas | d8e128e |

Já feitos nas rodadas anteriores à auditoria (não repetidos aqui): frontend em módulos ES, rotas com o nome da tela e redirecionamento dos endereços antigos (`#chat`→`#conversa` etc.), fonte única de estado dos agentes (corrige "0 agentes"), cancelamento de pedidos ao trocar de tela, pausa com a aba oculta, Socket.IO no lugar de polling, CSP e checagem de Host/Origin.

## 4. Triagem de tarefas

Contagem: **122 itens antes** = 15 decisões movidas + 107 tarefas; depois da quebra de 5 tarefas em 13 passos, **120 tarefas** (122 − 15 + 13 = 120).

### Já feitas (o código implementa) (2)
| Id | Motivo |
|---|---|
| INF-01 | app (server.ts) já é separado da escuta (main.ts) |
| INF-09 | Swagger em /docs (back-end/src/docs/openapi.ts); manter atualizado a cada rota nova |

### Duplicadas, absorvidas, vagas ou obsoletas (arquivadas) (9)
| Id | Motivo |
|---|---|
| NFC-01 | duplicada de DEC-05 (decisão da URL pública); a implementação cabe em TAB-04 e OPS-03 |
| SEG-04 | é um processo permanente, não uma tarefa que termina; já faz parte da Definição de pronto (check_tenant e revisor) |
| DOC-03 | absorvida por DOC-04 (sincronizar a documentação inclui resolver as divergências do Apêndice A) |
| SEG-05 | duplicada de OPS-02 (produção) e INF-07 (segredos validados); os critérios passaram para OPS-02 |
| RT-06 | duplicada: recarregar /calls ao reconectar é critério de FE-05b |
| FE-07 | duplicada: estados encerrado/expirado e reconexão viraram FE-04c |
| DB-04 | vaga: revisar índices vira critério de CAL-03 e SES-04 |
| TAB-05 | impressão em lote cabe em FE-03b (CSS de impressão); só volta se for preciso gerar PDF no servidor |
| AUT-11 | cosmética, sem efeito no produto; faça junto com a próxima edição do auth.controller |

### Quebradas em passos concretos (a original foi arquivada) (5)
| Id | Motivo |
|---|---|
| SES-02 | quebrada em SES-02a e SES-02b |
| FE-03 | quebrada em FE-03a, FE-03b e FE-03c |
| FE-04 | quebrada em FE-04a, FE-04b e FE-04c (FE-07 foi absorvida) |
| FE-05 | quebrada em FE-05a, FE-05b e FE-05c (RT-06 foi absorvida) |
| TST-05 | quebrada em TST-05a e TST-05b |

### Novas, criadas pela quebra (13)
| Id | Motivo |
|---|---|
| SES-02a | criada pela quebra de SES-02 |
| SES-02b | criada pela quebra de SES-02 |
| FE-03a | criada pela quebra de FE-03 |
| FE-03b | criada pela quebra de FE-03 |
| FE-03c | criada pela quebra de FE-03 |
| FE-04a | criada pela quebra de FE-04 |
| FE-04b | criada pela quebra de FE-04 |
| FE-04c | criada pela quebra de FE-04 |
| FE-05a | criada pela quebra de FE-05 |
| FE-05b | criada pela quebra de FE-05 |
| FE-05c | criada pela quebra de FE-05 |
| TST-05a | criada pela quebra de TST-05 |
| TST-05b | criada pela quebra de TST-05 |

### Pós-MVP sem tarefas dependentes (arquivadas, recuperáveis) (17)
DB-05, AUT-10, USR-07, ADM-05, RT-07, FE-08, FE-09, POS-01, POS-02, POS-03, POS-04, POS-05, POS-06, POS-07, POS-08, ADM-03, ADM-04. Motivo: "pós-MVP, sem tarefas dependentes". Para recuperar: filtro "mostrar arquivadas" na tela Tarefas e mudar o status.

### Válidas, revisadas (critérios, fase ou descrição) (6)
| Id | Motivo |
|---|---|
| TST-01 | revisada: criterios, status |
| FE-01 | revisada: criterios, descricao, status |
| OPS-02 | revisada: criterios |
| CAL-03 | revisada: criterios |
| SES-04 | revisada: criterios |
| DOC-02 | revisada: descricao |

### Decisões movidas para o decisoes.md (15)
DEC-01, DEC-02, DEC-03, DEC-04, DEC-05, DEC-06, DEC-07, DEC-08, DEC-09, DEC-10, DEC-11, DEC-12, DEC-13, DEC-14, DEC-15

Tarefas válidas mantidas sem alteração de conteúdo: o restante (revisão de dependências: removidas as que apontavam para decisões já resolvidas e para tarefas inexistentes; nenhum ciclo encontrado). A coluna "bloqueada por decisão" agora aparece em cada tarefa afetada.

## 5. Decisões tomadas sozinho

| Decisão | Motivo | Como desfazer |
|---|---|---|
| **Versionar o `.claude/` na branch** | O prompt pede branch, commits e `git rm`, mas o `.claude/` estava no `.gitignore` (decisão anterior: "por enquanto deixe de fora" foi sobre o tasks.json, não sobre o ferramental). Versionei agentes, skills, scripts, painel (frontend), conhecimento e templates; deixei fora `runs/`, `history.jsonl`, `tasks*.json`, `settings.json`, `capturas/`, `metricas/` e o estado do modo IA. | volte o `.gitignore` do commit anterior (`git checkout main -- .gitignore`) ou apague a branch |
| **Painel está em `.claude/scripts/`, não em `.claude/painel/`** | O código do painel (servidor e `static/`) fica em `.claude/scripts/`; `.claude/painel/` guarda só dados. Mantive o layout e escrevi o relatório em `.claude/painel/AUDITORIA.md`, como pedido. | — |
| **Camada de CSS legado provisória** | Com o limite de uso interrompendo os agentes, as telas não migradas ficariam sem estilo. `index.html` carrega `css/_legacy/{tokens,components}.css` ANTES dos tokens novos (os novos vencem). Remover as duas linhas e a pasta quando todas as telas migrarem. | apagar as 2 linhas `<link>` marcadas PROVISÓRIO |
| **Pós-MVP sem dependentes → arquivadas** | Regra do prompt aplicada literalmente: 17 tarefas (inclui ADM-03/04, FE-08/09). Todas recuperáveis pelo filtro de arquivadas. | mudar o status na tela Tarefas |
| **Campos extras no esquema de tarefas** | Além dos pedidos, mantive `descricao`, `modulo`, `refs`, `quem` e `notas` para não perder conteúdo da migração; `bloqueada_por_decisao` aceita string ou lista (SES-02b depende de DEC-01 e DEC-02). | — |
| **DEC-01 não foi marcada como decidida** | As suas notas dizem "o garçom no balcão abre a mesa como fecha ela também", mas a decisão é sua: aparece pendente, com a nota e um aviso na tela Decisões. | marque a caixa na tela Decisões |
| **Agentes: ponteiro em vez de texto repetido** | O bloco comum virou arquivo lido pelo agente (+1 leitura por acionamento, custo de tokens equivalente ao texto inline), mantendo um resumo de 2 linhas no próprio agente para a regra valer mesmo se a leitura for pulada. | restaurar o bloco no agente |
| **Ferramentas de análise** | `vulture`, `ruff` e `knip` não estão instalados e a regra proíbe instalar globalmente; usei analisadores próprios (AST do Python, exports/imports e rotas do JS). | — |

## 6. Suspeitos mantidos e pendências

**Pendências desta corrida (limite de uso da conta; os agentes F1, F2 e F4 foram interrompidos e podem ser retomados depois das 02:50 com `SendMessage` nos ids da sessão, ou refazendo o pedido):**
- Migrar para os componentes novos e remover estilos soltos: **Commits, Arquivos, Saúde do código, Verificar, GitHub** (`views/*.js` e `ui/{code-view,diff-view,commit-graph,commit-detail,activity,file-tree,file-context,gh-*,ins-*}.js`). Os 4 CSS (`code`, `git`, `github`, `insights`) já foram convertidos para os tokens novos.
- **Dicionário**: manter ordem por linha e índice A–Z, mas falta o visual novo (categorias como filtro).
- `css/_legacy` e as 2 linhas provisórias do `index.html`.
- `stagger()` e `countUp()` em `lib/dom.js` e a classe `rise`: ainda usados pelas telas não migradas; remover quando sumirem os últimos usos.
- Exports sem importador (internos, não mortos): `ApiError`, `splitLines`, `parseDiff`, `heatmap`, `linesChart`, `filesTree`, `iconFor`, `GOTO`, `squarify`, `buildTree`, `safeUrl`. `dayLabel` em `lib/format.js` não tem nenhum uso e pode ser apagado.
- Variáveis de cor antigas ainda em 4 arquivos JS de gráficos (`ins-deps.js`, `ins-treemap.js`, `commit-graph.js`, `saude.js`), cobertas pelo CSS legado.
- Verificação "sessão nova do Claude Code": `claude agents` exige terminal interativo; conferi apenas que as 3 receitas apontam para agentes que existem e que o `settings.json` continua válido. Os hooks estão desligados (`hooks.template.json` é só modelo).
- Alterar `settings.json`/hooks: nada foi alterado.

**Suspeitos mantidos (sem prova de que são inúteis):** `ai-mode/` (README, templates e estado; usado pelas skills `modo-ia` e `implementar`), os 5 agentes sem receita (`fluxos`, `realtime`, `cliente-qr-nfc`, `doc-sync`, `orquestrador`: são acionados pelo roteador por palavras-chave do painel e pelo orquestrador), `prompts.md`.

## 7. Como desfazer

- Tudo: `git checkout main` (a branch não foi enviada; `git branch -D chore/limpeza-e-redesenho` apaga). Para voltar só o ferramental ao estado de partida: `git checkout 3e7343d -- .claude`.
- Um item: `git revert <commit>` (coluna "Commit" da seção 3).
- Tarefas: o original está em `.claude/painel/tasks.backup.json` (esquema antigo, 122 itens) e a versão de antes desta revisão em `tasks.backup-2026-11-13.json`. O script `migrar_tarefas.py` só migra se o arquivo estiver no formato antigo.

**Commits da branch:**

- `3e7343d` chore : versiona o ferramental do .claude (estado de partida da limpeza)
- `a4c4972` chore : enxuga o harness (agentes, CLAUDE.md, conhecimento) e comprime as respostas do painel
- `bf83ea9` feat : tarefas no esquema novo, decisões fora da lista e validação ao salvar
- `91c761b` feat : base do novo sistema visual (tokens, base, componentes) e filtro por id de tarefa no grafo
- `d2e72b1` chore : S.prefill (texto que a Conversa mostra ao abrir, vindo de outras telas)
- `567a5b9` perf : cache por assinatura em graph e health; título de sessão incremental; cache do analise sem vazamento
- `4e83dca` feat : redesenho das telas Conversa, Orquestrar, Ao vivo, Análise e Linha do tempo
- `ef5e2de` feat : casca nova (menu recolhível, cabeçalho enxuto), Visão geral e Decisões redesenhadas
- `4c17084` feat : tela Tarefas nova (Agora, Quadro, Todas), painel de detalhe e anexo de tarefa nos agentes
- `7c33fee` style : code.css, git.css, github.css e insights.css convertidos para os tokens novos (telas ainda por migrar)
- `d8e128e` fix : paleta Ctrl+K lê as tarefas no esquema novo e lista decisões pendentes; ajustes de CSS da casca
