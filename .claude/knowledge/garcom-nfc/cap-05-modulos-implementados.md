# 5. Módulos implementados (auth e infraestrutura compartilhada) 

> **Atualização 14/11/2026 (o código manda).** Este capítulo foi reescrito sobre o código atual do núcleo da API: ponto de entrada, roteamento, módulo `auth`, middlewares, erros, utilitários e contêiner. Os módulos de domínio (users, administration, tables, sessions, calls) estão no capítulo 6; as rotas e o realtime, no capítulo 8.

Este capítulo descreve, com base na leitura direta do código em `back-end/src`, o núcleo da API: o ponto de entrada da aplicação, o roteamento, o módulo `auth` (cadastro e login) e a infraestrutura compartilhada em `shared/` (middlewares, erros, utilitários de senha e token, provedor do banco, contêiner de injeção de dependência e extensão de tipos do Express). Todas as afirmações deste capítulo estão marcadas implicitamente como **[Implementado]**, salvo rótulo explícito de **[Especificado]** (documentos v0.2, v0.3, guia) ou **[Planejado/Não implementado]**. Quando o comportamento do código difere da documentação, vale a precedência: código, depois v0.3, depois v0.2. As divergências estão no Apêndice A (identificadores DV-nn).
Arquivos de apoio que existem hoje: `users/users.service.ts`, `users.schema.ts` e `users.interfaces.ts` (regra, Zod e tipos de usuário), `users/staff.controller.ts` (rotas `/staff`), `users/public-user.ts` (resposta sem hash), `administration/*` (rotas `/admin`), `restaurants/slug.ts` (slug do restaurante) e a suíte `back-end/tests` (cerca de 100 testes).

Observação sobre escopo: o repositório tem `back-end/` e `front-end/`; a API usa Socket.IO e um job de expiração (ver capítulos 7 e 8); Docker Compose, `.env.example` e CI existem.

## 5.1 Inicialização e roteamento 

### 5.1.1 Arquivo `main.ts` (ponto de entrada) 

- Importa `reflect-metadata` como primeiro import. Isso é obrigatório porque a biblioteca de injeção de dependência (tsyringe) usa decorators que consultam essa camada de metadados no instante em que as classes são carregadas; se ela viesse depois, as classes decoradas falhariam ao serem avaliadas. 
- Importa `dotenv/config`, que lê o arquivo `.env` e preenche `process.env` antes de qualquer módulo que dependa das variáveis. 
- Importa o `app` de `server.ts`, o `SetupRoutes`, o container, o `errorHandler`, o Swagger e o job de expiração. 
- Executa a função `bootstrap`, em ordem fixa: (a) exige `PUBLIC_APP_URL` e, em produção, recusa `JWT_SECRET` com menos de 32 caracteres ou o padrão de desenvolvimento; (b) registra as dependências no contêiner; (c) fora de produção, publica `/docs`; (d) acopla o roteador em `/api/v1`; (e) acopla por último o `errorHandler` (o Express só entrega um erro a um tratador registrado depois do ponto onde o erro foi lançado); (f) cria o servidor HTTP com `createServer(app)`, anexa o Socket.IO (`Notifier.attach(httpServer, authenticateToken, allowedOrigins)`) e escuta em `PORT` (padrão 4000); (g) inicia o job de expiração (`startSessionExpiryJob`). 

**[Implementado, 14/11/2026].** O job de 60 s e o Socket.IO existem: ver capítulos 7 e 8. 

### 5.1.2 Arquivo `server.ts`

Cria a instância do Express e exporta `app` e `allowedOrigins`; **não abre porta** (a escuta é feita pelo `main.ts`, o que permite aos testes importar o `app` com supertest sem ocupar porta). Configura, nesta ordem: `helmet` (cabeçalhos de segurança, sem CSP; já remove o `x-powered-by`); `trust proxy` conforme `TRUST_PROXY` (número de proxies à frente da API; desligado por padrão; um valor errado deixa o IP do cliente forjável ou sempre igual ao do proxy); CORS pela lista de `FRONTEND_URL` (separada por vírgulas; sem ela nenhuma origem de navegador é liberada); e `express.json()`. (DV-36 resolvida: porta 4000 e prefixo `/api/v1`.)

