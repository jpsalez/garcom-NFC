# 2. Requisitos e regras de negócio 

## 2.1 Convenções das tabelas 

As três tabelas seguintes (RF, RNF e RN) reproduzem integralmente os requisitos das duas versões: cada linha é um requisito, com o identificador da v0.3 e o da v0.2 lado a lado ("—" quando só existe em uma das versões). Os identificadores se repetem entre versões com significados diferentes (por exemplo, RF05 é "Gerir cardápio" na v0.2 e "Chamar garçom" na v0.3); por isso, fora destas tabelas, todo identificador vem com a versão (por exemplo, "v0.3 RF05"). As linhas seguem a ordem da v0.3; os itens que só existem na v0.2 vêm ao final de cada tabela. 

A coluna "Perfil/Origem" traz o perfil (ou a categoria, nos RNF) e a situação na própria fonte (Definido, Proposto, A validar, Futuro), na forma "perfil · v0.3: situação / v0.2: situação" quando diferem. A coluna "Status" traz a situação deste documento, conferida com o código em 14/11/2026: **Implementado** (no código e testado), **Especificado** (só nos documentos), **Não implementado** (previsto e ausente; hoje só os itens Futuro e as pendências do capítulo 9). Quando a descrição difere entre as versões, a descrição da coluna é a da v0.3 e a diferença está em Observação. Nas observações, "Admin" das fontes lê-se OWNER. 

