# 7. Fluxos operacionais e ciclos de vida 

Este capítulo descreve, passo a passo, como o sistema deve operar em tempo de execução no MVP "chamado" (documentação v0.3): como um atendimento de mesa é aberto, como cada aparelho recebe seu token, como nasce e é finalizado um chamado, como o card aparece em tempo real no balcão, e como o atendimento termina (encerramento manual ou expiração de 4 horas). Também descreve os estados de sessão e de chamado, os erros previstos e cenários de uso completos. 

## 7.1 Convenções e como ler o estado de implementação 

Cada fluxo abaixo é marcado com uma das etiquetas a seguir, definidas na especificação comum deste documento: 
 
- **[Especificado]**: previsto na documentação (v0.3, v0.2, documento de módulos ou guia de estudos), independentemente de existir código. 
- **[Implementado]**: confirmado no código do back-end em `back-end/` (rotas, middlewares, repositórios, schema e migration). 
- **[Planejado/Não implementado]**: previsto, mas sem código correspondente.  
**Estado real, em uma frase.** Dos fluxos descritos neste capítulo, o back-end atual implementa apenas os blocos de infraestrutura: o schema e a migration (incluindo o índice único parcial `table_sessions_one_active`), os repositórios de mesas, sessões, tokens e chamados, o tratamento global de erros e o cadastro/login de usuário. Nenhum service, controller, rota ou middleware dos fluxos de sessão, token de aparelho, chamado, encerramento, expiração ou tempo real existe ainda; também não há front-end no repositório. Detalhes na seção 7.15 e no capítulo 9. 
**Precedência em conflito.** Código (comportamento atual) > v0.3 > v0.2. A v0.2 descrevia um produto maior (cardápio, comanda, KDS, setores, aceitar chamado); a v0.3 reduz o escopo ao MVP de chamado e é a referência dos fluxos. O documento de módulos acrescenta um desenho de implementação que difere da v0.3 em alguns pontos; cada diferença é registrada no Apêndice A com identificador `dv-D-n`. 

Terminologia: a v0.3 chama de "atendimento" o que o banco chama de `table_sessions` e os endpoints chamam de `/sessions`. Neste documento "atendimento" e "sessão" são sinônimos (ver Apêndice B). 

## 7.2 Visão geral do fluxo cliente para garçom 

**[Especificado]** O fluxo geral tem quatro etapas, em raias Cliente, Sistema e Garçom: (1) Mesa: o cliente escaneia o QR Code (ou encosta no NFC, que grava a mesma URL), vê a tela principal da mesa e toca em "Chamar garçom" ou "Pedir a conta"; (2) Balcão: o card da mesa aparece na tela do balcão; (3) Atendimento: o garçom vai até a mesa e atende; (4) Balcão: o garçom finaliza o chamado e o card sai da tela. 

_Figura: **Figura 7.1** – Sequência do fluxo cliente para garçom: do toque na mesa à remoção do card no balcão. (Ver seção 7.5 a 7.7)_ 

Princípio arquitetural: ações de usuário viajam por REST; eventos que outra tela precisa ver imediatamente viajam por Socket.IO (ver seção 8.3). A meta de latência proposta (RNF02) é de até 2 segundos entre o toque do cliente e o card na tela do balcão; é uma meta proposta, ainda sem medição possível, pois nada disso está implementado. 

## 7.3 Abertura de sessão (atendimento) 

### 7.3.1 Finalidade e regra 

O atendimento representa a ocupação de uma mesa: período em que há clientes ali. Impede, por exemplo, que a foto de uma plaquinha seja usada de longe, que um cliente antigo continue chamando e que chamados existam sem vínculo com uma ocupação. A regra fundamental (RN04 e RN09/RN10 da v0.3) é: uma mesa tem no máximo um atendimento ativo, compartilhado por todos os aparelhos; ele dura 4 horas a menos que esteja marcado como "manter aberto". A unicidade é garantida no banco pelo índice único parcial `table_sessions_one_active` (**[Implementado]** na migration `20261111232558_init`). 

### 7.3.2 Quando o atendimento começa 

Há três versões na documentação, registradas como DV-01: 
 
