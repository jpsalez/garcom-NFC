# 3. Arquitetura e tecnologias 

Este capítulo descreve como o Garçom NFC foi desenhado para ser construído (arquitetura especificada na documentação v0.3, com v0.2 como histórico) e como ele está de fato construído hoje no repositório, conferido com o código em 14/11/2026. Em todo o capítulo, as marcações abaixo indicam a origem de cada afirmação: 
 
- **[Especificado]**: consta nas documentações v0.2/v0.3 ou nos documentos de estudo. 
- **[Implementado]**: confirmado no código-fonte atual. 
- **[Planejado/Não implementado]**: previsto, mas sem código correspondente.  
Critério de precedência em conflito: código (comportamento atual) > v0.3 > v0.2. A v0.3 é a versão mais recente e reduz o escopo da v0.2 a um MVP centrado em chamados. Os conflitos relevantes deste capítulo estão listados no final do arquivo (bloco de divergências) e no Apêndice A. 

## 3.1 Visão geral da arquitetura 

### 3.1.1 Arquitetura planejada 

[Especificado] A v0.3 define um sistema de três serviços executados como containers Docker em uma mesma rede interna: um front-end `web` (Next.js, porta 3000), uma API `api` (Express com TypeScript, porta 4000) e um banco `db` (PostgreSQL 16). O cliente acessa a mesa pelo celular (QR Code ou NFC, ambos gravando a mesma URL) e o balcão usa um computador. A comunicação segue três canais: REST sob o prefixo `/api/v1` do front-end para a API; WebSocket (Socket.IO) para entrega de eventos às telas; e Prisma, dentro da API, para o banco. A tela do balcão recebe os cards de chamado por Socket.IO, sem recarregar a página. 

_Figura: **Figura 3.1** – Arquitetura geral planejada (v0.3): web, api e db na rede app-net. (Ver seção 3.1.1)_ 

[Especificado] A API é organizada em módulos por domínio: `auth` (cadastro e login), `tables` (mesas e QR Code), `sessions` (atendimento e tokens por aparelho) e `calls` (chamados), além de uma camada `realtime` (Socket.IO, com salas `balcao` e `session`) e de `jobs` (rotina de expiração dos atendimentos de 4 horas, executada a cada minuto). Dois middlewares transversais são previstos: `auth` (JWT para balcão e Admin, token da mesa para o cliente) e `tenant` (isolamento por `restaurant_id`). O front-end teria quatro áreas: tela da mesa (`/m/[code]`), tela do balcão (`/balcao`), painel Admin (`/admin`) e cadastro/login (`/cadastro`, `/login`). 

### 3.1.2 Arquitetura implementada 

[Implementado, 14/11/2026] O repositório tem `back-end/` e `front-end/` e um `docker-compose.yml` na raiz. A API é um processo Express 5 em TypeScript (executado com `tsx`) que acessa o PostgreSQL 16 por meio do Prisma Client 6, com Socket.IO na mesma porta (`http.createServer(app)`, porta 4000 por padrão, `PORT`). As rotas ficam sob `/api/v1` (DEC-11) e são 27: `GET /health`, auth (2), administração do SUPER_ADMIN (7), equipe do OWNER (4), mesas (5), atendimentos (5) e chamados (3). O front é Next.js 16 (App Router, React 19) na porta 3000. 

_Figura: **Figura 3.2** – Arquitetura implementada em 14/11/2026: front Next.js, API Express com Socket.IO na porta 4000, job de expiração no mesmo processo e PostgreSQL via Prisma; o painel de desenvolvimento roda só no compose de dev. (Ver seção 3.1.2)_ 

