# 7. Fluxos operacionais e ciclos de vida 

Este capítulo descreve, passo a passo, como o sistema opera em tempo de execução no MVP "chamado" (documentação v0.3), conferido com o código em 14/11/2026: como um atendimento de mesa é aberto, como cada aparelho recebe seu token, como nasce e é finalizado um chamado, como o card aparece em tempo real no balcão, e como o atendimento é encerrado, expira ou é mantido aberto.

## 7.1 Convenções e como ler o estado de implementação 

Cada fluxo abaixo é marcado com uma das etiquetas a seguir, definidas na especificação comum deste documento: 
 
- **[Especificado]**: previsto na documentação (v0.3, v0.2, documento de módulos ou guia de estudos), independentemente de existir código. 
- **[Implementado]**: confirmado no código do back-end em `back-end/` (rotas, middlewares, services, repositórios, schema e migrations) e, quando citado, no front-end.
- **[Planejado/Não implementado]**: previsto, mas sem código correspondente.  
**Estado real, em uma frase.** Todos os fluxos deste capítulo estão implementados no back-end e no front (14/11/2026): scan com token por aparelho, chamados, tempo real, finalização, encerramento transacional, expiração de 4 h (job de 60 s mais expiração no uso) e estender. Os pontos que o código decidiu de forma diferente do texto original (por exemplo o scan como POST e os eventos com dois pontos) estão indicados em cada seção; as pendências estão no capítulo 9.
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

[Implementado, DEC-01] Havia três versões na documentação (DV-01): primeiro chamado (glossário v0.3), obtenção do token (API v0.3) e abertura pelo garçom (módulos e README). O usuário decidiu em 13/11/2026: **o primeiro scan do QR abre o atendimento, e o garçom (OWNER ou STAFF) também pode abri-lo e encerrá-lo pelo balcão** (`POST /tables/:id/session`). A rota do scan é `POST /public/tables/:code/scan`, e não `GET`, porque abre atendimento e emite token (um GET poderia ser disparado por prefetch ou crawlers). O risco de abrir atendimento "por foto do QR" é contido por rate limit de scan (30 por 15 min por IP), limite de chamados por token (10 por 5 min), expiração em 4 h e revogação ao encerrar. DV-01 está resolvida.
### 7.3.3 Fluxo de decisão 

_Figura: **Figura 7.2** – Fluxograma de decisão: token do aparelho e abertura de atendimento. (Ver seção 7.3 e 7.4)_ 

Em prosa, o fluxo **[Implementado]** é: 
 
- O cliente abre `/m/[code]` (URL do QR e da tag NFC). O front usa o token do aparelho guardado em `psiu.device.<código>`, se ainda vale (até o `expires_at`); senão chama `POST /public/tables/:code/scan`. Não existe `GET /public/tables/:code`: o próprio scan devolve o nome da mesa e do restaurante. 
- A API valida o formato do código (fora do formato, 404 sem consultar o banco) e procura a mesa. Código inexistente, mesa inativa ou restaurante desativado resultam no mesmo 404 "Mesa não encontrada". 
- A API procura o atendimento ativo da mesa. Se há (e não venceu), emite um novo token ligado a ele; se não, cria um atendimento ativo com `expires_at` igual a agora mais 4 h (`TABLE_SESSION_TTL`, 14400 s), emite `session:opened` e emite o token. Um atendimento vencido é encerrado com TIMEOUT no primeiro uso (segunda camada da expiração). 
- Se duas requisições tentarem abrir ao mesmo tempo, o índice único parcial faz a segunda falhar (P2002); o service captura o erro, relê o atendimento vencedor e usa-o ("find or create" seguro). 
- O front junta scans simultâneos num só (cada scan cria um token novo no servidor).  

**[Implementado]** `SessionsService.scan`, `activeOrOpen`, `findActive`, `TableSessionRepository.findActiveByTable` e `create`, `TableRepository.findByPublicCode`, `generatePublicCode` (12 caracteres). Testes em `tests/sessions.test.ts`.