- v0.3, texto (glossário e RN04): começa no primeiro chamado. 
- v0.3, fluxo do token e API: `POST /public/tables/:code/token` "entra no atendimento ativo ou abre um" e devolve o token; portanto o atendimento abre quando o aparelho obtém o token, que pode acontecer antes do primeiro chamado (o fluxo da p9 mostra o token sendo emitido ao tocar em Chamar garçom). 
- Documento de módulos e README do back-end: o garçom abre a mesa (`POST /tables/:id/sessions`) e o cliente que escaneia sem sessão ativa recebe 403 "Mesa fechada. Peça ao garçom para abri-la".  

**Decisão adotada:** seguir a v0.3 (abertura automática pelo cliente, sem ação do garçom), porque é a especificação mais recente e coerente com o ponto "a validar" nº 4. **Status: Requer validação.** O fluxo da v0.2 (cliente entra na sessão ao executar uma ação; vê o cardápio sem criar sessão) é equivalente na lógica, mas o cardápio saiu do MVP. 

### 7.3.3 Fluxo de decisão 

_Figura: **Figura 7.2** – Fluxograma de decisão: token do aparelho e abertura de atendimento. (Ver seção 7.3 e 7.4)_ 

Em prosa, o fluxo **[Especificado]** é: 
 
- O cliente abre `/m/[code]`. A tela busca `GET /public/tables/:code` (nome do restaurante e da mesa). Código inexistente ou mesa inativa resulta em 404 `TABLE_NOT_FOUND`. 
- Ao tocar em um botão, o aparelho verifica se já guarda um token válido (a v0.3 prevê um módulo de front `lib/token` para isso). Se sim, vai direto à criação do chamado. 
- Se não, chama `POST /public/tables/:code/token`. A API procura o atendimento ativo da mesa. Se há, emite um novo token ligado a ele; se não, cria um atendimento ativo com `expires_at` igual a agora mais 4 h (variável `TABLE_SESSION_TTL`, 14400 s) e emite o token. 
- Se duas requisições tentarem abrir ao mesmo tempo, o índice único parcial faz a segunda falhar com violação de unicidade (Prisma P2002); o desenho de módulos recomenda tratar esse erro devolvendo o atendimento já existente ("find or create" seguro) em vez de uma falha.  

**[Implementado]** Apenas os repositórios de apoio: `findActiveByTable` (primeiro atendimento ACTIVE da mesa), `findByPublicCode` (mesa e restaurante pelo código público) e `create`. Não há service, rota, nem geração de `public_code`. 

### 7.3.4 Entradas, saídas e validações  
| Item | Descrição |
|---|---|  
| Entrada | Código público da mesa (parâmetro de rota); opcionalmente token existente no cabeçalho. | 
| Saída | Token em texto (devolvido uma única vez), nome da mesa e do restaurante, instante de expiração (no desenho de módulos). | 
| Validações | Mesa existente e ativa; unicidade de atendimento ativo (índice); expiração conferida na hora do uso. | ``````
| Efeitos | Nova linha em table_sessions (se não havia ativo) e nova linha em session_tokens; possível evento session.updated para o balcão (contagem de aparelhos). | ````
| Dependências | Tabelas, atendimentos e tokens (módulos tables e sessions; ver capítulo 6). |   

## 7.4 Token por aparelho 

### 7.4.1 Finalidade 

Cada aparelho que entra no atendimento recebe um token próprio (RN05). Isso permite revogar todos de uma vez ao encerrar a mesa, contar quantos aparelhos há na mesa (painel do balcão mostra "3 aparelhos") e registrar qual token originou cada chamado (`calls.token_id`). A v0.2 previa um único token por sessão compartilhado por todos; a v0.3 e o schema atual usam um token por aparelho (DV-24). 

### 7.4.2 Geração, armazenamento e validação 
 