### 5.1.3 Arquivo `routes.ts` 

Exporta `SetupRoutes`, que cria um roteador do Express, obtém os controllers do contêiner e registra as 27 rotas (montadas em `/api/v1`). Só `GET /health` e as rotas `/auth/*` e `/public/*` são públicas; as demais passam por `ensureAuthenticated` e `ensureRole`. Para os grupos de rotas, ver a tabela do capítulo 8 (8.2); aqui a ordem dos middlewares de duas rotas serve de exemplo: 
| Método e caminho | Middlewares na ordem | Handler | Resposta de sucesso |
|---|---|---|---|
| GET /health | nenhum | função anônima | 200 com `{ message: "API Healthy" }` |
| POST /auth/register | registerLimiter, validateSchema(createUserSchema) | authController.register | 201 com `{ user, restaurant }` |
| POST /auth/login | loginIpLimiter, loginLimiter, validateSchema(loginUserSchema) | authController.login | 200 com token e usuário público |
| POST /public/calls | ensureTableToken, callLimiter, validateSchema(createCallSchema) | callsController.create | 201 (criou) ou 200 (já havia aberto) |

A rota `/health` não é descrita em detalhe nos documentos, sendo um acréscimo do código. O prefixo `/api/v1` (DEC-11) é aplicado em `main.ts`.

## 5.2 Módulo `auth` 

O módulo `auth` cobre o autocadastro de um OWNER com o restaurante dele e o login de qualquer usuário (SUPER_ADMIN, OWNER ou STAFF). Os arquivos são `auth.schema.ts`, `auth.interfaces.ts`, `auth.service.ts` e `auth.controller.ts`; os repositories de usuário e de restaurante moram em `users` e `restaurants`.

### 5.2.1 Schemas de entrada (`auth.schema.ts`) 

Dois esquemas Zod (versão 4) definem o formato aceito no corpo da requisição: 
 
- `createUserSchema`: `name` (1 a 100 caracteres), `email` (e-mail válido, com remoção de espaços e minúsculas), `password` (8 a 128 caracteres) e `restaurantName` (1 a 100 caracteres). 
- `loginUserSchema`: `email` (normalizado como acima) e `password` (texto). 

Os tipos TypeScript de entrada são derivados dos esquemas. Intencionalmente o cliente não envia `role`, `restaurant_id` nem hash: o servidor decide. Como o `validateSchema` grava em `req.body` o resultado do Zod, campos extras e transformações (como a normalização do e-mail) valem para o controller. Mensagens de erro de campo ainda são as padrão do Zod (em inglês); `details` traz o campo e a mensagem. 

### 5.2.2 Interfaces e tipos (`auth.interfaces.ts`) 
 
- **PublicUser**: o tipo de usuário sem o hash da senha; é o que pode sair em respostas HTTP. 
- **RegisterResult**: `{ user, restaurant }`. 
- **LoginResult**: par token e usuário público. 
- **IAuthService**: contrato do service com `register` e `login`. 

A separação entre schema e interfaces existe porque o cliente envia `password` e o banco guarda `password_hash`. Os repositories de restaurante e de usuário NÃO vivem mais no `auth`: foram movidos para `modules/restaurants` e `modules/users` (ver 5.2.3), e o `CreateUserData` (o que o repository de usuário grava: nome, e-mail, hash da senha, papel e, opcionalmente, restaurante; produzido pelo service) acompanhou `IUserRepository`. O `auth` importa só os tipos e recebe os repositories pelo container. 

### 5.2.3 Repositories usados pelo módulo (`users/` e `restaurants/`) 

