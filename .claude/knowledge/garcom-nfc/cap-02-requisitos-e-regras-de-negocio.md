# 2. Requisitos e regras de negócio 

## 2.1 Convenções das tabelas 

As três tabelas seguintes (RF, RNF e RN) reproduzem integralmente os requisitos das duas versões: cada linha é um requisito, com o identificador da v0.3 e o da v0.2 lado a lado ("—" quando só existe em uma das versões). Os identificadores se repetem entre versões com significados diferentes (por exemplo, RF05 é "Gerir cardápio" na v0.2 e "Chamar garçom" na v0.3); por isso, fora destas tabelas, todo identificador vem com a versão (por exemplo, "v0.3 RF05"). As linhas seguem a ordem da v0.3; os itens que só existem na v0.2 vêm ao final de cada tabela. 

A coluna "Perfil/Origem" traz o perfil (ou a categoria, nos RNF) e a situação na própria fonte (Definido, Proposto, A validar, Futuro), na forma "perfil · v0.3: situação / v0.2: situação" quando diferem. A coluna "Status" traz a situação deste documento: **Especificado** (só nos documentos), **Implementado** (no código), **Não implementado** (previsto e ausente); quando parcial, "Implementado (parcial)" e a observação diz o que falta. Requisitos futuros da v0.3 aparecem como "Não implementado". Quando a descrição difere entre as versões, a descrição da coluna é a da v0.3 e a diferença está em Observação. 