- **[Especificado]** Token aleatório e opaco, sem significado; só o hash fica no banco (coluna `session_tokens.token_hash`, única); o texto do token existe apenas no aparelho (RNF05). 
- **[Especificado, desenho do guia/módulos]** 32 bytes aleatórios em base64url (cerca de 43 caracteres), hash SHA-256 em hexadecimal. SHA-256 (e não scrypt) porque o token é procurado pelo próprio hash e tem 256 bits de entropia, o que torna força bruta inviável. 
- **[Especificado]** Validação a cada requisição de chamado: calcular o hash do token recebido, buscar por `findByHash` (que já traz o atendimento), rejeitar se inexistente, se `revoked_at` estiver preenchido, ou se o atendimento não estiver ACTIVE ou já estiver vencido. A checagem de expiração na requisição é necessária porque o job roda só a cada minuto. 
- **[Implementado 14/11/2026]** Geração e hash (`utils/token.ts`) e middleware `ensureTableToken` (`X-Table-Token`): 401 se ausente, desconhecido, revogado, sessão não ACTIVE ou vencida sem `keep_open`; não checa restaurante desativado (decisão do usuário). Resultado em `req.tableToken`.
- **[Planejado]** Armazenamento no navegador (cabeçalho `X-Table-Token`; o desenho de módulos usa `x-table-token`, equivalente). Onde guardar o token no aparelho está em aberto: v0.3 prevê `lib/token` com cabeçalho; módulos citam `localStorage`; o guia recomenda cookie httpOnly com SameSite=Lax (DV-21). 
- **[Implementado]** Tabela `session_tokens` (`token_hash` único, `revoked_at` opcional) e `SessionTokenRepository` com `create`, `findById`, `findByHash`, `findManyBySession`, `update`, `revokeAllBySession` e `delete`.  

### 7.4.3 Limite de abuso 

**[Implementado 14/11/2026]** `callLimiter`: 10 chamados por 5 min por token do aparelho; excedeu = 429 com `code` `TOO_MANY_REQUESTS` (o `TOO_MANY_CALLS` da v0.3 não será usado). Contadores em memória, off em testes; sem limite por mesa e sem `trust proxy` (limites por IP, como login e scan, dependem disso atrás de proxy). Login (10/15 min) e scan (30/15 min) também têm limite.

## 7.5 Chamado de garçom e de conta 

### 7.5.1 Funcionamento 

O chamado é o pedido de atenção feito pela mesa. Tem dois tipos (RN03): `WAITER` (Chamar garçom) e `BILL` (Pedir a conta, mostrado no balcão como "Fechar conta"). Fluxo **[Especificado]**: 
 
- A tela da mesa envia `POST /public/calls` com o tipo, apresentando o token do aparelho. 
- A API valida o token (seção 7.4.2) e o atendimento. 
- Cria a linha em `calls` com status OPEN, `session_id` e `token_id` do aparelho e `restaurant_id` do atendimento. 
- Emite o evento `call.created` para a sala do balcão do restaurante (após o commit). 
- Responde 201 com identificador, tipo, status OPEN e rótulo da mesa (por exemplo "Mesa 12"). A tela mostra "Chamado enviado. O garçom já foi avisado." (RF07, proposto).  

### 7.5.2 Chamados repetidos 

**[Implementado 14/11/2026, DEC-03]** Vale isto, no lugar do "Requer validação" abaixo: um chamado OPEN por tipo e por sessão; tocar de novo devolve o mesmo chamado com 200 e `created_at` intacto (201 só quando cria; não há 409); WAITER e BILL coexistem; toques simultâneos são resolvidos pelo índice parcial `calls_one_open_per_type` e o service devolve o vencedor. O texto a seguir é o histórico da dúvida.

A v0.3 é contraditória: RN08 (definida) diz que cada novo chamado gera um novo card; RN12 e o ponto a validar nº 3 deixam em aberto "novo card ou agrupar". O desenho de módulos propõe responder 409 (mensagem "Você já chamou. O garçom está a caminho") quando já existe um chamado OPEN do mesmo tipo na sessão, reforçado por um índice único parcial (sessão, tipo) onde status é OPEN; WAITER e BILL podem coexistir. A v0.2 trazia a mesma ideia (RN14, a validar). **Decisão adotada:** documentar o comportamento da v0.3 (um card por chamado) como especificação vigente e o bloqueio por tipo como proposta. **Status: Requer validação** (DV-02). O índice parcial de chamados não existe na migration. 

### 7.5.3 Estado de implementação 

**[Implementado 14/11/2026]** Tabela `calls`, `CallRepository` (inclui `findOpen` e `markDone`), `CallsService`, controller, schemas e rota `POST /public/calls` (corpo `{type}`; resposta `{id, type, status, created_at, done_at, table:{label}}`; 201 criou, 200 já existia), com limite de chamados (7.4.3). Encerrar o atendimento cancela os chamados abertos (sessions). **[Não implementado]** evento `call.created` (Socket.IO) e `/me/calls`. O trecho "Emite o evento" e "Responde 201" acima descrevem a especificação; hoje a resposta pode ser 200. 