Desde a refatoração de 12/11/2026, `UserRepository` (`modules/users/users.repository.ts`, contrato em `users.repository.interface.ts`) e `RestaurantRepository` (`modules/restaurants/restaurants.repository.ts`, contrato em `restaurants.repository.interface.ts`) são módulos de dados próprios, para que `auth` e `administration` os consumam pelo container sem depender um do outro. O `auth.repository.ts` deixou de existir. 

O detalhamento método a método está na seção 6.4 (tabelas dos repositories). Em resumo: `RestaurantRepository` e `UserRepository` recebem o cliente de banco por injeção (nome "DbClient"), de modo que possam ser instanciados manualmente com um cliente de transação. `UserRepository.findByEmail` é a única busca de usuário sem filtro de restaurante (o login ainda não conhece o tenant; o e-mail é único globalmente). Todos os demais métodos de usuário exigem o identificador do restaurante. 

### 5.2.4 Fluxo de cadastro (`register`), passo a passo 

**Finalidade [Implementado].** Criar o restaurante e o OWNER dele a partir de nome, e-mail, senha e nome do restaurante (fluxo B, DEC-14). 
 
- **Requisição.** POST em `/auth/register` com `name`, `email`, `password` e `restaurantName`. O limiter de cadastro (5 por hora por IP) e o validador rodam antes. 
- **Validação.** `validateSchema(createUserSchema)`; falha lança `ValidationError` (400) com os campos com problema. 
- **Controller.** `AuthController.register` chama o service e responde 201 com `{ user, restaurant }`. Sem try/catch. 
- **Service, e-mail.** Se `findByEmail` encontra usuário, lança `ConflictError` com a mensagem genérica "Não foi possível concluir o cadastro" (409), sem confirmar que o e-mail existe. 
- **Service, slug e hash.** Gera o slug a partir do nome do restaurante (`slugify`); se já existe, acrescenta sufixo aleatório (`withRandomSuffix`). O hash scrypt da senha é calculado fora da transação. 
- **Transação.** `runInTransaction` cria o restaurante e o usuário com role OWNER, usando repositories criados sobre o `tx`; ou grava os dois ou nenhum. 
- **Saída.** Devolve o usuário público (sem hash) e o restaurante. 

_Figura: **Figura 5.1** – Passo a passo do cadastro (POST /auth/register). (Ver seção 5.2.4)_ 

**Cenários.**  
| Cenário | Causa | Resultado |
|---|---|---|  
| Sucesso | Corpo válido e e-mail livre | 201 com `{ user (OWNER), restaurant }` | 
| Corpo inválido | Campo ausente, tipo errado, senha curta ou e-mail malformado | 400 ValidationError "Dados inválidos" com a lista de campo e mensagem | 
| E-mail já cadastrado | Encontrado por findByEmail | 409 ConflictError "Não foi possível concluir o cadastro" | 
| Corrida entre dois cadastros | Ambos passam na checagem e o segundo insert viola a unicidade do e-mail | Erro Prisma P2002 convertido pelo tratador em 409 ConflictError | 
| Cadastros em excesso | Mais de 5 por hora do mesmo IP | 429 (limiter) | 
| Falha de banco ou outra falha | Qualquer exceção não prevista | 500 InternalServerError | 

**Efeitos.** Uma linha em `restaurants` e uma em `users`, na mesma transação. O OWNER nasce vinculado ao restaurante, de modo que o JWT sai com `restaurantId` preenchido (DV-15 resolvida). 

### 5.2.5 Fluxo de login (`login`), passo a passo 

**Finalidade [Implementado].** Autenticar SUPER_ADMIN, OWNER ou STAFF (todos usam o mesmo fluxo; a role vem do banco) e emitir um JWT. 
 