### 3.1.3 Comparação planejado versus implementado  
| Aspecto | Especificado (v0.3) | Implementado (código) | Situação |
|---|---|---|---|  
| Front-end Next.js | Quatro áreas (mesa, balcão, Admin, cadastro/login) | `/m/[code]` (cliente), `/login`, `/admin/waiter` (balcão), `/admin/mesas` e `/admin/equipe` (OWNER); sem tela do SUPER_ADMIN nem cadastro | Parcial |
| API Express + TypeScript | Porta 4000, prefixo /api/v1 | Porta 4000 (`PORT`), prefixo `/api/v1`, 27 rotas, Swagger em `/docs` fora de produção | Implementado |
| PostgreSQL + Prisma | 6 tabelas, migrations versionadas | 6 tabelas e 6 migrations (duas escritas à mão por causa dos índices parciais) | Implementado |
| Camadas controller/service/repository | Sim, com Zod na entrada | Completa em auth, users/administration, tables, sessions e calls | Implementado |
| Injeção de dependência | Não detalhada na v0.3; citada no guia e nos módulos | tsyringe com tokens de texto (repositories, serviços, `Notifier`, `AuthCache`) | Implementado |
| Middleware de autenticação | JWT e token da mesa | `ensureAuthenticated` (JWT + consulta ao banco com cache), `ensureTableToken` (token do aparelho) | Implementado |
| Middleware de tenant e de papéis | Previsto | `ensureRole`, `tenantOf` e `userOf` em `auth.middleware.ts` | Implementado |
| Socket.IO e salas | Eventos call.created, call.done, session.updated, session.closed | `shared/realtime` (`INotifier`, `SocketNotifier`): sala `restaurant:<id>`, eventos `call:created`, `call:done`, `session:opened`, `session:extended`, `session:closed` | Implementado |
| Job de expiração (4 h) | A cada minuto | `shared/jobs/session-expiry.job.ts` chama `SessionsService.expireDue()` a cada 60 s | Implementado |
| Docker Compose e Dockerfiles | Três containers, healthcheck no banco | `docker-compose.yml` na raiz (db, api, web, painel e banco de teste opcional) usando a imagem oficial do Node, sem Dockerfile; healthcheck no banco e na API | Parcial (só desenvolvimento) |
| CORS | Variável CORS_ORIGIN | Pacote `cors` com `FRONTEND_URL` (vários valores separados por vírgula) | Implementado |
| Testes automatizados | Recomendados no guia de estudos | vitest + supertest, cerca de 100 testes em `back-end/tests`; lint com Biome; CI no GitHub Actions (typecheck, lint e testes) | Implementado |

### 3.1.4 Decisões arquiteturais registradas 

[Especificado] A v0.3 registra as seguintes decisões, com o status que o próprio documento lhes atribui: 
 
- **PostgreSQL** (Proposto): relações claras entre mesa, atendimento, tokens e chamados, e transação ao encerrar e revogar tudo de uma vez. 
- **Prisma ORM** (Proposto): tipos gerados para TypeScript e migrations versionadas. 
- **Socket.IO na API** (Proposto): cards aparecem e somem na hora, reconexão pronta e um único serviço para uma equipe de duas pessoas. 
- **Token por aparelho** (Definido): permite revogar todos de uma vez ao encerrar; guardado apenas como hash. 
- **Tenant por coluna** (Proposto): `restaurant_id` nas tabelas operacionais, mais simples que schema por cliente. 
- **Job de expiração** (Implementado em 14/11/2026): rotina a cada minuto que encerra atendimentos vencidos sem a marca de manter aberto. 
- **Redis adapter** (Futuro): só necessário com mais de uma instância da API.  
As decisões de PostgreSQL, Prisma e Socket.IO estão confirmadas na prática pelo código. O próprio documento mantém o rótulo "Proposto" em decisões já adotadas em todo o restante do texto (ver Apêndice A). 

## 3.2 Stack tecnológica 

### 3.2.1 Stack especificada 

[Especificado] Next.js (front-end); Node.js, Express e TypeScript (API); PostgreSQL; Docker Compose; Socket.IO (tempo real); Prisma (ORM). Imagens base planejadas: `node:20-alpine` para web e api e `postgres:16-alpine` para o banco. No compose de desenvolvimento, a API e o front usam `node:22-bookworm` (versão completa, que traz o OpenSSL que o Prisma precisa) e o banco usa `postgres:16-alpine`. Equipe: uma pessoa no front-end e uma no back-end. 