## 7.6 Card em tempo real no balcão 

**[Especificado]** A tela do balcão (`/balcao`, em computador) mostra o cabeçalho "Chamados" com contagem de abertos e o indicador "Ao vivo", um card por chamado aberto em ordem de chegada (RN06) com tipo, mesa e tempo decorrido, e o botão Finalizar; ao lado, o painel "Mesas em atendimento" com número de aparelhos, tempo, marcador "manter aberto" e botão Encerrar. 
 
- Estado inicial: ao abrir a tela e a cada reconexão, o balcão carrega os cards por `GET /calls?status=OPEN` e as mesas por `GET /sessions?status=ACTIVE`; eventos só contam mudanças e podem ser perdidos durante uma queda (RNF03 e guia de estudos). 
- Eventos: `call.created` adiciona o card, `call.done` remove, `session.updated` atualiza o painel de mesas, `session.closed` remove os cards da mesa (ver seção 8.3). 
- Reconexão automática do cliente Socket.IO (RNF03: o balcão fica sempre ligado).  

**[Implementado no back-end, 14/11/2026]** Socket.IO e a sala por restaurante (`restaurant:<id>`, ver 8.3). **[Não implementado]** a tela do balcão. O desenho de módulos propõe, como etapa intermediária, uma interface `Notifier` com implementação que apenas escreve no console, trocada depois por uma implementação Socket.IO. Ponto a validar nº 1: alerta sonoro ao chegar um card. 

## 7.7 Atendimento (finalização) do chamado 

**[Implementado 14/11/2026, sem o evento]** `PATCH /calls/:id/done` (OWNER/STAFF): `markDone` condicional, `done_by` = id do usuário logado (DEC-06), 404 se inexistente ou de outro restaurante, 409 `CALL_NOT_OPEN` se já finalizado ou cancelado; duas finalizações simultâneas dão 200 e 409. `call.done` (Socket.IO) ainda não existe. Especificação original: depois de atender a mesa, o garçom volta ao balcão e aciona Finalizar: `PATCH /calls/:id/done` (v0.3; o desenho de módulos o chama de `/calls/:id/attend`, DV-37). A API muda o status de OPEN para DONE, grava `done_at` e `done_by` e emite `call.done` à sala do balcão; o card é removido. 
 
- **Concorrência:** o desenho de módulos e o guia exigem atualização condicional atômica (atualizar apenas onde o status ainda é OPEN e conferir a contagem de linhas afetadas). Se dois garçons clicam ao mesmo tempo, um recebe sucesso e o outro 409 ("Este chamado já foi atendido"); se o chamado não existe no restaurante, 404. O `update` atual do repositório não filtra por status; falta o método condicional (`markDone`). 
- **Quem finalizou:** `done_by` existe, mas o MVP prevê um acesso único do balcão; registrar o garçom individual depende da decisão do ponto a validar nº 2 (DV-07). 
- **Visibilidade ao cliente:** a v0.3 não define se o cliente vê que o chamado foi finalizado (ponto a validar nº 5). O desenho de módulos emite `call.done` também para a sala da sessão ("garçom a caminho"); a v0.3 só emite ao balcão (DV-06). 
- A v0.2 tinha um passo adicional (aceitar o chamado, estado ACCEPTED, primeiro garçom vence); o MVP não tem esse passo.  

## 7.8 Encerramento do atendimento 

**[Especificado]** O balcão encerra a mesa com `POST /sessions/:id/close` (STAFF, JWT). Em uma única transação de banco: 
 
- O atendimento passa a CLOSED, com `closed_reason` STAFF e `closed_by` igual ao usuário. 
- Todos os tokens da sessão recebem `revoked_at` (somente os ainda não revogados). 
- Os chamados OPEN da sessão passam a CANCELLED.  

Após o commit, o evento `session.closed` (com o motivo) é emitido às salas do balcão e da sessão; o balcão remove os cards da mesa e os aparelhos exibem "Atendimento encerrado", com os botões bloqueados. Resposta 200 com status CLOSED, `revokedTokens` e `cancelledCalls`. Se a sessão já está CLOSED, o desenho de módulos prevê 409 "Mesa já está fechada"; se não existe no restaurante, 404. Um aparelho revogado que tente `POST /public/calls` recebe 401 `TOKEN_REVOKED`. 