## 2.2 Requisitos funcionais (RF)  
| ID v0.3 | ID v0.2 | Descrição | Perfil/Origem | Status | Observação |
|---|---|---|---|---|---|  ``````
| RF01 | RF01 | Autocadastro do restaurante; quem cadastra vira Admin | Admin · Definido | Implementado (parcial) | Igual nas duas versões. POST /auth/register existe e cria usuário ADMIN, mas não cria restaurante (restaurant_id nulo; há TODO no service). O token JWT sairá com restaurantId nulo. Ver seção 2.6.7 e DV-15 | ````
| RF02 | RF04 | Cadastrar mesas e gerar o QR Code de cada mesa | Admin · Definido | Não implementado | v0.2 "Gerir mesas e gerar link/QR Code", sem vínculo de mesa a setor na v0.3. Existe o repositório de mesas e o campo public_code único; tables.service.ts é esqueleto, controller e schemas estão vazios; sem rota e sem geração de QR Code | ``
| RF03 | RF02 | Criar o acesso da tela do balcão | Admin · Definido | Não implementado | Simplificado: a v0.2 era "Gerir equipe (garçons e cozinha) e acessos". Rota prevista POST /staff; repositório de usuários existe, mas há um TODO sobre criar outros usuários além do ADMIN | ``````
| RF04 | RF06 | Abrir a tela principal da mesa pelo QR Code ou NFC, sem login | Cliente · Definido | Não implementado | Na v0.2 a página incluía o cardápio e tinha acessos ilimitados sem sessão; na v0.3 é sem cardápio. Rotas previstas GET /public/tables/:code e front /m/[code]; findByPublicCode existe no repositório | 
| RF05 | RF08 | Chamar garçom | Cliente · Definido | Não implementado | Mantido. Só repositório de chamados; sem service, rota ou token de mesa | ``
| RF06 | RF09 | Pedir o fechamento da conta | Cliente · Definido | Não implementado | Mantido (v0.2 "Pedir a conta"). Tipo BILL existe no enum type_call | 
| RF07 | — | Ver a confirmação de que o chamado foi enviado | Cliente · Proposto | Especificado | Novo na v0.3. Já aparece na tela da mesa e no fluxo (resposta 201), apesar de "Proposto". Ver DV-06 | ``
| RF08 | RF12 (parte) | Ver os chamados abertos como cards, em tempo real | Balcão · Definido | Não implementado | A v0.2 RF12 (garçom) "Receber chamados do setor em tempo real; aceitar e concluir" se divide em v0.3 RF08 e RF09, agora no balcão e sem aceite. Sem Socket.IO; GET /calls?status=OPEN não existe, embora o repositório liste por ordem de chegada | ````
| RF09 | RF12 (parte) | Finalizar o chamado depois do atendimento; o card sai da tela | Balcão · Definido | Não implementado | Sem aceite; só finalizar no balcão. Falta o método condicional de finalização (markDone) e a rota PATCH /calls/:id/done | ````````
| RF10 | RF15 | Encerrar o atendimento da mesa, revogando todos os tokens | Balcão · Definido (v0.2: Garçom, "quando os clientes saírem") | Não implementado | Mantido; passa a revogar tokens (ver v0.2 RN11 na tabela 2.4). Blocos de repositório existem (revokeAllBySession, cancelOpenBySession, update da sessão); falta o service transacional e a rota POST /sessions/:id/close | ````
| RF11 | RF16 | Manter o atendimento aberto além de 4 h | Balcão · Definido (v0.2: Garçom) | Não implementado | Mantido (v0.2 "Marcar sessão como manter aberta"). Coluna keep_open existe; falta PATCH /sessions/:id. Quem pode ativar (só balcão ou também cliente) é ponto a validar 6 | ````
| RF12 | — | Expirar o atendimento após 4 h quando não estiver mantido aberto | Sistema · Definido | Não implementado | Novo como requisito na v0.3 (na v0.2 existia só como regra v0.2 RN10). findExpired existe no repositório; job inexistente (sem pasta jobs) | 
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
| RNF01 | RNF01 | Isolamento por restaurante: toda consulta filtrada por restaurant_id | Segurança · Definido | Implementado (parcial) | A v0.2 acrescenta que o valor vem do token (JWT), o que ainda não é propagado ao req. Os repositórios de usuários, mesas, sessões e chamados recebem restaurantId e o aplicam nas consultas (exceções legítimas: findByEmail no login, findByPublicCode na rota pública, findExpired no job). Falta o middleware de tenant e a propagação de restaurantId à requisição; o JWT pode vir com restaurantId nulo | 
| RNF02 | RNF02 | Card em até 2 s entre o toque do cliente e a tela do balcão | Tempo real · v0.3: "Meta proposta" / v0.2: "Meta a validar" | Não implementado | A v0.2 diz "Chamado em até 2 s; entrega por WebSocket com reconexão automática". Sem Socket.IO | 
| RNF03 | RNF07 | Balcão sempre ligado; reconecta sozinho e recarrega os cards abertos após queda de rede | Operação · Definido | Não implementado | A v0.2 RNF07 falava do KDS (tela da cozinha recupera a fila sozinha ao reconectar); na v0.3 o equivalente é o balcão. Padrão recomendado pelo guia: estado inicial por REST mais eventos; recarregar no evento de conexão | 
| RNF04 | RNF03, RNF04 | Mesa em um toque: tela do cliente leve, mobile-first, sem app e sem login | UX · Definido | Não implementado | Une dois requisitos da v0.2: RNF03 "Mobile-first (telas de cliente e garçom pensadas para celular)" e RNF04 "Sem instalação: cliente usa o navegador, sem app e sem login". Na v0.3 o mobile-first vale só para o cliente (o balcão é computador). Depende do front-end (inexistente) | ``````
| RNF05 | RNF05 | Tokens revogáveis: token aleatório por aparelho, salvo só como hash no banco | Segurança · Definido | Implementado (parcial) | A v0.2 RNF05 ("Segurança / Autenticação") dizia "JWT para a equipe; senha com hash (argon2 ou bcrypt); token de sessão para a mesa"; a v0.3 lista só o token do aparelho (JWT e hash de senha deixam de ser RNF, mas continuam valendo; ver seção 2.6.6). JWT e hash estão implementados, mas o hash é scrypt (DV-22). Do token da mesa: coluna token_hash única e revoked_at existem; falta o código que gera e valida (nenhum token.ts) | ``
| RNF06 | — | Limite de chamados por token e por mesa, contra abuso | Segurança · Proposto | Não implementado | Novo na v0.3. BE-07 já o planeja; erro 429 TOO_MANY_CALLS proposto; sem biblioteca de rate limit | ``
| RNF07 | RNF06 | Docker Compose: ambiente sobe com um comando, igual em dev e produção | Infra · Definido | Não implementado | Igual nas duas versões. Sem compose, Dockerfile ou .env.example no repositório do back-end | 
| RNF08 | RNF08 | Cliente anônimo: nenhum dado pessoal do cliente é coletado | LGPD · Definido | Especificado | A v0.2 diz "nenhum dado pessoal obrigatório". Por desenho, o modelo não tem campo pessoal de cliente; o token do aparelho é aleatório |   