### 3.2.2 Stack implementada (back-end) 

[Implementado] As dependências declaradas em `package.json` do projeto `back-end` são:  
| Pacote | Versão declarada | Papel no projeto |
|---|---|---|
| express | ^5.3.0 | Servidor HTTP e roteamento. No Express 5, erros lançados em handlers assíncronos chegam ao tratador de erros. |
| @prisma/client e prisma | ^6.19.3 | Acesso ao PostgreSQL, migrations e geração do client em generated/prisma. |
| zod | ^4.6.7 | Validação de corpo, query e parâmetros das requisições. |
| jsonwebtoken | ^9.0.3 | Emissão e verificação do JWT da equipe. |
| tsyringe e reflect-metadata | ^4.10.0 e ^0.2.2 | Injeção de dependência por decorators. |
| socket.io | ^4.8.4 | Tempo real do balcão (sala por restaurante, JWT no handshake). |
| cors | ^2.8.6 | CORS por `FRONTEND_URL`. |
| express-rate-limit | ^8.7.4 | Limites de login, cadastro, scan e chamados. |
| qrcode | ^1.5.4 | QR Code em SVG da mesa. |
| swagger-ui-express | ^5.0.1 | Documentação OpenAPI em `/docs` (fora de produção). |
| dotenv | ^18.0.10 | Carregamento do arquivo .env. |
| typescript, tsx (dev) | ^7.0.2 e ^4.23.15 | Checagem de tipos (`tsc`, noEmit); a execução usa `tsx` diretamente. |
| vitest, supertest, socket.io-client (dev) | ^5.1.0, ^7.3.2 e ^4.8.4 | Testes de integração contra um PostgreSQL real e de tempo real. |
| @biomejs/biome (dev) | ^2.6.7 | Lint e formatação. |

O hash de senha não usa biblioteca externa: emprega o algoritmo scrypt do módulo `crypto` do Node. O front-end (`front-end/`) usa Next.js 16.4, React 19.3, `socket.io-client`, Tailwind/shadcn e componentes base-ui. [Ausente] `helmet`: os cabeçalhos de segurança ainda não são aplicados pela API (item pendente; pode vir do proxy). 

A configuração do TypeScript habilita `experimentalDecorators` e `emitDecoratorMetadata` (necessários ao tsyringe), `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` e `allowImportingTsExtensions`; os imports usam a extensão `.ts` explícita e o `package.json` declara `type: module`. O gerador do Prisma é o `prisma-client`, com saída em `generated/prisma` e `importFileExtension` igual a `ts`; o `prisma.config.ts` aponta o schema, a pasta de migrations e a variável `DATABASE_URL`. A pasta `generated/prisma` é ignorada pelo controle de versão. 
Observação: o `package.json` declara os tipos do Node na versão ^26 (`@types/node`), enquanto o compose usa `node:22` e o CI usa a LTS; o código roda nas duas, mas a versão de Node de produção ainda não está fixada (não há Dockerfile de produção). 

### 3.2.3 Divergências de tecnologia entre v0.2, v0.3 e código 
 
- Hash de senha: a v0.2 (RNF05) cita argon2 ou bcrypt; a v0.3 não define o algoritmo; o código usa scrypt. 
- Papéis: a v0.2 prevê `ADMIN`, `WAITER` e `KITCHEN`; a v0.3 prevê `ADMIN` e `STAFF`; o código usa `SUPER_ADMIN`, `OWNER` e `STAFF` (ver seção 4.3). 
- Estado de servidor no front-end (TanStack Query) aparece só na v0.2 e foi retirado da v0.3.  

## 3.3 Camadas do back-end 

### 3.3.1 Modelo de camadas 

[Especificado] A v0.3 define cinco camadas: routes (definem as rotas e aplicam middlewares), controllers (validam a entrada com Zod e montam a resposta), services (regras de negócio e emissão de eventos), repositories (acesso ao banco via Prisma, sempre com tenant) e realtime e jobs (Socket.IO e rotina de expiração). Os documentos de módulos refinam a regra: cada camada fala apenas com a camada abaixo. 