A transação é necessária para evitar estado parcial (sessão fechada com tokens ainda válidos). Efeitos externos (Socket.IO) só ocorrem depois do commit. Novo scan após o encerramento: segundo a v0.3 abre novo atendimento imediatamente (fluxo do token), mas o ponto a validar nº 4 continua listado como aberto. **[Implementado]** apenas os blocos: `update` da sessão, `revokeAllBySession` e `cancelOpenBySession`; a transação, o service e a rota não existem. O tipo `DbClient` (cliente do Prisma ou transação) já permite instanciar repositórios dentro de `$transaction`. 

## 7.9 Expiração em 4 horas e "manter aberto" 

### 7.9.1 Regra 

**[Especificado]** RN10 e RF12: o atendimento expira em 4 h quando não está marcado como "manter aberto" (RF11). Com `keep_open` verdadeiro, a sessão continua ACTIVE sem expirar e só termina por encerramento manual. O valor de 4 h vem de `TABLE_SESSION_TTL` (14400 s). Os exemplos do documento de módulos e do guia usam 3 h (DV-03); a duração adotada é 4 h (v0.3), configurável. 

### 7.9.2 Duas camadas 
 
- **Expiração preguiçosa (lazy), na requisição:** a verificação "não está em manter aberto e `expires_at` menor ou igual a agora" é feita a cada uso do token, para garantir segurança mesmo que o job falhe ou atrase; resulta em 401. 
- **Job agendado (planejado: rotina a cada 60 s):** busca os atendimentos vencidos, fecha cada um com `closed_reason` TIMEOUT e `closed_by` nulo, revoga tokens, cancela chamados OPEN e emite `session.closed`. Deve usar atualização condicional (status ainda ACTIVE) porque o balcão pode encerrar no mesmo segundo, e ter `try/catch` para não derrubar o processo. Com duas instâncias da API o job roda duas vezes, o que é inofensivo com a atualização condicional; em escala maior seria um cron separado ou fila.  

_Figura: **Figura 7.3** – Fluxograma de expiração de atendimentos (job planejado). (Ver seção 7.9)_ 

### 7.9.3 Manter aberto 

**[Especificado]** Endpoint `PATCH /sessions/:id` com `keepOpen` verdadeiro ou falso (v0.3; módulos: `PATCH /sessions/:id/keep-open`), restrito ao papel STAFF. Evento `session.updated` atualiza o marcador no balcão. Ponto a validar nº 6: se o cliente também poderia ativar; o MVP é só balcão (DV-08). Sessão inexistente ou não ACTIVE: 404. 

**[Implementado]** Coluna `keep_open` (padrão falso), `expires_at`, `closed_reason` (TIMEOUT ou STAFF), e `findExpired` (ACTIVE, `keep_open` falso, `expires_at` vencido, sem filtro de restaurante porque varre todos). Não existe job (nem pasta `jobs`) nem service. 

## 7.10 Revogação de tokens 

A revogação preenche `revoked_at` de todos os tokens do atendimento no momento do encerramento ou da expiração. É a razão de a v0.3 ter escolhido token opaco por aparelho em vez de JWT: o JWT vale até expirar e não pode ser invalidado de imediato; o token opaco é consultado no banco a cada requisição e perde acesso no instante da revogação. Consequências: aparelhos revogados não criam chamados (RN09); a resposta é 401 `TOKEN_REVOKED` (que, na v0.3, cobre revogado e expirado, sem código separado: DV-35). **[Implementado]** `revokeAllBySession` atualiza só linhas com `revoked_at` nulo. **[Não implementado]** o fluxo que a aciona. 

## 7.11 Cancelamento de chamados 

**[Especificado]** Ao encerrar ou expirar o atendimento, os chamados OPEN da mesa passam a CANCELLED e saem da tela do balcão (RN11). A v0.3 marca RN11 como "Proposto", mas o fluxo de encerramento e o ciclo de vida do chamado a tratam como regra (DV-04); a v0.2 usava o estado EXPIRED. Decisão: cancelar todos os chamados OPEN, usando CANCELLED. **Requer validação**. O desenho de módulos prevê ainda que o cliente cancele o próprio chamado (`DELETE /me/calls/:id`, evento `call:cancelled`), o que não existe na v0.3. Chamados já DONE não mudam. `CANCELLED` não grava quando nem por quem (sem campo próprio). **[Implementado]** `cancelOpenBySession` (atualização em lote de OPEN para CANCELLED, retorna a contagem). 