## 2.2 Requisitos funcionais (RF)  
| ID v0.3 | ID v0.2 | Descrição | Perfil/Origem | Status | Observação |
|---|---|---|---|---|---|  ``````
| RF01 | RF01 | Autocadastro do restaurante; quem cadastra vira OWNER | OWNER · Definido | Implementado | Igual nas duas versões. `POST /auth/register` cria, numa transação, o restaurante (slug automático com sufixo em colisão) e o OWNER; resposta `{ user, restaurant }`; e-mail duplicado devolve erro genérico. Fluxo B (DEC-14). Ver seção 2.6.7 |
| RF02 | RF04 | Cadastrar mesas e gerar o QR Code de cada mesa | OWNER · Definido | Implementado | `POST/GET/PATCH/DELETE /tables` e `GET /tables/:id/qrcode` (SVG, só OWNER); `public_code` de 12 caracteres e `public_url`; excluir mesa com histórico dá 409; tela `/admin/mesas` |
| RF03 | RF02 | Criar o acesso da tela do balcão | OWNER · Definido | Implementado | `POST/GET/PATCH/DELETE /staff` (só OWNER, do próprio restaurante); categoria do STAFF (`staff_category`); desativar derruba o acesso e o socket; tela `/admin/equipe`. SUPER_ADMIN gerencia usuários de qualquer restaurante em `/admin/restaurants/...` |
| RF04 | RF06 | Abrir a tela principal da mesa pelo QR Code ou NFC, sem login | Cliente · Definido | Implementado | Front `/m/[code]` chama `POST /public/tables/:code/scan` (POST por ter efeito colateral); mesa inexistente, inativa ou de restaurante desativado dá o mesmo 404 |
| RF05 | RF08 | Chamar garçom | Cliente · Definido | Implementado | `POST /public/calls` com `X-Table-Token`, corpo `{type}`; 201 ao criar e 200 se já havia um aberto do tipo (DEC-03) |
| RF06 | RF09 | Pedir o fechamento da conta | Cliente · Definido | Implementado | Mesma rota, `type` BILL (enum `type_call`: WAITER e BILL) |
| RF07 | — | Ver a confirmação de que o chamado foi enviado | Cliente · Proposto | Implementado | Resposta 201/200 da rota e mensagem na tela da mesa; o cliente não vê a finalização (DEC-08). Ver DV-06 |
| RF08 | RF12 (parte) | Ver os chamados abertos como cards, em tempo real | Balcão · Definido | Implementado | `GET /calls` responde `{ serverTime, calls }` (filtros `status` e `since`); eventos `call:created` e `call:done` na sala `restaurant:<id>`; o balcão recarrega tudo ao reconectar. Tela `/admin/waiter` |
| RF09 | RF12 (parte) | Finalizar o chamado depois do atendimento; o card sai da tela | Balcão · Definido | Implementado | `PATCH /calls/:id/done` com `markDone` condicional; `done_by` = usuário do token (DEC-06); 409 `CALL_NOT_OPEN` se já finalizado ou cancelado; emite `call:done` |
| RF10 | RF15 | Encerrar o atendimento da mesa, revogando todos os tokens | Balcão · Definido (v0.2: Garçom, "quando os clientes saírem") | Implementado | `POST /sessions/:id/close` numa transação: sessão CLOSED (motivo STAFF), tokens revogados, chamados OPEN cancelados; evento `session:closed` só após o commit |
| RF11 | RF16 | Manter o atendimento aberto além de 4 h | Balcão · Definido (v0.2: Garçom) | Implementado | Resolvido na DEC-09: é a ação de estender (`POST /sessions/:id/extend`, +4 h), só no balcão; o aviso de 15 min antes de vencer é calculado no front a partir de `expires_at` (DEC-02) |
| RF12 | — | Expirar o atendimento após 4 h quando não estiver mantido aberto | Sistema · Definido | Implementado | Duas camadas: job de 60 s (`session-expiry.job.ts`, motivo TIMEOUT, evento `session:closed`) e expiração no momento do uso (scan e abertura) |
| RF13 | RF22 | Acesso por NFC: a tag grava a mesma URL do QR Code | Cliente · v0.3: Definido / v0.2: Futuro | Especificado | Promovido de Futuro (v0.2 "Acesso à mesa por tag NFC") a Definido. Não depende de código; é gravação de tag. Ver seção 1.5 | 
| RF14 | RF05 | Cardápio digital | Cliente · Futuro (v0.2: Admin, Definido) | Não implementado | Adiado: a v0.2 RF05 era "Gerir cardápio: categorias, itens, preço, disponibilidade". Fora do MVP | 
| RF15 | RF10, RF13, RF14, RF18 | Comanda do garçom e KDS | Garçom · Futuro (v0.2: todos Definido) | Não implementado | Adiados e agrupados. v0.2 RF10 "Ver consumo da comanda aberta da mesa" (Cliente); RF13 "Abrir comanda, lançar itens, enviar pedido à cozinha" (Garçom); RF14 "Fechar comanda; dispara convite de avaliação" (Garçom; também liga a v0.3 RF16); RF18 "KDS: fila e atualização de status" (Cozinha). Fora do MVP | 
| RF16 | RF11 | Avaliação de atendimento, comida e restaurante | Cliente · Futuro (v0.2: Definido) | Não implementado | Adiado (v0.2 "Avaliar garçom, comida e restaurante; comentário opcional"). Fora do MVP | ````
| RF17 | RF03 | App do garçom no celular e chamados por setor | Garçom · Futuro (v0.2: Admin, Definido) | Não implementado | A v0.2 RF03 era "Gerir setores e vincular garçons"; removido do MVP (item APP). Sem tabelas sectors e user_sectors no schema. Fora do MVP | 
| RF18 | RF20 | Relatórios do restaurante | Admin · Futuro (v0.2: Definido) | Não implementado | Adiado (v0.2 "Painel de avaliações e relatórios"). Fora do MVP | ``
| RF19 | RF23 | Integração com sistemas de gestão / PDV | Sistema · Futuro | Não implementado | Mantido como futuro. Fora do MVP; ponto de extensão previsto: service de calls emite eventos internos que um módulo integrations poderia consumir | 
| — | RF07 | Entrar na sessão ao chamar, pedir conta, ver consumo ou avaliar; vários clientes na mesma sessão | Cliente · Definido (v0.2) | Não implementado | Sem RF equivalente na v0.3: absorvido por v0.3 RN04 e RN05 (atendimento compartilhado, token por aparelho) | 
| — | RF17 | Aviso ao garçom quando o pedido ficar pronto | Garçom · A validar (v0.2) | Não implementado | Sem equivalente na v0.3 (depende de KDS); abandonado do escopo declarado | 
| — | RF19 | Separar a fila do KDS por estação | Cozinha · A validar (v0.2) | Não implementado | Sem equivalente; citado como "KDS-EST" depois da v1; abandonado do escopo declarado | 
| — | RF21 | Registro de pagamento (forma, valor, divisão) | Garçom · A validar (v0.2) | Não implementado | Sem equivalente; citado como "PAG" depois da v1; abandonado do escopo declarado |   