## 2.4 Regras de negócio (RN)  
| ID v0.3 | ID v0.2 | Descrição | Perfil/Origem | Status | Observação |
|---|---|---|---|---|---|  
| RN01 | RN01 | Cada restaurante só acessa os próprios dados | Definido | Implementado (parcial) | Igual nas duas versões. Ver RNF01 e seção 2.6.1 | ``
| RN02 | — | Cada mesa tem um código público único, usado no QR Code e no NFC | Definido | Implementado (parcial) | Nova na v0.3. Coluna public_code com índice único existe; falta gerar o código (o guia propõe 6 bytes aleatórios em base64url, 8 caracteres; o documento de módulos propõe 9 bytes, 12 caracteres). Ver seção 2.6.2 | ``
| RN03 | — | Chamado tem dois tipos: Garçom e Conta | Definido | Implementado | Nova na v0.3. Enum type_call com WAITER e BILL no schema | ``
| RN04 | RN09 | O atendimento da mesa começa no primeiro chamado; vários clientes participam do mesmo atendimento | Definido | Implementado (parcial) | A v0.2 RN09 diz "Cada mesa tem no máximo uma sessão ativa, compartilhada por todos os clientes", mantida aqui. O índice parcial table_sessions_one_active garante no máximo um atendimento ativo por mesa; a abertura do atendimento não está codificada. Momento exato da abertura é divergente (DV-01) | ``
| RN05 | — | Cada aparelho recebe o próprio token, ligado ao atendimento ativo da mesa | Definido | Implementado (parcial) | Nova na v0.3 (absorve o v0.2 RF07). Tabela session_tokens existe; emissão não | ``
| RN06 | RN03 | Todo chamado aberto aparece como card na tela do balcão, por ordem de chegada | Definido | Não implementado | Substitui a v0.2 RN03 ("Chamado vai só aos garçons vinculados ao setor da mesa"); na v0.3 todo card vai ao balcão. O repositório lista por created_at crescente; sem rota e sem tempo real | 
| RN07 | — | O garçom finaliza o chamado no balcão depois de atender; o card sai da tela | Definido | Não implementado | Nova na v0.3. Ver RF09 | 
| RN08 | — | Cada novo chamado gera um novo card | Definido | Não implementado | Nova na v0.3. Em conflito direto com v0.3 RN12 (que reaparece da v0.2 RN14) e com o ponto a validar 3 (DV-02) | ``
| RN09 | — | Encerrar o atendimento revoga todos os tokens da mesa; aparelhos revogados não criam chamados | Definido | Não implementado | Nova na v0.3. Blocos de repositório prontos; resposta prevista 401 TOKEN_REVOKED | ``````````
| RN10 | RN10 | O atendimento expira em 4 h, exceto se marcado como "manter aberto" | Definido | Implementado (parcial) | Igual nas duas versões. Campos expires_at e keep_open e a consulta findExpired (ignora keep_open) existem; job e lógica de expiração ausentes. A duração é variável TABLE_SESSION_TTL (14400 s) | ``
| RN11 | — | Ao encerrar ou expirar, os chamados abertos da mesa são cancelados e saem da tela | Proposto | Implementado (parcial) | Nova na v0.3; tratada como certa nos fluxos (DV-04). cancelOpenBySession existe no repositório | 
| RN12 | RN14 | Chamado repetido da mesma mesa e tipo: novo card ou agrupar no existente | v0.3: A validar / v0.2: A validar ("Não abrir novo chamado do mesmo tipo se já existir um aberto na mesa") | Especificado | Reaparece da v0.2 RN14, contrariando v0.3 RN08. Decisão em aberto. O documento de módulos propõe recusar com 409 se já houver chamado aberto do mesmo tipo (DV-02) | ``
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
- Papéis: [Implementado] ADMIN e STAFF (v0.3 e código). [Especificado, 12/11/2026, não implementado] SUPER_ADMIN, OWNER (substitui ADMIN) e STAFF (DV-48); RF01 (autocadastro) fica com destino pendente. WAITER e KITCHEN da v0.2 ficam como papéis hipotéticos de fases futuras. 
- Token da mesa: por aparelho, enviado no cabeçalho `X-Table-Token` (v0.3); o token único por sessão e o cabeçalho `X-Table-Session` da v0.2 são descartados. O documento de módulos usa `x-table-token` (mesmo cabeçalho, caixa baixa) e sugere rotas `/me/calls` e `/public/tables/:code/join` em vez de `/public/calls` e `/public/tables/:code/token`; as rotas normativas são as da v0.3 (ver capítulo 8). 
- Estados do chamado: OPEN, DONE, CANCELLED (v0.3 e código). ACCEPTED e EXPIRED da v0.2 não existem. 
- Hash de senha: scrypt (comportamento atual do código), em vez de argon2/bcrypt (v0.2). A v0.3 não fixa algoritmo. 
- Quando o atendimento realmente abre (primeiro chamado versus entrada na página): em aberto (DV-01); a API especificada na v0.3 abre o atendimento ao emitir o primeiro token.  