- **Limites, validação.** Dois limiters rodam antes: 30 tentativas por 15 min só por IP e 10 por 15 min por IP+e-mail (o limite só por IP existe porque variar o e-mail escaparia do segundo). Depois, `validateSchema(loginUserSchema)`; falha leva a 400. 
- **Controller.** `AuthController.login` chama `authService.login` e responde 200 com o resultado. 
- **Busca.** `userRepository.findByEmail` localiza o usuário pelo e-mail (sem tenant). 
- **Comparação de senha.** `comparePassword` recalcula o scrypt com o sal armazenado e compara em tempo constante. Se o usuário não existe, compara contra `DUMMY_PASSWORD_HASH`, de modo que o tempo de resposta não revela se o e-mail existe (DV-19 resolvida). 
- **Decisão.** Se o usuário não existe, a senha está errada, o usuário está desativado ou o restaurante dele está desativado, lança `UnauthorizedError` com a mesma mensagem "E-mail ou senha inválidos", para não revelar a causa. 
- **Emissão do token.** `signToken` assina um JWT HS256 com `sub` (id do usuário), `restaurantId` (nulo só para o SUPER_ADMIN) e `role`; validade lida de `JWT_EXPIRES_IN` (padrão 15 minutos); junto com ele o login entrega um refresh token (ver 5.2.7). 
- **Saída.** Devolve token e usuário público (sem hash).  

_Figura: **Figura 5.2** – Passo a passo do login (POST /auth/login). (Ver seção 5.2.5)_  
| Cenário | Resultado |
|---|---|  
| Credenciais corretas | 200 com token e usuário público | ``
| Corpo inválido | 400 ValidationError | ``
| E-mail inexistente | 401 UnauthorizedError "E-mail ou senha inválidos" | 
| Senha errada, usuário ou restaurante desativado | 401, mesma mensagem | 
| Tentativas em excesso | 429 (limiter) | 
| Hash armazenado em formato inesperado (sem separador) | comparação devolve falso, portanto 401 | ``
| JWT_SECRET ausente no ambiente | exceção comum ao assinar, resultando em 500 (erro de configuração) |   
**Ausências de segurança [Planejado/Não implementado].** Não há recuperação de senha. O JWT de acesso dura pouco e é renovado pelo refresh token (5.2.8); como `ensureAuthenticated` consulta o banco (com cache de 30 s), desativar ou excluir o usuário corta o acesso na hora (ver 5.3.2). 

### 5.2.6 Controller (`auth.controller.ts`) 

Classe injetável cuja dependência é o service, obtida pelo nome "AuthService" (o controller depende da interface, não da classe concreta). Os dois métodos são funções-seta (atributos de instância) para que o valor de `this` não se perca quando o Express os usa como callbacks nas rotas. Cada método tem três linhas: ler o corpo (convertido por afirmação de tipo, já validado pelo middleware), chamar o service e responder. Não há regra de negócio nem tratamento de exceções. 

### 5.2.7 Renovação do login (refresh token), logout e `/auth/me` 

**[Implementado, 14/11/2026]** O login (e cada renovação) devolve `{ token, refreshToken, user }`: `token` é o JWT de acesso (padrão 15 min, `JWT_EXPIRES_IN`) e `refreshToken` é um valor opaco de 32 bytes que vale 30 dias (`REFRESH_TOKEN_TTL_DAYS`); no banco (`refresh_tokens`) fica só o hash SHA-256. 
 
- **`POST /auth/refresh`** `{ refreshToken }`: se o token existe, não foi usado e não venceu, ele é revogado (atualização condicional, de modo que dois pedidos simultâneos não passam os dois) e o service confere o usuário e o restaurante no banco (desativados não renovam); devolve um par novo. Token desconhecido, vencido ou de usuário inativo dá 401 "Sessão expirada. Entre novamente". 
- **Rotação com detecção de reuso:** se chega um token que já foi trocado, todas as sessões do usuário são revogadas e a resposta é 401, porque o valor pode ter sido copiado. 
- **`POST /auth/logout`** `{ refreshToken }`: revoga o token e responde 204 (token desconhecido também dá 204). 
- **`GET /auth/me`** (JWT): devolve o usuário logado, lido do banco, sem o hash. 
- Limite de 60 renovações ou logouts por 15 min por IP (`refreshLimiter`). Os arquivos são `refresh-tokens.repository.ts` e `refresh-tokens.repository.interface.ts`, em `modules/auth`. Testes em `tests/auth.test.ts`. 
- **Front:** o `lib/api.ts` renova uma vez ao receber 401 com token do balcão e repete o pedido (pedidos simultâneos compartilham uma só renovação); o socket relê o token a cada conexão; sair chama `/auth/logout`. 