Contagem v0.3: 13 requisitos no MVP (RF01 a RF13; 12 definidos e RF07 proposto) e 6 futuros (RF14 a RF19), totalizando 19, coerente com o painel da v0.3. Contagem v0.2: 23 requisitos; 18 definidos (RF01 a RF16, RF18, RF20), 3 a validar (RF17, RF19, RF21) e 2 futuros (RF22, RF23). A v0.2 está superada em escopo, mas permanece como referência da visão de longo prazo. 

## 2.3 Requisitos não funcionais (RNF)  
| ID v0.3 | ID v0.2 | Descrição | Perfil/Origem | Status | Observação |
|---|---|---|---|---|---|  ````````````````
| RNF01 | RNF01 | Isolamento por restaurante: toda consulta filtrada por restaurant_id | Segurança · Definido | Implementado | O `restaurantId` vem do JWT (nunca do cliente) via `ensureAuthenticated` e `tenantOf`; todo repository de dados de restaurante recebe `restaurantId` como primeiro parâmetro; recurso de outro restaurante responde 404. Exceções legítimas: `findByEmail` no login, `findByPublicCode` no scan, `findExpired` no job. Coberto por `tests/tenant-isolation.test.ts` e pelo script `check_tenant.py` |
| RNF02 | RNF02 | Card em até 2 s entre o toque do cliente e a tela do balcão | Tempo real · v0.3: "Meta proposta" / v0.2: "Meta a validar" | Implementado (meta de 2 s ainda não medida) | Socket.IO com JWT no handshake e sala `restaurant:<id>`; eventos emitidos só depois do commit (`tests/realtime.test.ts`) |
| RNF03 | RNF07 | Balcão sempre ligado; reconecta sozinho e recarrega os cards abertos após queda de rede | Operação · Definido | Implementado | O balcão recarrega `GET /calls` e `GET /sessions` a cada `connect` (inclusive reconexão) e, se a carga falha, tenta de novo a cada 5 s. O JWT só é conferido na conexão; desativar usuário ou restaurante derruba os sockets |
| RNF04 | RNF03, RNF04 | Mesa em um toque: tela do cliente leve, mobile-first, sem app e sem login | UX · Definido | Implementado | `/m/[code]` (Next.js) sem login; o token do aparelho fica no `localStorage` (`psiu.device.<código>`) até o `expires_at` |
| RNF05 | RNF05 | Tokens revogáveis: token aleatório por aparelho, salvo só como hash no banco | Segurança · Definido | Implementado | Token opaco gerado por `generateSessionToken`, guardado como SHA-256 em `session_tokens.token_hash`; `revoked_at` preenchido ao encerrar. Equipe: JWT HS256 e senha com scrypt (DV-22) |
| RNF06 | — | Limite de chamados por token e por mesa, contra abuso | Segurança · Proposto | Implementado (14/11/2026) | Novo na v0.3. 10 chamados por 5 min por token (express-rate-limit); 429 com code TOO_MANY_REQUESTS (TOO_MANY_CALLS não será usado); sem limite por mesa | ``
| RNF07 | RNF06 | Docker Compose: ambiente sobe com um comando, igual em dev e produção | Infra · Definido | Implementado (dev) | `docker compose up` na raiz sobe PostgreSQL 16, API (4000), front (3000) e o painel de desenvolvimento, sem `.env`. Imagem de produção/Dockerfile ainda não existe (capítulo 9) |
| RNF08 | RNF08 | Cliente anônimo: nenhum dado pessoal do cliente é coletado | LGPD · Definido | Especificado | A v0.2 diz "nenhum dado pessoal obrigatório". Por desenho, o modelo não tem campo pessoal de cliente; o token do aparelho é aleatório |   