## 2.6 Regras de negócio em detalhe 

### 2.6.1 Isolamento entre restaurantes (RN01, RNF01) 

O sistema usa um único banco e um único conjunto de tabelas, distinguindo restaurantes pela coluna `restaurant_id` (decisão de "tenant por coluna", marcada Proposto, preferida a banco ou schema por cliente por ser mais simples). Consequência: o banco não impede uma leitura cruzada; quem impede é o filtro em cada consulta. O padrão prescrito é: o `restaurantId` vem sempre do token JWT, nunca do corpo da requisição; o controller o entrega ao service, que o repassa ao repository como primeiro parâmetro; e recurso de outro restaurante responde 404, nunca 403, para não confirmar a existência do recurso. Casos especiais sem tenant no token: o login (busca por e-mail, único globalmente), a rota pública da mesa (o tenant é descoberto pela própria mesa) e o job de expiração, que varre todos os restaurantes. 

[Implementado] os filtros nos repositórios. [Não implementado] a propagação de `restaurantId` e `role` ao objeto de requisição (o `ensureAuthenticated` só grava `req.id`) e o middleware de tenant. Risco conhecido: como o registro cria usuários sem restaurante, o JWT pode conter `restaurantId` nulo, o que invalidaria o isolamento se usado. Efeito do e-mail único global: a mesma pessoa não pode ser funcionária de dois restaurantes. 

### 2.6.2 Mesa e código público (RN02) 

Cada mesa é permanente (não é aberta nem fechada pelo cliente), pertence a um restaurante, tem um rótulo (por exemplo, "Mesa 12"), um `public_code` único e um indicador `active`. O código é gravado na plaquinha (QR e NFC) e compõe a URL `/m/[code]`. Deve ser gerado por fonte criptograficamente segura e nunca sequencial, para evitar enumeração de mesas. Mesas são desativadas, não apagadas, porque sessões e chamados têm chave estrangeira para elas. Uma mesa inexistente ou inativa responde 404 `TABLE_NOT_FOUND`. Regras propostas no documento de módulos (não especificadas na v0.3): não desativar mesa com atendimento ativo (409), e possibilidade de regenerar o código (a plaquinha antiga deixa de funcionar). Requer validação. 

### 2.6.3 Atendimento da mesa, token por aparelho e ciclo de vida (RN04, RN05, RN09, RN10) 

O atendimento (sessão, tabela `table_sessions`) representa o período em que uma mesa está ocupada. Há no máximo um atendimento ativo por mesa, garantido por um índice único parcial no banco (por mesa, onde o status é ACTIVE) [Implementado, na migration inicial]. Vários clientes (aparelhos) participam do mesmo atendimento, cada um com seu token aleatório. O token é entregue em texto apenas uma vez ao aparelho e fica no banco só como hash; assim, encerrar o atendimento revoga todos os tokens de uma vez (preenchendo `revoked_at`). 

Fluxo de decisão do token (v0.3): se o aparelho já tem token válido, cria-se o chamado; senão, se a mesa tem atendimento ativo, emite-se um novo token nesse atendimento; senão, abre-se um atendimento de 4 h e emite-se o token. O atendimento termina por dois caminhos: encerramento no balcão (`closed_reason` STAFF, `closed_by` preenchido) ou expiração (`closed_reason` TIMEOUT). A duração é de 4 h (variável `TABLE_SESSION_TTL`, 14400 s), exceto se "manter aberto" estiver ativo, caso em que só o balcão pode encerrar. A expiração tem duas camadas segundo o guia: verificação a cada requisição do cliente (segurança mesmo que o job falhe) e um job a cada minuto que fecha de fato (estado, tokens e chamados). 

Ponto de atenção: o documento de módulos e o guia descrevem um fluxo diferente do da v0.3, com o garçom "abrindo a mesa" e o cliente só podendo entrar se a mesa estiver aberta (resposta 403 "Mesa fechada"), e com duração de 3 h em vez de 4 h. O README do back-end descreve o mesmo fluxo com abertura pelo garçom. Pela precedência adotada, vale a v0.3 (abertura pelo primeiro acesso), mas a divergência exige decisão (DV-01). 

### 2.6.4 Chamados (RN03, RN06, RN07, RN08, RN12) 

Um chamado tem tipo (WAITER ou BILL) e estado (OPEN, DONE, CANCELLED), referencia o atendimento e o token (aparelho) que o criou, e registra criação, finalização e o usuário que finalizou. Ao ser criado, vira um card na tela do balcão (evento `call.created`), ordenado por chegada. O balcão finaliza o chamado depois de atender a mesa: o estado muda para DONE, o evento `call.done` remove o card. O cliente recebe a confirmação de envio (RF07); se ele ainda verá a finalização é o ponto a validar 5. 