## 7.12 Estados de sessão e de chamado 

### 7.12.1 Sessão (`table_sessions.status`) 

_Figura: **Figura 7.4** – Máquina de estados do atendimento (sessão de mesa). (Ver seção 7.12.1)_  
| Estado | Entrada | Saída | Observações |
|---|---|---|---|  ``
| ACTIVE | Primeiro acesso/chamado da mesa | CLOSED por expiração (TIMEOUT) ou encerramento (STAFF) | No máximo um por mesa (índice parcial). Com keep_open, não expira. | 
| CLOSED | Fim do atendimento | Nenhuma (final) | Tokens revogados; chamados OPEN cancelados. Novo scan cria outro atendimento (linha nova). |   

Os rótulos em português do diagrama original (ATIVO e ENCERRADO) correspondem aos valores ACTIVE e CLOSED do banco. O schema não tem `created_at` nem `closed_at` em `table_sessions`, o que impede, por exemplo, calcular a duração real de um atendimento (DV-25). 

### 7.12.2 Chamado (`calls.status`) 

_Figura: **Figura 7.5** – Máquina de estados do chamado. (Ver seção 7.12.2)_  
| Estado | Entrada | Saída | Observações |
|---|---|---|---|  
| OPEN | Cliente chama | DONE (Finalizar) ou CANCELLED (encerramento/expiração) | Card visível no balcão. | ````
| DONE | Finalizar no balcão | Final | done_at e done_by preenchidos. | 
| CANCELLED | Atendimento encerrado ou expirado | Final | Sem registro de data/autor. |   

Os estados ACCEPTED e EXPIRED existiram apenas na v0.2 e não constam do schema (DV-29). O guia sugere validar as transições como dado (OPEN para DONE ou CANCELLED; finais sem saída), mas a garantia real deve ser a atualização condicional no banco. 

## 7.13 Erros e exceções nos fluxos 

_Figura: **Figura 7.6** – Tratamento de erros: do middleware de validação ao tratador global. (Ver seção 7.13 e 8.5)_  
| Situação | Resposta | Origem | Estado |
|---|---|---|---|  ``
| Corpo inválido | 400, ValidationError com lista de campos | Middleware de validação (Zod) | [Implementado] | ````
| Sem token de usuário, mal formatado, inválido ou expirado | 401 UnauthorizedError (mensagens: "Token não informado", "Token mal formatado", "Token inválido ou expirado") | ensureAuthenticated | [Implementado] (não usado em rotas) | ``
| Papel insuficiente | 403 (mensagem "Você não tem permissão para isso") | ensureRole | [Planejado] | ``
| Token de mesa ausente, revogado, expirado ou sessão encerrada | 401 TOKEN_REVOKED (v0.3); texto "Sua sessão nesta mesa terminou" (módulos) | Middleware de token da mesa | [Planejado] | ``
| Mesa inexistente ou inativa | 404 TABLE_NOT_FOUND | Rota pública da mesa | [Planejado] | 
| Recurso de outro restaurante | 404 (nunca 403, para não confirmar existência) | Repositórios com filtro de tenant | [Parcial: filtro nos repositórios] | ``
| Excesso de chamados | 429 TOO_MANY_REQUESTS | 10 por 5 min por token | [Implementado 14/11/2026] | 
| Chamado já finalizado por outro garçom | 409 | Atualização condicional | [Planejado] | 
| Encerrar sessão já fechada | 409 | Service de sessões | [Planejado] | 
| Violação de unicidade (e-mail, slug, código, sessão ativa duplicada) | 409 (Prisma P2002) | Tratador global | [Implementado] | 
| Registro não encontrado numa atualização/remoção | 404 (Prisma P2025) | Tratador global | [Implementado] | ``
| Erro inesperado | 500 InternalServerError, "Erro interno do servidor", sem vazar detalhes | Tratador global | [Implementado] | 
| Perda de conexão do balcão | Reconexão automática e recarga dos cards abertos | Cliente Socket.IO e REST | [Planejado] | 
| Job de expiração falha | Erro registrado com console.error; a varredura seguinte continua e a expiração preguiçosa protege | Job | [Implementado 14/11/2026] |