## 2.4 Regras de negócio (RN)  
| ID v0.3 | ID v0.2 | Descrição | Perfil/Origem | Status | Observação |
|---|---|---|---|---|---|  
| RN01 | RN01 | Cada restaurante só acessa os próprios dados | Definido | Implementado | Igual nas duas versões. Ver RNF01 e seção 2.6.1 |
| RN02 | — | Cada mesa tem um código público único, usado no QR Code e no NFC | Definido | Implementado | `public_code` de 12 caracteres (DEC-04), alfabeto sem caracteres ambíguos, gerado com `crypto.randomInt`; índice único. Ver seção 2.6.2 |
| RN03 | — | Chamado tem dois tipos: Garçom e Conta | Definido | Implementado | Enum `type_call` com WAITER e BILL |
| RN04 | RN09 | O atendimento da mesa começa no primeiro scan; vários clientes participam do mesmo atendimento | Definido | Implementado | DEC-01: o primeiro scan abre o atendimento e o balcão também pode abri-lo. O índice parcial `table_sessions_one_active` garante no máximo um ativo por mesa; o segundo da corrida vira 409 |
| RN05 | — | Cada aparelho recebe o próprio token, ligado ao atendimento ativo da mesa | Definido | Implementado | Cada scan cria um token novo em `session_tokens` (hash SHA-256) |
| RN06 | RN03 | Todo chamado aberto aparece como card na tela do balcão, por ordem de chegada | Definido | Implementado | `GET /calls` em ordem de chegada e evento `call:created`; a tela `/admin/waiter` mostra os cards |
| RN07 | — | O garçom finaliza o chamado no balcão depois de atender; o card sai da tela | Definido | Implementado | Ver RF09 |
| RN08 | — | Cada novo chamado gera um novo card | Definido | Superada por DEC-03 (14/11/2026) | Resolvido pela DEC-03: um card por tipo e sessão, não por chamado (DV-02) |
| RN09 | — | Encerrar o atendimento revoga todos os tokens da mesa; aparelhos revogados não criam chamados | Definido | Implementado | Token revogado ou de sessão encerrada: 401 do `ensureTableToken` (mensagem única); o front faz um novo scan |
| RN10 | RN10 | O atendimento expira em 4 h, exceto se estendido | Definido | Implementado | Duração por `TABLE_SESSION_TTL` (padrão 14400 s); estender acrescenta o mesmo tempo (DEC-02, DEC-09) |
| RN11 | — | Ao encerrar ou expirar, os chamados abertos da mesa são cancelados e saem da tela | Proposto | Implementado | Na mesma transação do encerramento (`cancelOpenBySession`); o `session:closed` faz o balcão limpar os cards da sessão (DV-04) |
| RN12 | RN14 | Chamado repetido da mesma mesa e tipo: novo card ou agrupar no existente | v0.3: A validar / v0.2: A validar | Implementado (14/11/2026, DEC-03) | Agrupa: um OPEN por tipo e sessão; repetir devolve o existente (200), garantido pelo índice `calls_one_open_per_type` e por uma transação que trava a sessão (`FOR SHARE`). Sem 409 (DV-02) |
| — | RN02 | Toda mesa pertence a um setor | Definido (v0.2) | Não implementado | Removida; o código liga a mesa direto ao restaurante (tables.restaurant_id), sem setor | 
| — | RN04 | Chamado é assumido por um único garçom: o primeiro que aceitar | Definido (v0.2) | Não implementado | Removida; na v0.3 não há aceite. A concorrência permanece relevante em "finalizar" (guia: update condicional por estado OPEN) | 
| — | RN05 | Cliente não lança itens; só o garçom lança na comanda | Definido (v0.2) | Não implementado | Removida (sem comanda no MVP) | 
| — | RN06 | Pedido enviado aparece no KDS com status RECEIVED | Definido (v0.2) | Não implementado | Removida (sem KDS no MVP) | 
| — | RN07 | Avaliação disponível a qualquer momento da sessão; convite ao fechar a comanda; cada cliente pode avaliar | Definido (v0.2) | Não implementado | Removida (futuro, v0.3 RF16) | 
| — | RN08 | Cardápio é público por mesa: não cria, não altera e não encerra sessão | Definido (v0.2) | Não implementado | Removida (sem cardápio no MVP) | 
| — | RN11 | Quem encerra a sessão é o garçom, quando os clientes vão embora | Definido (v0.2) | Não implementado | Mantida como requisito v0.3 RF10 (balcão encerra), não como regra | 
| — | RN12 | A comanda pertence à mesa: encerrar a sessão não apaga consumo nem pedidos | Proposto (v0.2) | Não implementado | Removida (sem comanda) | 
| — | RN13 | Uma mesa tem no máximo uma comanda aberta | A validar (v0.2) | Não implementado | Removida |   