### 7.3.4 Entradas, saídas e validações  
| Item | Descrição |
|---|---|  
| Entrada | Código público da mesa (parâmetro de rota). Não há token na entrada. |
| Saída | `{ token, expires_at, table: { label }, restaurant: { name } }`; o token vem em texto uma única vez. |
| Validações | Formato do código; mesa existente e ativa; restaurante ativo; unicidade de atendimento ativo (índice); expiração conferida na hora do uso. Limite de 30 scans por 15 min por IP. |
| Efeitos | Nova linha em `table_sessions` (se não havia ativo) e nova linha em `session_tokens`; evento `session:opened` ao balcão quando o atendimento é aberto. |
| Dependências | Módulos `tables` e `sessions` (ver capítulo 6). |

## 7.4 Token por aparelho 

### 7.4.1 Finalidade 

Cada aparelho que entra no atendimento recebe um token próprio (RN05). Isso permite revogar todos de uma vez ao encerrar a mesa, contar quantos aparelhos há na mesa (painel do balcão mostra "3 aparelhos") e registrar qual token originou cada chamado (`calls.token_id`). A v0.2 previa um único token por sessão compartilhado por todos; a v0.3 e o schema atual usam um token por aparelho (DV-24). 

### 7.4.2 Geração, armazenamento e validação 
 
- **[Implementado]** Token aleatório e opaco, sem significado; só o hash fica no banco (coluna `session_tokens.token_hash`, única); o texto do token existe apenas no aparelho (RNF05). 
- **[Implementado]** 32 bytes aleatórios em base64url (cerca de 43 caracteres), hash SHA-256 em hexadecimal (`generateSessionToken` e `hashToken` em `shared/utils/token.ts`). SHA-256 (e não scrypt) porque o token é procurado pelo próprio hash e tem 256 bits de entropia, o que torna força bruta inviável. 
- **[Implementado]** Validação a cada requisição de chamado (`ensureTableToken`, cabeçalho `X-Table-Token`): calcula o hash, busca por `findByHash` (que já traz a sessão e a mesa) e responde 401 "Token da mesa inválido ou expirado" se o token não existe, está revogado (`revoked_at`), a sessão não está ACTIVE ou venceu sem `keep_open`. O resultado vai para `req.tableToken` (`tokenId`, `sessionId`, `restaurantId`, `tableLabel`). Não checa `table.active` nem `restaurant.active`: desativar mesa ou restaurante já encerra os atendimentos e revoga os tokens. 
- **[Implementado]** Armazenamento no navegador: `localStorage`, chave `psiu.device.<código da mesa>`, válido até o `expires_at` (o guia recomendava cookie httpOnly; o risco de XSS está registrado para revisão). 
- **[Implementado]** Tabela `session_tokens` (`token_hash` único, `revoked_at` opcional) e `SessionTokenRepository` com `create`, `findByHash` e `revokeAllBySession`. 

### 7.4.3 Limite de abuso 

**[Implementado 14/11/2026]** `callLimiter`: 10 chamados por 5 min por token do aparelho; excedeu = 429 com `code` `TOO_MANY_REQUESTS` (o `TOO_MANY_CALLS` da v0.3 não é usado). Contadores em memória, desligados em testes; sem limite por mesa. Os limites por IP (login, cadastro e scan) dependem de `TRUST_PROXY` correto atrás de proxy reverso. 

## 7.5 Chamado de garçom e de conta 

### 7.5.1 Funcionamento 

O chamado é o pedido de atenção feito pela mesa. Tem dois tipos (RN03): `WAITER` (Chamar garçom) e `BILL` (Pedir a conta, mostrado no balcão como "Fechar conta"). Fluxo **[Especificado]**: 
 
- A tela da mesa envia `POST /public/calls` com o corpo `{ type }` e o cabeçalho `X-Table-Token`. 
- A API valida o token (seção 7.4.2) e o limite de chamados. 
- Cria a linha em `calls` com status OPEN, `session_id` e `token_id` do aparelho e `restaurant_id` do atendimento (numa transação que trava a sessão). 
- Emite o evento `call:created` para a sala `restaurant:<id>` (depois do commit). 
- Responde 201 com `{ id, session_id, type, status, created_at, done_at, table: { label } }`. A tela mostra a confirmação de envio (RF07). 

### 7.5.2 Chamados repetidos 