_Figura: **Figura 3.3** – Caminho de uma requisição pelas camadas, com desvio dos erros para o tratador global. (Ver seção 3.3)_ 

### 3.3.2 Responsabilidades e proibições de cada camada  
| Camada | Faz | Não faz | Situação |
|---|---|---|---|  ``
| Rotas (routes.ts) | Lista a API e define a ordem dos middlewares; a ordem dos itens é a ordem de execução. Resolve os controllers no container. | Não contém lógica. | [Implementado] arquivo único com 27 rotas sob `/api/v1` |
| Middlewares | validateSchema, validateQuery e validateUuidParams conferem a entrada; ensureAuthenticated valida o JWT e consulta o usuário; ensureRole restringe por papel; ensureTableToken valida o token do aparelho; os limiters controlam abuso; errorHandler traduz erros em respostas. | Não executam a ação principal. | [Implementado] |
| Controller | Lê a entrada já validada, chama o service e escolhe o status. Usa funções de seta para preservar o this. Sem try/catch. | Sem regra de negócio, sem Prisma, sem hash. | [Implementado] em todos os módulos |
| Service | Decide regras, combina repositories, usa hash e JWT, abre transações (`runInTransaction`), emite eventos pelo `Notifier` depois do commit e lança erros HTTP (ConflictError, UnauthorizedError etc.). | Não usa req/res nem escreve queries. | [Implementado] AuthService, UsersService, AdministrationService, TablesService, SessionsService e CallsService |
| Repository | Leitura e escrita via Prisma; sempre filtra por restaurant_id quando há tenant; aceita `DbClient` (ou `tx`). | Não decide permissão, não gera hash ou token, não lança erro de negócio. | [Implementado] em todos os módulos |
| Realtime e jobs | `SocketNotifier` entrega eventos à sala do restaurante; `startSessionExpiryJob` encerra atendimentos vencidos a cada 60 s. | - | [Implementado] |

### 3.3.3 Caminho de uma requisição (exemplo do login) 

[Implementado] Em `POST /auth/login`: (1) `express.json()`, ligado em `server.ts`, transforma o corpo em `req.body`; (2) `routes.ts` encadeia os limiters de login (por IP e por IP+e-mail), `validateSchema(loginUserSchema)` e o método `login` do controller; (3) o validador usa `safeParse` e, se inválido, lança `ValidationError` (400) com a lista de campos e mensagens; se válido, grava o resultado do Zod em `req.body`, de modo que o controller só recebe campos conhecidos; (4) o controller repassa o corpo ao `AuthService`; (5) o service pede o usuário ao repository por e-mail, compara a senha (contra um hash falso se o usuário não existe) e assina o JWT; (6) o controller responde 200 com o token e o usuário sem hash; (7) qualquer exceção lançada em qualquer etapa cai no `errorHandler`, que responde no formato `{ error, code, message, details }` descrito na seção 8. 

Detalhes do validador: `validateSchema` valida o corpo, `validateQuery` a query string e `validateUuidParams` os parâmetros de rota. Os schemas impõem limites (senha de 8 a 128 caracteres, nomes de até 100, slug de até 60) e o e-mail é normalizado. 

### 3.3.4 Inicialização do servidor 

[Implementado] O ponto de entrada é `main.ts`, que importa, nesta ordem: `reflect-metadata` (precisa ser o primeiro, pois os decorators do tsyringe leem o Reflect quando as classes são carregadas), `dotenv/config` (para que as variáveis existam antes de qualquer módulo que as leia), o `app` de `server.ts`, as rotas, o container e o `errorHandler`. A função `bootstrap` (1) exige `PUBLIC_APP_URL` e, em produção, recusa um `JWT_SECRET` com menos de 32 caracteres ou o padrão de desenvolvimento; (2) chama `registerDependencies`; (3) publica `/docs` (Swagger) só fora de produção; (4) monta as rotas em `/api/v1`; (5) registra o `errorHandler` por último, para capturar erros de todas as rotas; (6) cria o servidor HTTP próprio com `createServer(app)`, anexa o Socket.IO e escuta em `PORT` (padrão 4000); e (7) inicia o job de expiração. 
`server.ts` só cria o `app`: desliga o `x-powered-by`, aplica `trust proxy` se `TRUST_PROXY` for maior que zero, configura o CORS por `FRONTEND_URL` e o `express.json()`; ele não escuta porta (a ordem "registrar e depois escutar" está correta, DV-44 resolvida). 