Concorrência: como mais de um garçom pode tentar finalizar o mesmo card, a atualização deve ser condicional ao estado OPEN (atualização com filtro por estado e contagem de linhas afetadas); quem perde recebe 409. Isso já é prescrito no guia e no documento de módulos; hoje o repositório não oferece esse método. 

Repetição: v0.3 RN08 diz que cada novo chamado gera um novo card; v0.3 RN12 e o ponto a validar 3 perguntam se chamados repetidos da mesma mesa e tipo geram novo card ou se agrupam. O documento de módulos propõe um terceiro caminho, recusar o segundo chamado enquanto houver um aberto do mesmo tipo (409 "Você já chamou") com índice único parcial em (sessão, tipo) onde o estado é OPEN, permitindo coexistir Garçom e Conta. Nenhuma das três opções está decidida. Em paralelo, o limite de abuso (RNF06, 429 `TOO_MANY_CALLS`) por token e por mesa é proposto. 

### 2.6.5 Encerramento do atendimento (RF10, RN09, RN11) 

Ao encerrar, numa única transação: o atendimento passa a CLOSED, todos os tokens da mesa recebem `revoked_at` e os chamados abertos passam a CANCELLED. Só depois do commit os eventos são emitidos: `session.closed` para as salas do balcão e da sessão, remoção dos cards da mesa e mensagem "Atendimento encerrado" nos aparelhos. Um aparelho com token revogado que tentar criar chamado recebe 401 `TOKEN_REVOKED`, mesmo código para token expirado (não há código separado para expiração). Mesa encerrada: os botões da tela do cliente ficam bloqueados. Um novo escaneamento depois do encerramento abre novo atendimento? O fluxo do token sugere que sim, mas o ponto a validar 4 permanece listado como em aberto. 

### 2.6.6 Autenticação da equipe (v0.2 RNF05) 

Admin e balcão usam login com e-mail e senha, recebendo um JWT com o identificador do usuário (`sub`), o `restaurantId` e o papel; expira em `JWT_EXPIRES_IN` (padrão 1 dia). A senha é guardada com scrypt, sal aleatório e comparação em tempo constante. O login responde com a mesma mensagem para e-mail inexistente e senha errada (evita revelar quais e-mails existem). [Implementado]. Lacunas conhecidas: não há tamanho mínimo de senha; o token de um usuário apagado ou rebaixado permanece válido até expirar; não há limite de tentativas de login; não há middleware de papel (`ensureRole`), logo hoje nenhuma rota é restrita a ADMIN ou STAFF. 

### 2.6.7 Cadastro de restaurante (RF01) 

A regra especificada é: `POST /auth/register` cria, na mesma transação, o restaurante e o usuário ADMIN vinculado a ele (o guia propõe criar o `slug` a partir do nome e tratar colisões com sufixo aleatório; hash da senha fora da transação). [Implementado] apenas o usuário ADMIN. [Não implementado] criação do restaurante, slug, transação e campo de nome do restaurante no schema de entrada. 

## 2.7 Pontos em aberto "A validar" 

Lista unificada das duas versões; a origem v0.2 está indicada quando o ponto já existia lá. 

### 2.7.1 Vigentes (v0.3) 
 
- Tocar um alerta sonoro no balcão quando chega um card? 
- Registrar qual garçom finalizou o chamado, ou basta um acesso único do balcão? 
- Vários clientes da mesma mesa chamando: um card por chamado ou um card por mesa e tipo? (Na v0.2: bloquear novo chamado se já houver um aberto na mesa; reaparece como v0.3 RN12.) 
- Depois de encerrar o atendimento, um novo scan na mesa abre um atendimento novo na hora? 
- O cliente vê se o chamado já foi finalizado, ou só a confirmação de envio? 
- "Manter aberto" fica só no balcão, ou o cliente também pode ativar? (Já era pergunta da v0.2: só o garçom ativa ou o cliente também?) 
- Nome definitivo do produto e cobrança dos restaurantes (planos). (Mantido da v0.2.)  

### 2.7.2 Somente da v0.2 (superados ou transferidos, fora do MVP) 
 
- Separar pedidos do KDS por estação (bar, cozinha, sobremesa)? 
- Registrar pagamento no sistema ou só marcar a conta como fechada? 
- Garçom é avisado quando o pedido fica pronto? 
- Uma mesa só pode ter uma comanda aberta? 
- Métricas dos relatórios.