**[Implementado 14/11/2026, DEC-03]** Vale isto, no lugar do "Requer validação" abaixo: um chamado OPEN por tipo e por sessão; tocar de novo devolve o mesmo chamado com 200 e `created_at` intacto (201 só quando cria; não há 409); WAITER e BILL coexistem; toques simultâneos são resolvidos pelo índice parcial `calls_one_open_per_type` e o service devolve o vencedor. O texto a seguir é o histórico da dúvida.

Histórico: a v0.3 era contraditória (RN08 "cada novo chamado gera um novo card" contra RN12 e o ponto a validar nº 3), e o documento de módulos propunha responder 409. A DEC-03 encerrou a questão como descrito acima.

### 7.5.3 Estado de implementação 

**[Implementado 14/11/2026]** Tabela `calls`, `CallRepository` (inclui `findOpen` e `markDone`), `CallsService`, controller, schemas e rota `POST /public/calls` (corpo `{type}`; resposta `{id, type, status, created_at, done_at, table:{label}}`; 201 criou, 200 já existia), com limite de chamados (7.4.3). Encerrar o atendimento cancela os chamados abertos (sessions). **[Não implementado]** evento `call.created` (Socket.IO) e `/me/calls`. O trecho "Emite o evento" e "Responde 201" acima descrevem a especificação; hoje a resposta pode ser 200. 

## 7.6 Card em tempo real no balcão 

**[Implementado]** A tela do balcão é `/admin/waiter` (computador): cabeçalho com a contagem de chamados abertos, um card por chamado aberto em ordem de chegada (RN06) com tipo, mesa e cronômetro (`agora - created_at`, com o relógio corrigido pelo `serverTime`), botão Finalizar, e o painel de mesas em atendimento (com aviso âmbar "Vence em" a menos de 15 min do vencimento, estender +4 h e encerrar com confirmação). 
 
- Estado inicial: ao abrir a tela e a cada `connect` (inclusive reconexão), o balcão carrega `GET /calls` (OPEN), `GET /calls?status=DONE&since=<hoje 00:00>` e `GET /sessions` (ACTIVE); eventos só contam mudanças e podem ser perdidos durante uma queda (RNF03). Um contador de eventos recebidos durante a carga faz a carga repetir (até 3 vezes) em vez de sobrescrever a tela com um retrato mais velho que o evento; se a carga falha, mostra "Dados desatualizados, tentando de novo..." e tenta a cada 5 s. 
- Eventos (com dois pontos, na sala `restaurant:<id>`): `call:created` adiciona o card (e dispara o alerta sonoro, DEC-10), `call:done` remove, `session:opened`, `session:extended` e `session:closed` atualizam o painel de mesas (este último também remove os cards de chamado da sessão, que a API cancelou). Não há `call:cancelled`. 
- Reconexão automática do cliente Socket.IO (RNF03); o cookie `access_token` vai no handshake (`withCredentials`), é conferido só na conexão, e um token recusado ("Não autorizado") limpa a sessão e volta ao login. 

**[Implementado]** No back-end, `INotifier` (`toRestaurant`, `disconnectUser`, `disconnectRestaurant`) com `SocketNotifier` registrado como "Notifier". Os testes de tempo real estão em `tests/realtime.test.ts`. Limitações aceitas: o socket continua válido até reconectar se o usuário perder acesso por outro caminho que não desativar ou excluir; instância única (com mais de uma seria preciso o adapter Redis).

## 7.7 Atendimento (finalização) do chamado 

**[Implementado 14/11/2026]** `PATCH /calls/:id/done` (OWNER/STAFF): `markDone` condicional, `done_by` = id do usuário logado (DEC-06), 404 se inexistente ou de outro restaurante, 409 `CALL_NOT_OPEN` se já finalizado ou cancelado; duas finalizações simultâneas dão 200 e 409. Emite `call:done` com `{ id }` depois do commit. 
 
- **Concorrência:** atualização condicional atômica (atualiza apenas onde o status ainda é OPEN e confere a contagem de linhas afetadas). Se dois garçons clicam ao mesmo tempo, um recebe sucesso e o outro 409; o balcão recarrega e volta a refletir o servidor. 
- **Quem finalizou:** cada garçom tem login próprio (DEC-06); `done_by` recebe o usuário do token e vira nulo se o usuário for excluído. 
- **Visibilidade ao cliente:** o cliente não vê a finalização (DEC-08); depois de 30 s o botão volta e tocar de novo é seguro, porque o servidor devolve o chamado aberto em vez de criar outro. 
- A v0.2 tinha um passo adicional (aceitar o chamado, estado ACCEPTED, primeiro garçom vence); o MVP não tem esse passo. 