## 2.5 Reconciliação v0.2 versus v0.3 

A correspondência entre os requisitos das duas versões (mantido, simplificado, adiado, promovido, removido ou novo) está embutida nas tabelas 2.2 a 2.4, nas colunas de ID e em Observação. As seis decisões adotadas para tratar as divergências são: 
 
- O escopo vigente é o da v0.3; a v0.2 é tratada como visão de longo prazo (itens futuros). 
- Papéis: [Implementado, 12/11/2026] SUPER_ADMIN, OWNER (substitui ADMIN) e STAFF (DV-48). WAITER e KITCHEN da v0.2 ficam como papéis hipotéticos de fases futuras. 
- Token da mesa: por aparelho, enviado no cabeçalho `X-Table-Token` (v0.3); o token único por sessão e o cabeçalho `X-Table-Session` da v0.2 são descartados. O documento de módulos usa `x-table-token` (mesmo cabeçalho, caixa baixa) e sugere rotas `/me/calls` e `/public/tables/:code/join` em vez de `/public/calls` e `/public/tables/:code/token`; as rotas normativas são as da v0.3 (ver capítulo 8). 
- Estados do chamado: OPEN, DONE, CANCELLED (v0.3 e código). ACCEPTED e EXPIRED da v0.2 não existem. 
- Hash de senha: scrypt (comportamento atual do código), em vez de argon2/bcrypt (v0.2). A v0.3 não fixa algoritmo. 
- Quando o atendimento realmente abre: resolvido na DEC-01 (13/11/2026). O primeiro scan do QR abre o atendimento e o balcão também pode abrir e encerrar. 

## 2.6 Regras de negócio em detalhe 

### 2.6.1 Isolamento entre restaurantes (RN01, RNF01) 

O sistema usa um único banco e um único conjunto de tabelas, distinguindo restaurantes pela coluna `restaurant_id` (decisão de "tenant por coluna", marcada Proposto, preferida a banco ou schema por cliente por ser mais simples). Consequência: o banco não impede uma leitura cruzada; quem impede é o filtro em cada consulta. O padrão prescrito é: o `restaurantId` vem sempre do token JWT, nunca do corpo da requisição; o controller o entrega ao service, que o repassa ao repository como primeiro parâmetro; e recurso de outro restaurante responde 404, nunca 403, para não confirmar a existência do recurso. Casos especiais sem tenant no token: o login (busca por e-mail, único globalmente), a rota pública da mesa (o tenant é descoberto pela própria mesa) e o job de expiração, que varre todos os restaurantes. 

[Implementado] os filtros nos repositórios, a propagação de `restaurantId` e `role` ao objeto de requisição (`req.user`, que `ensureAuthenticated` monta consultando o banco, com cache em memória de 30 s) e o `tenantOf`, que recusa token sem restaurante. Efeito do e-mail único global: a mesma pessoa não pode ser funcionária de dois restaurantes. 