## 3.4 Injeção de dependência com tsyringe 

### 3.4.1 Conceito e motivação 

[Implementado] O projeto usa injeção de dependência para que cada classe declare do que depende sem criar essas dependências com `new`. A justificativa documentada é dupla: o service depende da interface do repository (permitindo, por exemplo, um repository falso em testes) e o mesmo repository pode ser instanciado manualmente com o cliente de transação do Prisma (`new UserRepository(tx)`) dentro de `prisma.$transaction`. 

### 3.4.2 Como o container registra 

[Implementado] O arquivo `shared/container/container.ts` exporta a função `registerDependencies` e o próprio `container` do tsyringe. Os registros são feitos por tokens de texto, não por classes: 
 
- **Infraestrutura**: o token `"DbClient"` é registrado com `useValue` apontando para a instância única de `PrismaClient` criada em `shared/providers/prisma.ts`. O tipo `DbClient` é a união entre `PrismaClient` e o cliente de transação, o que permite usar os repositories dentro e fora de transações. 
- **Repositories** (singleton): `RestaurantRepository`, `UserRepository`, `TableRepository`, `TableSessionRepository`, `SessionTokenRepository` e `CallRepository`. Quem injeta recebe a interface. 
- **Serviços de apoio**: `AuthCache` (cache de autenticação em memória) e `Notifier` (implementado por `SocketNotifier`). 
- **Services** (singleton): `AuthService`, `UsersService`, `AdministrationService`, `TablesService`, `SessionsService` e `CallsService`. 

As classes usam o decorator de injetável e recebem as dependências no construtor com o decorator de injeção apontando para o token de texto, por exemplo o controller de auth recebe `AuthService` e o service recebe `RestaurantRepository` e `UserRepository`. Os repositories recebem o `DbClient` no construtor. Os controllers não são registrados explicitamente: `routes.ts` os obtém com `container.resolve(Controller)`, o que funciona porque as classes são injetáveis e os tokens de suas dependências estão registrados. 

_Figura: **Figura 3.4** – Container de injeção de dependência: o que é registrado e a cadeia de resolução. (Ver seção 3.4)_ 

### 3.4.3 Regras e armadilhas 
 
- Todo repository ou service novo precisa ser registrado no container; caso contrário a resolução falha em tempo de execução. 
- Como os tokens são textos, um erro de digitação não é detectado pelo compilador, apenas na execução. 
- O primeiro import de `main.ts` deve ser o `reflect-metadata`. 
- Regra de projeto (guia de módulos, [Especificado]): um service usa repositories de outros módulos, nunca services de outros módulos (exceção deliberada no código: `TablesService` e `AdministrationService` usam o `SessionsService` para encerrar atendimentos ao desativar mesa ou restaurante). Isso evita dependência circular no tsyringe, permite compor repositories numa transação com `tx` e evita notificações duplicadas. 
- O `AuthService` registra o restaurante e o OWNER na mesma transação, criando os repositories com o cliente `tx` (`new UserRepository(tx)`).

## 3.5 Multi-tenancy 

### 3.5.1 Modelo adotado 

[Especificado] Cada restaurante é um tenant. A estratégia escolhida é tenant por coluna: todas as tabelas operacionais carregam `restaurant_id` e toda consulta é filtrada por ele (RNF01 e RN01). As alternativas descartadas no guia de estudos são banco por tenant e schema por tenant, consideradas mais caras ou complexas para a equipe. O custo da escolha é que o banco, por si só, não impede leitura cruzada: o isolamento depende de o código sempre incluir o filtro. 