## 7.8 Encerramento do atendimento 

**[Implementado]** O balcão encerra a mesa com `POST /sessions/:id/close` (OWNER ou STAFF, JWT). Em uma única transação de banco: 
 
- O atendimento passa a CLOSED, com `closed_reason` STAFF e `closed_by` igual ao usuário. 
- Todos os tokens da sessão recebem `revoked_at` (somente os ainda não revogados). 
- Os chamados OPEN da sessão passam a CANCELLED.  

Após o commit, o evento `session:closed` (`{ id, reason }`) é emitido à sala `restaurant:<id>`; o balcão remove os cards da mesa. O cliente não recebe evento (DEC-08): o aparelho com aba aberta só descobre o encerramento ao tocar em um botão, quando recebe 401, limpa o token, faz um novo scan (que abre um atendimento novo, DEC-07) e tenta de novo uma única vez. Resposta 200 com a sessão encerrada; 409 `SESSION_CLOSED` se já estava encerrada. 

A transação é necessária para evitar estado parcial (sessão fechada com tokens ainda válidos); o fechamento só acontece se a sessão ainda está ACTIVE (`closeIfActive`), de modo que dois encerramentos simultâneos não duplicam o efeito. Efeitos externos (Socket.IO) só ocorrem depois do commit. O mesmo fechamento é usado ao desativar a mesa e ao desativar o restaurante (`closed_by` = quem desativou). 

## 7.9 Expiração em 4 horas e "manter aberto" 

### 7.9.1 Regra 

**[Implementado]** RN10 e RF12: o atendimento expira em 4 h (`TABLE_SESSION_TTL`, 14400 s). Estender (DEC-09, que substitui o "manter aberto" do balcão) acrescenta mais 4 h a partir do maior entre o vencimento atual e agora. A coluna `keep_open` continua no schema e é respeitada pelo job e pelo `ensureTableToken`, mas nenhuma rota a ativa hoje. 

### 7.9.2 Duas camadas 
 
- **Expiração no uso (lazy):** a verificação "`expires_at` menor ou igual a agora" é feita a cada uso do token (`ensureTableToken`, resultado 401) e a cada scan ou abertura (`findActive` encerra o vencido com TIMEOUT e segue), para garantir segurança mesmo que o job falhe ou atrase. 
- **Job agendado [Implementado]:** `startSessionExpiryJob` (a cada 60 s, `setInterval` com `unref`) chama `SessionsService.expireDue()`, que busca os atendimentos vencidos de todos os restaurantes e fecha cada um, um por vez, com `closed_reason` TIMEOUT e `closed_by` nulo, na mesma transação do encerramento manual (revoga tokens, cancela chamados OPEN) e emite `session:closed` depois do commit. A falha de um atendimento é registrada e não derruba os demais. 

_Figura: **Figura 7.3** – Fluxograma de expiração de atendimentos (job de 60 s e expiração no uso). (Ver seção 7.9)_ 

### 7.9.3 Manter aberto 

**[Implementado]** O front não expõe um botão separado de "manter aberto": a ação é **estender** (`POST /sessions/:id/extend`, +4 h), só no balcão (DEC-09), e emite `session:extended` com o novo `expires_at`. O aviso de 15 minutos antes do vencimento (DEC-02) é calculado no front a partir de `expires_at`; a API não o emite. Limitação registrada: `extend` não é condicional, então um `close` simultâneo pode gerar `session:extended` depois de `session:closed`. 

## 7.10 Revogação de tokens 

A revogação preenche `revoked_at` de todos os tokens do atendimento no momento do encerramento ou da expiração. É a razão de a v0.3 ter escolhido token opaco por aparelho em vez de JWT: o JWT vale até expirar e não pode ser invalidado de imediato; o token opaco é consultado no banco a cada requisição e perde acesso no instante da revogação. Consequências: aparelhos revogados não criam chamados (RN09); a resposta é 401 `TOKEN_REVOKED` (que, na v0.3, cobre revogado e expirado, sem código separado: DV-35). **[Implementado]** `revokeAllBySession` atualiza só linhas com `revoked_at` nulo. **[Não implementado]** o fluxo que a aciona. 