### 2.6.2 Mesa e código público (RN02) 

Cada mesa é permanente (não é aberta nem fechada pelo cliente), pertence a um restaurante, tem um rótulo (por exemplo, "Mesa 12"), um `public_code` único de 12 caracteres e um indicador `active`. O código é gravado na plaquinha (QR e NFC) e compõe a URL `<PUBLIC_APP_URL>/m/[code]` (DEC-05). É gerado por fonte criptograficamente segura, nunca sequencial. Nomes repetidos no mesmo restaurante são permitidos. Mesas com histórico são desativadas, não apagadas (excluir dá 409 "desative em vez de excluir"); sem histórico, a exclusão é definitiva. Desativar a mesa encerra o atendimento ativo dela; gerar o QR de mesa inativa a reativa. Mesa inexistente, inativa ou de outro restaurante responde 404 no scan. 

### 2.6.3 Atendimento da mesa, token por aparelho e ciclo de vida (RN04, RN05, RN09, RN10) 

O atendimento (sessão, tabela `table_sessions`) representa o período em que uma mesa está ocupada. Há no máximo um atendimento ativo por mesa, garantido por um índice único parcial no banco (por mesa, onde o status é ACTIVE) [Implementado, na migration inicial]. Vários clientes (aparelhos) participam do mesmo atendimento, cada um com seu token aleatório. O token é entregue em texto apenas uma vez ao aparelho e fica no banco só como hash; assim, encerrar o atendimento revoga todos os tokens de uma vez (preenchendo `revoked_at`). 

Fluxo do scan (`POST /public/tables/:code/scan`): se a mesa tem atendimento ativo (e dentro do prazo), cria-se um token novo para este aparelho nesse atendimento; senão, abre-se um atendimento de 4 h e emite-se o token. A resposta traz o token (só nesta vez), `expires_at` e dados da mesa. O atendimento termina por dois caminhos: encerramento no balcão (`closed_reason` STAFF, `closed_by` preenchido) ou expiração (`closed_reason` TIMEOUT). A duração é de 4 h (`TABLE_SESSION_TTL`, 14400 s); estender (DEC-09) acrescenta o mesmo tempo. A expiração tem duas camadas: no momento do uso e um job de 60 s que fecha de fato (estado, tokens e chamados). Desativar mesa ou restaurante também encerra os atendimentos ativos (revisão geral de 14/11/2026).

Resolvido: o fluxo do documento de módulos e do guia (garçom "abre a mesa", 403 "Mesa fechada", 3 h) foi superado pela DEC-01 e pela DEC-02 (primeiro scan abre; 4 h). Um novo scan depois do encerramento abre um atendimento novo na hora (DEC-07). 

### 2.6.4 Chamados (RN03, RN06, RN07, RN08, RN12) 

Um chamado tem tipo (WAITER ou BILL) e estado (OPEN, DONE, CANCELLED), referencia o atendimento e o token (aparelho) que o criou, e registra criação, finalização e o usuário que finalizou (`done_by`, DEC-06). Ao ser criado, vira um card na tela do balcão (evento `call:created`), ordenado por chegada, com o cronômetro contado de `created_at`. O balcão finaliza o chamado depois de atender a mesa: o estado muda para DONE e o evento `call:done` remove o card. O cliente só recebe a confirmação de envio; não vê a finalização (DEC-08).

Concorrência: a finalização é uma atualização condicional ao estado OPEN (`markDone`); quem perde recebe 409 `CALL_NOT_OPEN`. A criação trava a sessão (`FOR SHARE`) numa transação, de modo que um encerramento simultâneo espera e cancela o chamado junto, sem deixar card órfão.

Repetição (DEC-03): no máximo um chamado OPEN por tipo em cada atendimento, garantido pelo índice parcial `calls_one_open_per_type`; tocar de novo devolve o existente (200) e não reinicia o `created_at`. Limite de abuso (RNF06): 10 chamados por 5 min por token, com 429 `TOO_MANY_REQUESTS`. 