### 3.5.2 Como o tenant está implementado 

[Implementado] Os repositories seguem a convenção de receber `restaurantId` como primeiro parâmetro e filtrar com identificador **e** `restaurant_id` nas buscas, atualizações e remoções (por exemplo busca de mesa, sessão, chamado e usuário). O token JWT inclui `restaurantId` (nulo para o SUPER_ADMIN) e `role` no payload, ao lado de `sub`. O CHECK `users_restaurant_by_role` do banco garante que SUPER_ADMIN não tem restaurante e que OWNER e STAFF têm. 

Há exceções deliberadas, todas documentadas no código ou nos guias: 
 
- `RestaurantRepository` (em `modules/restaurants`) filtra só por identificador, pois a entidade já é o próprio tenant. 
- `findByEmail` (login) não filtra por tenant, porque o e-mail é único globalmente no schema e ainda não há tenant conhecido nesse momento. 
- `findByPublicCode` (rota pública da plaquinha) descobre o restaurante a partir da mesa, devolvendo também o restaurante (identificador, nome e slug). 
- `findExpired` (usado pelo job de expiração) varre sessões de todos os restaurantes. 
- `session_tokens` não possui `restaurant_id`: o tenant é checado pela sessão-pai; o `ensureTableToken` descobre sessão e restaurante a partir do hash do token. 

[Implementado] `ensureAuthenticated` valida o JWT e consulta o usuário no banco (com cache em memória de 30 s, `AUTH_CACHE_TTL_SECONDS`, invalidado ao editar ou remover usuário e ao ativar ou desativar restaurante), de modo que o papel, o restaurante e o estado ativo vêm do banco e não do token. Ele monta `req.user` com `{ id, restaurantId, role }`; `userOf` e `tenantOf` leem esse objeto nos controllers (`tenantOf` recusa quem não tem restaurante) e `ensureRole(...)` restringe por papel. Recurso de outro restaurante responde 404, não 403, para não confirmar a existência. A varredura `python3 .claude/scripts/check_tenant.py` aponta repositories que esqueçam o filtro. 

## 3.6 Estrutura de pastas 

### 3.6.1 Estrutura especificada 

[Especificado] A v0.3 descreve uma pasta `api/` com `prisma/schema.prisma` e `src/` contendo `server.ts`, `middlewares/` (auth, tableToken, tenant, errors), `realtime/` (salas e eventos), `jobs/` (rotina de expiração) e `modules/` (auth, tables, sessions, calls, cada um com routes, controller, service e repo). Para o front-end: `web/src/app` (`m/[code]`, `balcao`, `admin`, `(auth)/login` e cadastro), `components` e `lib` (`api.ts`, `socket.ts`, `token.ts`). 