[Implementado 14/11/2026] Job de expiração: `back-end/src/shared/jobs/session-expiry.job.ts` (setInterval de 60 s no processo, iniciado em `main.ts` após o listen, timer com unref) chama `SessionsService.expireDue()`: `findExpired` (ativos, keep_open falso, `expires_at` <= agora, todos os restaurantes, índice parcial `table_sessions_one_active`; 0,04 ms com 200 mil encerrados) e encerra um por vez com `closed_reason` TIMEOUT e `closed_by` nulo, na mesma transação do encerramento manual (revoga tokens, cancela chamados abertos); emite `session:closed {id, reason:'TIMEOUT'}` após o commit e devolve a contagem. Testes: `back-end/tests/session-expiry.test.ts`. Instância única.   

A tabela completa de códigos e o formato do corpo de erro estão na seção 8.5. Falhas de emissão de evento ocorrem depois do commit e não desfazem o chamado: o estado inicial recarregado por REST corrige a tela. 

## 7.14 Cenários de uso 

### 7.14.1 Cenário principal: chamado atendido 
 
- Mesa 12 está livre. Maria escaneia o QR; a tela mostra "Restaurante exemplo / Mesa 12". 
- Maria toca em Chamar garçom. Sem token, o aparelho obtém um (abre atendimento de 4 h) e envia o chamado; o card "Garçom, Mesa 12" aparece no balcão em até 2 s. 
- O garçom Ana vê o card, atende a mesa, volta e clica em Finalizar; o card some. O atendimento da mesa continua ativo.  

### 7.14.2 Vários aparelhos na mesma mesa 

João escaneia o mesmo QR na mesma mesa: recebe outro token no atendimento existente; o painel mostra "2 aparelhos". Os dois podem chamar; pela DEC-03 há um card por tipo e sessão: o segundo toque do mesmo tipo devolve o chamado aberto. Pedir a conta cria um card do tipo Fechar conta, que pode coexistir com um chamado de garçom aberto. 

### 7.14.3 Encerramento pelo balcão 

Os clientes saem. O garçom clica em Encerrar na Mesa 12. A API fecha o atendimento, revoga 2 tokens e cancela 1 chamado aberto; o card some. O celular de Maria, com a aba aberta, mostra "Atendimento encerrado". Se ela tocar em um botão, recebe 401 `TOKEN_REVOKED`. Se reescanear o QR, abre-se um novo atendimento (ponto a validar nº 4). 

### 7.14.4 Expiração 

Mesa 7 abriu às 12:00 e ninguém encerrou. Às 16:00 o job fecha o atendimento com motivo TIMEOUT, revoga tokens e cancela chamados abertos; os cards somem. Se o job estivesse parado, o primeiro uso de um token após 16:00 já seria recusado pela expiração preguiçosa. 

### 7.14.5 Mesa mantida aberta 

Aniversário na Mesa 12, que passa das 4 h. O balcão marca "manter aberto": o job ignora a sessão e o marcador aparece no painel. A sessão só termina quando o balcão a encerra. 

### 7.14.6 Dois garçons clicam Finalizar ao mesmo tempo 

A atualização condicional garante que apenas um registre DONE; o outro recebe 409 e deve recarregar a lista (o card já foi removido pelo evento `call.done`). 

### 7.14.7 Foto da plaquinha usada de longe 

Alguém em casa abre o link da mesa. Pela v0.3, isso abriria um atendimento fantasma e permitiria chamados; o desenho de módulos evitava isso exigindo que o garçom abrisse a mesa. Esse risco é a razão principal de manter a divergência DV-01 sob validação; mitigações previstas: limite de chamados, expiração e revogação. 

## 7.15 Especificado x implementado nos fluxos 

Em resumo, dos fluxos deste capítulo o código contém apenas os blocos de dados: schema e migration (com o índice parcial de sessão ativa), os repositórios de mesas, sessões, tokens e chamados (incluindo `revokeAllBySession`, `cancelOpenBySession` e `findExpired`), o tratamento global de erros (em formato diferente do documentado) e o cadastro/login do staff (o register não cria restaurante). Abertura de atendimento, token de aparelho, chamados, card em tempo real, finalização, encerramento transacional, expiração de 4 h e manter aberto estão especificados, mas sem service, rota, job ou Socket.IO. O estado por módulo está em 9.1 e o estado por requisito em 9.2.