### 5.2.8 Tabela de códigos HTTP do módulo  
| Código | Quando | Origem |
|---|---|---|  ``
| 200 | Login bem-sucedido; /health | controller / rota | 
| 201 | Cadastro bem-sucedido | controller | 
| 400 | Corpo inválido | ValidationError do middleware | 
| 401 | Credenciais inválidas ou usuário/restaurante inativo | UnauthorizedError do service | 
| 409 | E-mail já cadastrado (checagem ou corrida via P2002) | ConflictError | 
| 429 | Limite de tentativas | express-rate-limit | 
| 500 | Falha inesperada | tratador global |   

## 5.3 Middlewares compartilhados 

### 5.3.1 Validação (`validator.middleware.ts`) 

**Finalidade.** Três fábricas de middleware que aplicam um esquema Zod: `validateSchema` (corpo), `validateQuery` (query string, ex.: `GET /sessions?status=`) e `validateUuidParams` (parâmetros de rota, que devem ser UUID; com id malformado a resposta é 400 sem consultar o banco). **Funcionamento.** Usam a forma segura de parse; em caso de falha, montam a lista de detalhes (um item por problema, com o campo, em notação com pontos, e a mensagem) e lançam `ValidationError`; em caso de sucesso gravam o resultado do Zod (`req.body`) e chamam `next`. 

**Limites.** Quando o cliente não envia corpo JSON ou o tipo de conteúdo não é JSON, o Express 5 deixa o corpo indefinido, o que faz o validador responder 400. JSON malformado também responde 400 (`entity.parse.failed`) e corpo grande demais responde 413 `PAYLOAD_TOO_LARGE` (tratados no `errorHandler`).

### 5.3.2 Autenticação (`auth.middleware.ts`, função `ensureAuthenticated`) 

**Finalidade.** Exigir um JWT válido no cabeçalho `Authorization`, identificar o usuário e conferir se ele continua ativo. **Funcionamento passo a passo:** 
 
- Sem cabeçalho: `UnauthorizedError` "Token não informado" (401). 
- Se o esquema não é exatamente "Bearer" ou o token está vazio: 401 "Token mal formatado". 
- `authenticateToken` valida assinatura e expiração (`verifyToken`); qualquer falha vira 401 "Token inválido ou expirado". 
- Consulta o `AuthCache` (em memória, TTL de 30 s, `AUTH_CACHE_TTL_SECONDS`; 0 desliga). Em caso de falha do cache, busca o usuário no banco (`findForAuth`); usuário inexistente, desativado ou de restaurante desativado resulta no mesmo 401. 
- Grava em `req.user` o objeto `{ id, restaurantId, role }`, **vindo do banco** e não do token. 
- Chama `next`.  

A mesma função `authenticateToken` autentica a conexão do Socket.IO. 

_Figura: **Figura 5.3** – Fluxograma do middleware ensureAuthenticated. (Ver seção 5.3.2)_ 

**Funções auxiliares.** `ensureRole(...roles)` (usada depois do `ensureAuthenticated`) responde 403 "Sem permissão para esta ação" se a role não está na lista; `userOf(req)` devolve o id do usuário (para `closed_by` e `done_by`); `tenantOf(req)` devolve o `restaurantId` já validado e responde 403 "Usuário sem restaurante" se não houver (SUPER_ADMIN). **Cache.** Editar ou remover usuário e ativar ou desativar restaurante invalidam a entrada do cache (com um contador de versão contra corrida entre leitura e invalidação), então o corte continua imediato. 