### 3.6.2 Estrutura implementada  ``
| Caminho (em back-end/) | Conteúdo e função |
|---|---|  ``````````````````````
| package.json, tsconfig.json, prisma.config.ts, .env | Dependências e scripts (dev, test, typecheck, lint, db:seed, db:seed:super-admin, test:db:up/down), configuração do compilador e do Prisma; .env (não versionado; modelo em `.env.example`). |
| prisma/schema.prisma e prisma/migrations/ | Fonte da verdade do modelo de dados e histórico SQL: 6 migrations (init, roles_and_staff_category, staff_category_and_checks, users_restaurant_by_role, calls_one_open_per_type, indexes_consultas_e_fks). Seeds: `seed.ts` (OWNER demo e 5 mesas) e `seed-super-admin.ts`. |
| generated/prisma | Client gerado pelo Prisma; não deve ser editado nem versionado. |
| src/main.ts, src/server.ts, src/routes.ts | Bootstrap (servidor HTTP, Socket.IO, job), criação do `app` (CORS, JSON, trust proxy) e definição das 27 rotas. |
| src/docs/openapi.ts | Especificação OpenAPI servida em `/docs` fora de produção. |
| src/@types/express.d.ts | Estende Request do Express com `user` (id, restaurantId, role) e o contexto do token do aparelho. |
| src/shared/container/container.ts | Registro de dependências. |
| src/shared/providers/prisma.ts | Instância única de PrismaClient, tipo DbClient e `runInTransaction`. |
| src/shared/middlewares/ | auth (ensureAuthenticated, ensureRole, userOf, tenantOf), table-token, rate-limit, validator e error. |
| src/shared/errors/ | AppError.ts (erro base com status, código e detalhes) e http-errors.ts (400, 400 de validação, 401, 403, 404, 409). |
| src/shared/utils/ | password.ts (scrypt e hash falso), jwt.ts, token.ts (`public_code`, token do aparelho e SHA-256) e public-url.ts. |
| src/shared/cache/ | auth-cache.ts (cache de autenticação em memória). |
| src/shared/realtime/ | notifier.ts (`INotifier`) e socket-notifier.ts (`SocketNotifier`). |
| src/shared/jobs/ | session-expiry.job.ts (job de 60 s). |
| src/modules/auth/ | Register (fluxo B) e login: schema, interfaces, service e controller. |
| src/modules/users/ | Repository, `UsersService`, `StaffController` (rotas `/staff` do OWNER), schemas e `toPublicUser`. |
| src/modules/administration/ | `AdministrationService`/controller do SUPER_ADMIN: restaurantes e usuários de qualquer restaurante. |
| src/modules/restaurants/ | Repository e `slug.ts` (`slugify`, `withRandomSuffix`). |
| src/modules/tables/ | Mesas: repository, service (`public_url`, QR Code, exclusão), controller e schemas. |
| src/modules/sessions/ | Repositories de sessão e de token, service (scan, abrir, listar, encerrar, estender, expirar), controller e schema de query. |
| src/modules/calls/ | Repository, service (criar com trava de sessão, listar, finalizar), controller e schemas. |
| tests/ | Suíte vitest: auth, staff, tables, sessions, calls, realtime, session-expiry, tenant-isolation, hardening, api-v1 e outros. |

Cada módulo segue o molde: arquivo de schema Zod, arquivo de interfaces (contratos e tipos internos, como `PublicUser` sem o hash e `LoginResult`), repository, service e controller. A separação entre schema e interfaces existe porque o cliente envia `password` e o banco guarda `password_hash`. 

[Atualizado 14/11/2026] `shared/realtime` tem `notifier.ts` (INotifier, com `toRestaurant`, `disconnectUser` e `disconnectRestaurant`) e `socket-notifier.ts` (SocketNotifier, token "Notifier"); `main.ts` usa `http.createServer(app)` e o Socket.IO divide a porta (DV-44 resolvida). `shared/jobs` tem o job de expiração. O front-end vive em `front-end/` (Next.js 16): `app/` (rotas), `components/`, `lib/` (`api.ts`, `session.ts`, `useBalcao.ts`) e `services/`. 

### 3.6.3 Diferenças entre a estrutura especificada e a real 
 
- Pasta raiz chamada `back-end` e não `api`; o front fica em `front-end` e não `web`. 
- Middlewares ficam em `shared/middlewares`, não em `src/middlewares`; o do token da mesa é `table-token.middleware.ts` e o de tenant é a função `tenantOf` em `auth.middleware.ts`. 
- Rotas centralizadas em `routes.ts`, não um arquivo de rotas por módulo (o guia aceita dividir depois). 
- `realtime` e `jobs` ficam em `shared/` e não na raiz de `src/`. 

## 3.7 Dependências entre módulos 

[Implementado] Entre os módulos de domínio a regra é: services usam *repositories* de outros módulos e obtêm-nos pelo container por token; a única exceção são `TablesService` e `AdministrationService`, que usam o `SessionsService` (encerrar atendimentos ao desativar mesa ou restaurante). O `auth` usa os repositories de `users` e `restaurants`; `sessions` e `calls` usam o repository de mesas e de sessões; o `calls` e o `sessions` se coordenam pelo banco (sessão travada com `FOR SHARE`) e não por chamadas entre services. A costura entre eles está no container (que importa os repositories de todos) e no banco (chaves estrangeiras entre as tabelas). Os services emitem eventos pelo `Notifier`, sempre depois do commit. 