## 7.11 Cancelamento de chamados 

**[Implementado]** Ao encerrar ou expirar o atendimento, os chamados OPEN da mesa passam a CANCELLED na mesma transação e saem da tela do balcão pelo `session:closed` (RN11; DV-04 resolvida). Chamado CANCELLED não tem `done_at` nem autor. 

## 7.12 Estados de sessão e de chamado 

### 7.12.1 Sessão (`table_sessions.status`) 

_Figura: **Figura 7.4** – Máquina de estados do atendimento (sessão de mesa). (Ver seção 7.12.1)_  
| Estado | Entrada | Saída | Observações |
|---|---|---|---|  ``
| ACTIVE | Primeiro scan ou abertura pelo balcão | CLOSED por expiração (TIMEOUT), encerramento (STAFF) ou desativação da mesa ou do restaurante (STAFF) | No máximo um por mesa (índice parcial). Estender acrescenta 4 h. |
| CLOSED | Fim do atendimento | Nenhuma (final) | Tokens revogados; chamados OPEN cancelados. Novo scan cria outro atendimento (linha nova). Reativar mesa ou restaurante não reabre. |

Os rótulos em português do diagrama original (ATIVO e ENCERRADO) correspondem aos valores ACTIVE e CLOSED do banco. `table_sessions` tem `created_at` e `closed_at` (14/11/2026), então a duração real de um atendimento pode ser calculada (DV-25 resolvida). 

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
| Corpo inválido | 400, ValidationError com lista de campos | Middlewares de validação (Zod) | [Implementado] |
| JSON malformado / corpo grande demais | 400 "JSON inválido" / 413 `PAYLOAD_TOO_LARGE` | errorHandler | [Implementado] |
| Sem token de usuário, mal formatado, inválido ou expirado; usuário ou restaurante desativado | 401 UnauthorizedError ("Token não informado", "Token mal formatado", "Token inválido ou expirado") | ensureAuthenticated | [Implementado] |
| Papel insuficiente | 403 "Sem permissão para esta ação" | ensureRole | [Implementado] |
| Token de mesa ausente, revogado, expirado ou sessão encerrada | 401 "Token da mesa inválido ou expirado" (mensagem única; o `TOKEN_REVOKED` da v0.3 não foi adotado) | ensureTableToken | [Implementado] |
| Mesa inexistente, inativa ou de restaurante desativado | 404 "Mesa não encontrada" (igual nos três casos; sem `TABLE_NOT_FOUND`) | Scan | [Implementado] |
| Recurso de outro restaurante | 404 (nunca 403, para não confirmar existência) | Repositórios com filtro de tenant | [Implementado] |
| Excesso de chamados, scans, logins ou cadastros | 429 (`TOO_MANY_REQUESTS` nos chamados) | express-rate-limit | [Implementado] |
| Chamado já finalizado por outro garçom | 409 `CALL_NOT_OPEN` | Atualização condicional | [Implementado] |
| Encerrar ou estender sessão já fechada | 409 `SESSION_CLOSED` | SessionsService | [Implementado] |
| Abrir atendimento em mesa inativa ou já aberta | 409 `TABLE_INACTIVE` / `SESSION_ALREADY_ACTIVE` | SessionsService | [Implementado] |
| Violação de unicidade ou registro referenciado (e-mail, slug, código, sessão ativa, mesa com histórico) | 409 (Prisma P2002 e P2003) | Tratador global | [Implementado] |
| Registro não encontrado numa atualização/remoção | 404 (Prisma P2025) | Tratador global | [Implementado] |
| Erro inesperado | 500 InternalServerError, "Erro interno do servidor", sem vazar detalhes | Tratador global | [Implementado] |
| Perda de conexão do balcão | Reconexão automática e recarga dos cards abertos | Cliente Socket.IO e REST | [Implementado] |
| Job de expiração falha | Erro registrado com console.error; a varredura seguinte continua e a expiração no uso protege | Job | [Implementado] |