**Token do aparelho (`ensureTableToken`, `table-token.middleware.ts`).** Para as rotas do cliente: lê o cabeçalho `X-Table-Token`, calcula o SHA-256 e busca em `session_tokens`; recusa (401 "Token da mesa inválido ou expirado") se não existe, está revogado, a sessão não está ACTIVE ou venceu (a menos que `keep_open`). Grava em `req.tableToken` `{ tokenId, sessionId, restaurantId, tableLabel }`; `deviceOf(req)` o devolve. (DV-17 resolvida.)

### 5.3.3 Tratador global de erros (`error.middleware.ts`) 

**Finalidade.** Ser a rede de segurança única: todo erro lançado em middlewares, controllers e services resulta em resposta padronizada. Por isso controllers dispensam try/catch. O formato de resposta é `{ error, code, message, details? }` (DEC-12): `error` é o nome da classe do erro, `code` é um código estável para o front tratar (ex.: `CALL_NOT_OPEN`, `TABLE_INACTIVE`, `TOO_MANY_REQUESTS`, `PAYLOAD_TOO_LARGE`, `INTERNAL_ERROR`). **Ordem de decisão:** 
 
- Se o erro é uma `AppError` (ou subclasse): responde com o status, o nome, o código, a mensagem e os detalhes (se definidos). 
- Se é um erro conhecido do Prisma: P2002 (unicidade) e P2003 (registro ainda referenciado, ex.: mesa que ganhou atendimento durante a exclusão) respondem 409 `ConflictError`; P2025 (registro não encontrado em update ou delete) responde 404 `NotFoundError`. 
- Erros do leitor de corpo: JSON malformado responde 400 "JSON inválido" e corpo grande demais responde 413 `PAYLOAD_TOO_LARGE`. 
- Qualquer outro erro: registra no console (para erros do Prisma, só o nome e o código, porque a mensagem traria e-mail e hash) e responde 500 `InternalServerError` com a mensagem genérica "Erro interno do servidor", sem vazar detalhes. 

_Figura: **Figura 5.4** – Fluxograma do tratador global de erros. (Ver seção 5.3.3)_ 

**Observações.** As mensagens dos casos Prisma são genéricas; um P2002 em e-mail não diz qual campo (de propósito, para não confirmar a existência de um e-mail).

## 5.4 Erros da aplicação (`shared/errors`) 

`AppError` estende o erro nativo e acrescenta `statusCode` (padrão 400), `details` opcional, `code` estável e o nome "AppError". A documentação recomenda não usá-la diretamente nos services, e sim as subclasses de `http-errors.ts`, cada uma com mensagem padrão e nome próprio:  
| Classe | Status | Mensagem padrão | Uso previsto |
|---|---|---|---|  ``
| BadRequestError | 400 | Requisição inválida | pedido incorreto fora do esquema | ``
| ValidationError | 400 | Dados inválidos (recebe os detalhes primeiro) | falha de validação Zod | ``
| UnauthorizedError | 401 | Não autenticado | login, token ausente ou inválido | ``
| ForbiddenError | 403 | Acesso negado | falta de permissão (`ensureRole`, `tenantOf`) | 
| NotFoundError | 404 | Recurso não encontrado | recurso inexistente ou de outro tenant | ``
| ConflictError | 409 | Registro já existe | duplicidade e concorrência |   

Em uso hoje: todas as classes. `BadRequestError` (JSON inválido), `ValidationError` (validadores), `UnauthorizedError` (login e tokens), `ForbiddenError` (papel e tenant), `NotFoundError` (recurso inexistente ou de outro restaurante) e `ConflictError` (duplicidade, estado incompatível e corridas). O mecanismo é simples: o `throw` interrompe a função e o tratador monta a resposta. 

## 5.5 Utilitários de segurança (`shared/utils`) 

### 5.5.1 Senha (`password.ts`) 