_Figura: **Figura 3.5** – Dependências entre módulos e infraestrutura compartilhada; amarelo indica módulo parcial. (Ver seção 3.7)_ 

[Implementado] A ordem das fases do roadmap (BE-01 a BE-07) foi seguida e concluída em 14/11/2026. Em runtime: `SessionsService` depende de `TableRepository`, `TableSessionRepository`, `SessionTokenRepository`, `CallRepository` (para cancelar chamados ao fechar) e do `Notifier`; `CallsService` depende de `CallRepository`, `TableSessionRepository` e do `Notifier`, com o contexto do aparelho vindo do `ensureTableToken`. 

Donos dos dados: `tables` pertence a `TablesService`; `table_sessions` e `session_tokens` a `SessionsService` (token criado no scan e revogado no encerramento); `calls` é criada e finalizada por `CallsService`, com `SessionsService` cancelando os chamados abertos ao encerrar. 

## 3.8 Containers Docker 

[Implementado, só desenvolvimento] Existe um único `docker-compose.yml`, na raiz, sem Dockerfile (usa imagens oficiais). Sobe sem `.env`: o compose traz um `JWT_SECRET` apenas de desenvolvimento.  
| Serviço | Imagem | Portas | Detalhes |
|---|---|---|---|
| db | postgres:16-alpine | 127.0.0.1:5432 | Banco `garcom`; usuário e senha por variáveis (padrão `garcom`); volume `pgdata`; healthcheck com `pg_isready`. Em produção, a porta deve ser removida. |
| api | node:22-bookworm | 4000 | `npm ci` só se o `package-lock.json` mudou, `prisma generate`, `prisma migrate deploy` e `tsx watch`; healthcheck em `/api/v1/health`; depende do db saudável. |
| web | imagem do Node | 3000 | Front Next.js em modo desenvolvimento; `NEXT_PUBLIC_API_URL` aponta para a API. |
| painel | python:3.13-alpine | 8765 | Painel de controle de desenvolvimento (agentes, git, tarefas). Não faz parte do produto. |
| db-test | postgres:16-alpine | 5433 | Perfil `test`, opcional; usado por `npm test` (`test:db:up` e `test:db:down`). |

Execução: `docker compose up` na raiz; a API fica em `localhost:4000` (docs em `/docs`) e o front em `localhost:3000`. O compose passa à API `FRONTEND_URL`, `PUBLIC_APP_URL` e `JWT_SECRET`.

Variáveis de ambiente usadas pelo código: `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN` (padrão `1d`), `PORT` (padrão 4000), `FRONTEND_URL` (CORS e Socket.IO), `PUBLIC_APP_URL` (obrigatória; forma a URL do QR Code), `TABLE_SESSION_TTL` (padrão 14400 s), `TRUST_PROXY`, `AUTH_CACHE_TTL_SECONDS` (padrão 30; 0 desliga), `NODE_ENV`, e, só para o seed, `SUPER_ADMIN_EMAIL` e `SUPER_ADMIN_PASSWORD`. No front: `NEXT_PUBLIC_API_URL` (padrão `http://localhost:4000/api/v1`). As variáveis `CORS_ORIGIN` e `PUBLIC_WEB_URL` da especificação foram substituídas por `FRONTEND_URL` e `PUBLIC_APP_URL` (DV-43). Detalhes de configuração aparecem na seção 8. 

[Pendente] Dockerfile e compose de produção (imagens próprias, sem `tsx watch`, banco sem porta exposta, front compilado). 

O ponto de extensão de integrações (sistemas de gestão e PDV) é apenas conceitual: o service de chamados emitiria eventos internos que um módulo `integrations` poderia consumir no futuro.