### 2.6.5 Encerramento do atendimento (RF10, RN09, RN11) 

Ao encerrar, numa única transação: o atendimento passa a CLOSED, todos os tokens da mesa recebem `revoked_at` e os chamados abertos passam a CANCELLED. Só depois do commit é emitido `session:closed` para a sala do restaurante; o balcão remove os cards da mesa (não há evento `call:cancelled`). O cliente não usa tempo real: o aparelho com token revogado que tentar criar chamado recebe 401, limpa o token e faz um novo scan (que abre um atendimento novo, DEC-07). 

### 2.6.6 Autenticação da equipe (v0.2 RNF05) 

Owner e balcão usam login com e-mail (normalizado) e senha (mínimo 8, máximo 128), recebendo um JWT HS256 com o identificador do usuário (`sub`), o `restaurantId` e o papel; expira em `JWT_EXPIRES_IN` (padrão 15 min) e vem com um refresh token (30 dias, de uso único, só o hash no banco) que `POST /auth/refresh` troca por um par novo. A senha é guardada com scrypt, sal aleatório e comparação em tempo constante. O login responde com a mesma mensagem para e-mail inexistente e senha errada (compara contra um hash falso quando o usuário não existe) e bloqueia usuário ou restaurante inativo. Limites de tentativa: 10 por 15 min por IP+e-mail e 30 por 15 min só por IP; register 5 por hora por IP. `ensureAuthenticated` consulta o banco (com cache de 30 s, invalidado ao editar ou remover usuário), então desativar ou rebaixar um usuário vale logo. [Implementado]. Lacunas: sem recuperação de senha. Reusar um refresh token já trocado encerra todas as sessões do usuário; `POST /auth/logout` revoga o refresh token e `GET /auth/me` devolve o usuário logado. 

### 2.6.7 Cadastro de restaurante (RF01) 

[Implementado] `POST /auth/register` cria, na mesma transação (`runInTransaction`), o restaurante e o usuário OWNER vinculado a ele (fluxo B, DEC-14); o `slug` sai do nome, com sufixo aleatório em colisão; a senha é hasheada fora da transação. A resposta é `{ user, restaurant }`. O SUPER_ADMIN é criado por seed (`npm run db:seed:super-admin`, com `SUPER_ADMIN_EMAIL` e `SUPER_ADMIN_PASSWORD` de 12+ caracteres). 

## 2.7 Pontos em aberto "A validar" 

Lista unificada das duas versões; a origem v0.2 está indicada quando o ponto já existia lá. 

### 2.7.1 Vigentes (v0.3): todos decididos em 13–14/11/2026

- Alerta sonoro no balcão quando chega um card: **sim** (DEC-10); o back-end só emite `call:created` e o front toca o som, com chave para desligar.
- Registrar qual garçom finalizou o chamado: **sim**, login individual por STAFF; `done_by` recebe o id do token (DEC-06).
- Vários clientes da mesma mesa chamando: **um card por tipo e sessão** (DEC-03); repetir devolve o chamado aberto.
- Novo scan depois de encerrar: **abre um atendimento novo na hora** (DEC-07).
- O cliente vê se o chamado foi finalizado: **não**, só a confirmação de envio (DEC-08).
- "Manter aberto": **só no balcão**, é a ação de estender (+4 h) (DEC-09).
- Nome definitivo do produto e cobrança dos restaurantes (planos): **em aberto**, fica para depois do MVP. 

### 2.7.2 Somente da v0.2 (superados ou transferidos, fora do MVP) 
 
- Separar pedidos do KDS por estação (bar, cozinha, sobremesa)? 
- Registrar pagamento no sistema ou só marcar a conta como fechada? 
- Garçom é avisado quando o pedido fica pronto? 
- Uma mesa só pode ter uma comanda aberta? 
- Métricas dos relatórios.