[Implementado 14/11/2026] Job de expiração: `back-end/src/shared/jobs/session-expiry.job.ts` (`setInterval` de 60 s no processo, iniciado em `main.ts` após o `listen`, timer com `unref`) chama `SessionsService.expireDue()`: `findExpired` (ativos, `keep_open` falso, `expires_at` <= agora, todos os restaurantes; 0,04 ms com 200 mil encerrados) e encerra um por vez com `closed_reason` TIMEOUT e `closed_by` nulo, na mesma transação do encerramento manual; emite `session:closed { id, reason: 'TIMEOUT' }` depois do commit e devolve a contagem. Testes: `back-end/tests/session-expiry.test.ts`. Instância única. 

A tabela completa de códigos e o formato do corpo de erro estão na seção 8.5. Falhas de emissão de evento ocorrem depois do commit e não desfazem o chamado: o estado inicial recarregado por REST corrige a tela. 

## 7.14 Cenários de uso 

### 7.14.1 Cenário principal: chamado atendido 
 
- Mesa 12 está livre. Maria escaneia o QR; o front chama o scan e a tela mostra "Restaurante exemplo / Mesa 12". O scan já abriu o atendimento de 4 h e entregou o token ao aparelho dela. 
- Maria toca em Chamar garçom; o aparelho envia o chamado com o token e o card "Garçom, Mesa 12" aparece no balcão em instantes. 
- O garçom Ana vê o card, atende a mesa, volta e clica em Finalizar; o card some. O atendimento da mesa continua ativo. 

### 7.14.2 Vários aparelhos na mesma mesa 

João escaneia o mesmo QR na mesma mesa: recebe outro token no atendimento existente; o painel mostra "2 aparelhos". Os dois podem chamar; pela DEC-03 há um card por tipo e sessão: o segundo toque do mesmo tipo devolve o chamado aberto. Pedir a conta cria um card do tipo Fechar conta, que pode coexistir com um chamado de garçom aberto. 

### 7.14.3 Encerramento pelo balcão 

Os clientes saem. O garçom clica em Encerrar na Mesa 12 (com confirmação). A API fecha o atendimento, revoga 2 tokens e cancela 1 chamado aberto; o card some. O celular de Maria, com a aba aberta, não recebe evento. Se ela tocar em um botão, recebe 401, limpa o token, faz um novo scan e o servidor abre um novo atendimento (DEC-07). 

### 7.14.4 Expiração 

Mesa 7 abriu às 12:00 e ninguém encerrou nem estendeu. Às 16:00 o job fecha o atendimento com motivo TIMEOUT, revoga tokens e cancela chamados abertos; os cards somem. Se o job estivesse parado, o primeiro uso de um token após 16:00 já seria recusado pela expiração no uso. A partir de 15:45 o balcão mostrava o aviso âmbar "Vence em"; o garçom poderia ter estendido por mais 4 h. 

### 7.14.5 Mesa estendida 

Aniversário na Mesa 12, que passa das 4 h. O balcão clica em Estender: o vencimento avança 4 h e o painel mostra o novo horário (`session:extended`). O atendimento só termina quando o balcão o encerra ou o novo prazo vence. 

### 7.14.6 Dois garçons clicam Finalizar ao mesmo tempo 

A atualização condicional garante que apenas um registre DONE; o outro recebe 409 e a tela recarrega (o card já foi removido pelo evento `call:done`). 

### 7.14.7 Foto da plaquinha usada de longe 

Alguém em casa abre o link da mesa. Pela decisão DEC-01 (o primeiro scan abre o atendimento), isso abre um atendimento sem cliente presente e permite chamados. O risco é aceito e contido por: limite de 30 scans por 15 min por IP, limite de 10 chamados por 5 min por token, expiração em 4 h e encerramento pelo balcão, que revoga os tokens. Mitigação futura possível: confirmar presença (por exemplo, código exibido no balcão). 

## 7.15 Especificado x implementado nos fluxos 

Todos os fluxos deste capítulo estão implementados no back-end (rotas, services, transações, job e Socket.IO) e consumidos pelo front: login e guarda de rotas, balcão em tempo real, tela da mesa e gestão de mesas e equipe pelo OWNER. O estado por módulo está em 9.1 e o estado por requisito em 9.2.