**[Implementado]** Uso do algoritmo scrypt do módulo criptográfico nativo do Node (versão assíncrona). `passwordHash` gera um sal aleatório de 16 bytes, deriva uma chave de 64 bytes e devolve o texto "sal:hash" com ambos em hexadecimal. `comparePassword` separa o texto armazenado em sal e hash; se faltar qualquer parte, devolve falso; caso contrário deriva a chave com o mesmo sal e com o tamanho do hash armazenado e compara com igualdade em tempo constante, o que evita ataque de temporização. A v0.2 [Especificado] (RNF05) previa argon2 ou bcrypt; o código usa scrypt sem dependência externa, o que é mais recente e aceitável, mas diverge do texto antigo. (DV-22. Decisão: vale o código.) Os parâmetros de custo do scrypt (N, r, p) não são configurados, usando os padrões do Node. 

### 5.5.2 JWT (`jwt.ts`) 

O payload é composto por `sub` (id do usuário), `restaurantId` (texto ou nulo) e `role` (SUPER_ADMIN, OWNER ou STAFF). O segredo vem de `JWT_SECRET`; se ausente, a leitura lança erro com mensagem de que a variável não foi definida no `.env` (e, em produção, a API nem sobe com segredo curto ou padrão de desenvolvimento). `signToken` assina com HS256 e validade de `JWT_EXPIRES_IN`, padrão "1d". `verifyToken` valida assinatura e expiração e ainda rejeita payload textual ou sem `sub`. Os papéis e o restaurante que valem de verdade vêm do banco em `ensureAuthenticated`, não do token. 

## 5.6 Provedor do banco e contêiner de injeção 

### 5.6.1 Provedor Prisma (`shared/providers/prisma.ts`) 

Cria uma única instância do cliente Prisma (gerado em `generated/prisma`) e a exporta. Define o tipo `DbClient`, que é a união do cliente normal com o cliente de transação. Esse tipo é o mecanismo central para que os repositories funcionem tanto fora quanto dentro de uma transação interativa: no código de um service futuro, abre-se uma transação e instancia-se manualmente cada repository passando o cliente da transação em vez do cliente global. Hoje, nenhum código abre transação [Planejado]; o cadastro com restaurante e o fechamento de sessão a exigirão. 

### 5.6.2 Contêiner (`shared/container/container.ts`) 

Função `registerDependencies`, chamada no bootstrap, registra por nome (texto) as dependências: 
 
- "DbClient": valor único, o cliente Prisma. 
- Singletons de repository: "RestaurantRepository", "UserRepository", "TableRepository", "TableSessionRepository", "SessionTokenRepository" e "CallRepository" (cada um mapeado à implementação concreta, mas tipado pela interface). 
- Apoio: "AuthCache" e "Notifier" (SocketNotifier). 
- Services (singleton): "AuthService", "UsersService", "AdministrationService", "TablesService", "SessionsService" e "CallsService". 

Controllers não são registrados: são resolvidos diretamente em `routes.ts` por serem injetáveis. Regra do projeto: todo repository ou service novo precisa ser registrado, senão a resolução falha. 

## 5.7 Extensão de tipos do Express (`@types/express.d.ts`) 

Acrescenta ao tipo de requisição do Express dois campos opcionais: `user` (`{ id, restaurantId, role }`, preenchido por `ensureAuthenticated`) e `tableToken` (`{ tokenId, sessionId, restaurantId, tableLabel }`, preenchido por `ensureTableToken`). (DV-17 resolvida.) 

## 5.8 Resumo de dependências do capítulo  
| Componente | Depende de | Usado por |
|---|---|---|  ``
| main.ts | server, routes, container, error.middleware, Socket.IO, job de expiração | execução | 
| routes.ts | container, validators, middlewares de auth, limiters, controllers, schemas | main | 
| AuthController | IAuthService (nome "AuthService") | routes | 
| AuthService | repositories de restaurante e usuário, runInTransaction, password, jwt, http-errors | controller | 
| Repositories | DbClient | services | 
| ensureAuthenticated / ensureRole | jwt, AuthCache, UserRepository, http-errors | todas as rotas autenticadas e o Socket.IO | 
| ensureTableToken | SessionTokenRepository, hash SHA-256 | POST /public/calls | 
| errorHandler | AppError, http-errors, tipos Prisma | main (último use) |
