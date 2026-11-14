# 3. Arquitetura e tecnologias 

Este capítulo descreve como o Garçom NFC foi desenhado para ser construído (arquitetura especificada na documentação v0.3, com v0.2 como histórico) e como ele está de fato construído hoje no repositório `back-end`. Em todo o capítulo, as marcações abaixo indicam a origem de cada afirmação: 
 
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

[Implementado] O repositório contém apenas o back-end. Há um único processo Express 5 em TypeScript, executado diretamente com `tsx` (script `dev`), que acessa o PostgreSQL por meio do Prisma Client 6. Três rotas estão registradas: `GET /health`, `POST /auth/register` e `POST /auth/login`. O servidor escuta na porta fixa 3000 e as rotas são montadas na raiz, sem o prefixo `/api/v1`. 

_Figura: **Figura 3.2** – Arquitetura efetivamente implementada: apenas a API e o acesso ao banco existem; elementos tracejados não existem no repositório. (Ver seção 3.1.2)_ 

### 3.1.3 Comparação planejado versus implementado  
| Aspecto | Especificado (v0.3) | Implementado (código) | Situação |
|---|---|---|---|  
| Front-end Next.js | Quatro áreas (mesa, balcão, Admin, cadastro/login) | Inexistente no repositório | Não implementado | ``
| API Express + TypeScript | Porta 4000, prefixo /api/v1 | Porta 3000 fixa, rotas na raiz | Parcial, divergente | 
| PostgreSQL + Prisma | 6 tabelas, migrations versionadas | 6 tabelas, uma migration inicial | Implementado | ``
| Camadas controller/service/repository | Sim, com Zod na entrada | Completa só em auth; demais módulos só com repository | Parcial | 
| Injeção de dependência | Não detalhada na documentação v0.3; citada no guia e nos módulos | tsyringe com tokens de texto | Implementado | ``
| Middleware de autenticação | JWT e token da mesa | Só JWT (ensureAuthenticated), sem uso em rotas | Parcial | 
| Middleware de tenant e de papéis | Previsto | Inexistente | Não implementado | ````````
| Socket.IO e salas | Eventos call.created, call.done, session.updated, session.closed | Sem dependência nem código | Não implementado | ``
| Job de expiração (4 h) | A cada minuto | `shared/jobs/session-expiry.job.ts` chama `SessionsService.expireDue()` (14/11/2026) | Implementado | ``
| Docker Compose e Dockerfiles | Três containers, healthcheck no banco | Inexistentes; nem .env.example | Não implementado | ``
| CORS | Variável CORS_ORIGIN | Sem biblioteca nem configuração | Não implementado | 
| Testes automatizados | Recomendados no guia de estudos | Nenhum (script de teste é placeholder) | Não implementado |   

### 3.1.4 Decisões arquiteturais registradas 

[Especificado] A v0.3 registra as seguintes decisões, com o status que o próprio documento lhes atribui: 
 
- **PostgreSQL** (Proposto): relações claras entre mesa, atendimento, tokens e chamados, e transação ao encerrar e revogar tudo de uma vez. 
- **Prisma ORM** (Proposto): tipos gerados para TypeScript e migrations versionadas. 
- **Socket.IO na API** (Proposto): cards aparecem e somem na hora, reconexão pronta e um único serviço para uma equipe de duas pessoas. 
- **Token por aparelho** (Definido): permite revogar todos de uma vez ao encerrar; guardado apenas como hash. 
- **Tenant por coluna** (Proposto): `restaurant_id` nas tabelas operacionais, mais simples que schema por cliente. 
- **Job de expiração** (Implementado em 14/11/2026): rotina a cada minuto que encerra atendimentos vencidos sem a marca de manter aberto. 
- **Redis adapter** (Futuro): só necessário com mais de uma instância da API.  
As decisões de PostgreSQL e Prisma estão confirmadas na prática pelo código; Socket.IO continua apenas especificado. O próprio documento mantém o rótulo "Proposto" em decisões já adotadas em todo o restante do texto (ver Apêndice A). 

## 3.2 Stack tecnológica 

### 3.2.1 Stack especificada 

[Especificado] Next.js (front-end); Node.js, Express e TypeScript (API); PostgreSQL; Docker Compose; Socket.IO (tempo real); Prisma (ORM). Imagens base planejadas: `node:20-alpine` para web e api e `postgres:16-alpine` para o banco. Equipe: uma pessoa no front-end e uma no back-end. 

### 3.2.2 Stack implementada (back-end) 

[Implementado] As dependências declaradas em `package.json` do projeto `back-end` são:  
| Pacote | Versão declarada | Papel no projeto |
|---|---|---|  ``
| express | ^5.3.0 | Servidor HTTP e roteamento. No Express 5, erros lançados em handlers assíncronos chegam ao tratador de erros. | ``````
| @prisma/client e prisma | ^6.19.3 | Acesso ao PostgreSQL, migrations e geração do client em generated/prisma. | ``
| zod | ^4.6.7 | Validação do corpo das requisições. | ``
| jsonwebtoken | ^9.0.3 | Emissão e verificação do JWT do balcão e do Admin. | ````
| tsyringe e reflect-metadata | ^4.10.0 e ^0.2.2 | Injeção de dependência por decorators. | ````
| dotenv | ^18.0.10 | Carregamento do arquivo .env. | ``````
| typescript (dev) | ^7.0.2 | Checagem de tipos (noEmit); a execução usa tsx diretamente. |   

O hash de senha não usa biblioteca externa: emprega o algoritmo scrypt do módulo `crypto` do Node. Não há dependências de `socket.io`, de geração de QR Code nem de CORS. 

A configuração do TypeScript habilita `experimentalDecorators` e `emitDecoratorMetadata` (necessários ao tsyringe), `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` e `allowImportingTsExtensions`; os imports usam a extensão `.ts` explícita e o `package.json` declara `type: module`. O gerador do Prisma é o `prisma-client`, com saída em `generated/prisma` e `importFileExtension` igual a `ts`; o `prisma.config.ts` aponta o schema, a pasta de migrations e a variável `DATABASE_URL`. A pasta `generated/prisma` é ignorada pelo controle de versão. 
Requer validação: o `package.json` declara os tipos do Node na versão ^26 (`@types/node`), enquanto a especificação de infraestrutura prevê `node:20-alpine`. A compatibilidade entre a versão de Node das imagens planejadas e a versão efetivamente usada no desenvolvimento não está documentada. 

### 3.2.3 Divergências de tecnologia entre v0.2, v0.3 e código 
 
- Hash de senha: a v0.2 (RNF05) cita argon2 ou bcrypt; a v0.3 não define o algoritmo; o código usa scrypt. 
- Papéis: a v0.2 prevê `ADMIN`, `WAITER` e `KITCHEN`; a v0.3 e o código usam `ADMIN` e `STAFF` (ver seção 4.3). 
- Estado de servidor no front-end (TanStack Query) aparece só na v0.2 e foi retirado da v0.3.  

## 3.3 Camadas do back-end 

### 3.3.1 Modelo de camadas 

[Especificado] A v0.3 define cinco camadas: routes (definem as rotas e aplicam middlewares), controllers (validam a entrada com Zod e montam a resposta), services (regras de negócio e emissão de eventos), repositories (acesso ao banco via Prisma, sempre com tenant) e realtime e jobs (Socket.IO e rotina de expiração). Os documentos de módulos refinam a regra: cada camada fala apenas com a camada abaixo. 

_Figura: **Figura 3.3** – Caminho de uma requisição pelas camadas, com desvio dos erros para o tratador global. (Ver seção 3.3)_ 

### 3.3.2 Responsabilidades e proibições de cada camada  
| Camada | Faz | Não faz | Situação |
|---|---|---|---|  ``
| Rotas (routes.ts) | Lista a API e define a ordem dos middlewares; a ordem dos itens é a ordem de execução. Resolve os controllers no container. | Não contém lógica. | [Implementado] arquivo único com 3 rotas | ``````
| Middlewares | validateSchema confere o corpo com o schema Zod; ensureAuthenticated valida o JWT; errorHandler traduz erros em respostas. | Não executam a ação principal. | [Implementado]; nenhum middleware de papel, tenant ou token de mesa | ``````
| Controller | Lê req.body, chama o service e escolhe o status (201 no registro, 200 no login). Usa funções de seta para preservar o this. Sem try/catch. | Sem regra de negócio, sem Prisma, sem hash. | [Implementado] só auth | ````````````
| Service | Decide regras, combina repositories, usa hash e JWT, lança erros HTTP (ConflictError, UnauthorizedError etc.) e, no futuro, abriria transações. | Não usa req/res nem escreve queries. | [Implementado] só AuthService; tables tem esqueleto vazio | ``
| Repository | Leitura e escrita via Prisma; sempre filtra por restaurant_id quando há tenant. | Não decide permissão, não gera hash ou token, não lança erro de negócio. | [Implementado] em auth, tables, sessions, calls | 
| Realtime e jobs | Entrega de eventos e expiração. | - | [Planejado/Não implementado] |   

### 3.3.3 Caminho de uma requisição (exemplo do login) 

[Implementado] Em `POST /auth/login`: (1) `express.json()`, ligado em `server.ts`, transforma o corpo em `req.body`; (2) `routes.ts` encadeia `validateSchema(loginUserSchema)` e o método `login` do controller; (3) o validador usa `safeParse` no corpo e, se inválido, lança `ValidationError` (400) com a lista de campos e mensagens, e o controller não executa; (4) o controller repassa o corpo ao `AuthService`; (5) o service pede o usuário ao repository por e-mail, compara a senha e assina o JWT; (6) o controller responde 200 com o token e o usuário sem hash; (7) qualquer exceção lançada em qualquer etapa cai no `errorHandler`, que responde com o formato de erro descrito na seção 8. 

Detalhes relevantes do validador: ele valida apenas `req.body` (não valida parâmetros nem query) e não substitui o corpo pelo resultado já interpretado, de modo que o controller consome o corpo original. Os schemas de auth não impõem tamanho mínimo, nem formatação de nome ou senha; apenas o e-mail usa a validação de e-mail do Zod. 

### 3.3.4 Inicialização do servidor 

[Implementado] O ponto de entrada é `main.ts`, que importa, nesta ordem: `reflect-metadata` (precisa ser o primeiro, pois os decorators do tsyringe leem o Reflect quando as classes são carregadas), `dotenv/config` (para que `JWT_SECRET` e demais variáveis existam antes de qualquer módulo que as leia), o `app` de `server.ts`, as rotas, o container e o `errorHandler`. A função `bootstrap` chama `registerDependencies`, monta as rotas no `app` e, por último, registra o `errorHandler`, para que ele capture erros de todas as rotas anteriores. 
Observação sobre `server.ts`: a chamada de escuta na porta 3000 acontece no momento em que o módulo é importado, ou seja, antes de `bootstrap` registrar rotas e tratador de erros. Na prática o intervalo é imperceptível, mas a ordem difere da sequência "registrar e depois escutar" e impede configurar a porta por variável de ambiente. Para Socket.IO seria necessário criar o servidor HTTP explicitamente (planejado, não implementado). 

## 3.4 Injeção de dependência com tsyringe 

### 3.4.1 Conceito e motivação 

[Implementado] O projeto usa injeção de dependência para que cada classe declare do que depende sem criar essas dependências com `new`. A justificativa documentada é dupla: o service depende da interface do repository (permitindo, por exemplo, um repository falso em testes) e o mesmo repository pode ser instanciado manualmente com o cliente de transação do Prisma (`new UserRepository(tx)`) dentro de `prisma.$transaction`. 

### 3.4.2 Como o container registra 

[Implementado] O arquivo `shared/container/container.ts` exporta a função `registerDependencies` e o próprio `container` do tsyringe. Os registros são feitos por tokens de texto, não por classes: 
 
- **Infraestrutura**: o token `"DbClient"` é registrado com `useValue` apontando para a instância única de `PrismaClient` criada em `shared/providers/prisma.ts`. O tipo `DbClient` é a união entre `PrismaClient` e o cliente de transação, o que permite usar os repositories dentro e fora de transações. 
- **Repositories**: seis registros como singleton, cada um associando o token à classe concreta e à interface: `RestaurantRepository`, `UserRepository`, `TableRepository`, `TableSessionRepository`, `SessionTokenRepository` e `CallRepository`. Quem injeta recebe a interface. 
- **Services**: apenas `AuthService` está registrado (singleton).  

As classes usam o decorator de injetável e recebem as dependências no construtor com o decorator de injeção apontando para o token de texto, por exemplo o controller de auth recebe `AuthService` e o service recebe `RestaurantRepository` e `UserRepository`. Os repositories recebem o `DbClient` no construtor. O `AuthController` não é registrado explicitamente: `routes.ts` o obtém com `container.resolve(AuthController)`, o que funciona porque a classe é injetável e seu token de dependência foi registrado. 

_Figura: **Figura 3.4** – Container de injeção de dependência: o que é registrado e a cadeia de resolução. (Ver seção 3.4)_ 

### 3.4.3 Regras e armadilhas 
 
- Todo repository ou service novo precisa ser registrado no container; caso contrário a resolução falha em tempo de execução. 
- Como os tokens são textos, um erro de digitação não é detectado pelo compilador, apenas na execução. 
- O primeiro import de `main.ts` deve ser o `reflect-metadata`. 
- Regra de projeto (guia de módulos, [Especificado]): um service usa repositories de outros módulos, nunca services de outros módulos. Isso evita dependência circular no tsyringe, permite compor repositories numa transação com `tx` e evita notificações duplicadas. 
- No código, `AuthService` recebe `RestaurantRepository` mas ainda não o utiliza em `register` (o cadastro do restaurante não existe; ver seção 5). 

Não implementados: registro de `Notifier` (previsto no guia de módulos com uma implementação de console e, depois, uma de Socket.IO), `TableService`, `SessionService` e `CallService`. 

## 3.5 Multi-tenancy 

### 3.5.1 Modelo adotado 

[Especificado] Cada restaurante é um tenant. A estratégia escolhida é tenant por coluna: todas as tabelas operacionais carregam `restaurant_id` e toda consulta é filtrada por ele (RNF01 e RN01). As alternativas descartadas no guia de estudos são banco por tenant e schema por tenant, consideradas mais caras ou complexas para a equipe. O custo da escolha é que o banco, por si só, não impede leitura cruzada: o isolamento depende de o código sempre incluir o filtro. 

### 3.5.2 Como o tenant está implementado 

[Implementado] Os repositories seguem a convenção de receber `restaurantId` como primeiro parâmetro e filtrar com identificador **e** `restaurant_id` nas buscas, atualizações e remoções (por exemplo busca de mesa, sessão, chamado e usuário). O token JWT inclui `restaurantId` (que pode ser nulo) e `role` no payload, ao lado de `sub`. 

Há exceções deliberadas, todas documentadas no código ou nos guias: 
 
- `RestaurantRepository` (em `modules/restaurants`) filtra só por identificador, pois a entidade já é o próprio tenant. 
- `findByEmail` (login) não filtra por tenant, porque o e-mail é único globalmente no schema e ainda não há tenant conhecido nesse momento. 
- `findByPublicCode` (rota pública da plaquinha) descobre o restaurante a partir da mesa, devolvendo também o restaurante (identificador, nome e slug). 
- `findExpired` (usado pelo job de expiração) varre sessões de todos os restaurantes. 
- `session_tokens` não possui `restaurant_id`: `findManyBySession` checa o tenant pela sessão-pai; já `findById`, `update` e `delete` de token operam apenas por identificador, sem checar tenant.  

### 3.5.3 O que falta para o isolamento completo 

[Planejado/Não implementado] O middleware de tenant não existe. `ensureAuthenticated` grava apenas `req.id`; `restaurantId` e `role` do token não são propagados para a requisição, e o arquivo de tipos estendidos do Express declara apenas `id`. Também não existe verificação de papel (`ensureRole`) e `ensureAuthenticated` não é usado por nenhuma rota. O guia propõe que, quando o recurso pertencer a outro restaurante, a API responda 404 (não 403), para não confirmar a existência do recurso. 
Requer validação: como `users.restaurant_id` é opcional e o cadastro atual cria o usuário sem restaurante, tokens emitidos hoje carregam `restaurantId` nulo. O guia propõe devolver 403 "Usuário sem restaurante vinculado" quando o identificador estiver ausente; essa regra não está implementada. 

## 3.6 Estrutura de pastas 

### 3.6.1 Estrutura especificada 

[Especificado] A v0.3 descreve uma pasta `api/` com `prisma/schema.prisma` e `src/` contendo `server.ts`, `middlewares/` (auth, tableToken, tenant, errors), `realtime/` (salas e eventos), `jobs/` (rotina de expiração) e `modules/` (auth, tables, sessions, calls, cada um com routes, controller, service e repo). Para o front-end: `web/src/app` (`m/[code]`, `balcao`, `admin`, `(auth)/login` e cadastro), `components` e `lib` (`api.ts`, `socket.ts`, `token.ts`). 

### 3.6.2 Estrutura implementada  ``
| Caminho (em back-end/) | Conteúdo e função |
|---|---|  ``````````````````````
| package.json, tsconfig.json, prisma.config.ts, .env | Dependências e scripts (dev: tsx watch src/main.ts; typecheck), configuração do compilador e do Prisma; .env (não versionado) com DATABASE_URL, JWT_SECRET e JWT_EXPIRES_IN. | ``````
| prisma/schema.prisma e prisma/migrations/ | Fonte da verdade do modelo de dados e histórico SQL (migration 20261111232558_init e arquivo de trava do provedor). | ``
| generated/prisma | Client gerado pelo Prisma; não deve ser editado nem versionado. | ``````
| src/main.ts, src/server.ts, src/routes.ts | Bootstrap, criação e escuta do Express, e definição das rotas. | ``````
| src/@types/express.d.ts | Estende Request do Express com id opcional. | ``
| src/shared/container/container.ts | Registro de dependências. | ``````
| src/shared/providers/prisma.ts | Instância única de PrismaClient e tipo DbClient. | ````````
| src/shared/middlewares/ | validator.middleware.ts, auth.middleware.ts, error.middleware.ts. | ``````
| src/shared/errors/ | AppError.ts (erro base com status, nome e detalhes) e http-errors.ts (400, 400 de validação, 401, 403, 404, 409). | ``````
| src/shared/utils/ | password.ts (scrypt com sal de 16 bytes, chave de 64 bytes, formato sal e hash em hexadecimal, comparação em tempo constante) e jwt.ts (assinatura e verificação). | ``
| src/modules/auth/ | Módulo completo: schema, interfaces, service e controller (os repositories de usuário e restaurante moram em `users` e `restaurants`). | ``````
| src/modules/users/ | `users.repository.interface.ts` (IUserRepository, CreateUserData) e `users.repository.ts`. Só repository. | ``
| src/modules/restaurants/ | `restaurants.repository.interface.ts` e `restaurants.repository.ts`. Só repository. | ``
| src/modules/administration/ | Esqueleto: `administration.service.ts` e `administration.schema.ts` vazios. Previsto para configuração do restaurante e das mesas, usando repositories de `restaurants` e `tables` pelo container. | ``
| src/modules/tables/ | Repository e interface prontos; tables.service.ts é esqueleto (classe com nome em minúscula, sem decorator, método create vazio); controller e schemas vazios. | ````
| src/modules/sessions/ | Repositories de sessão e de token, com interfaces (pasta renomeada de `seassions` em 12/11/2026). | ``
| src/modules/calls/ | Repository e interface. |   

Cada módulo segue o molde: arquivo de schema Zod, arquivo de interfaces (contratos e tipos internos, como `PublicUser` sem o hash e `LoginResult`), repository, service e controller. A separação entre schema e interfaces existe porque o cliente envia `password` e o banco guarda `password_hash`. 

[Atualizado 14/11/2026] `shared/realtime` agora tem `notifier.ts` (INotifier) e `socket-notifier.ts` (SocketNotifier, token "Notifier"); `main.ts` usa `http.createServer(app)` e o Socket.IO divide a porta (DV-44 resolvida). Dependências `socket.io` e `socket.io-client` (dev). Continuam ausentes `jobs` (etapa B) e `web`. 

### 3.6.3 Diferenças entre a estrutura especificada e a real 
 
- Pasta raiz chamada `back-end` e não `api`. 
- Middlewares ficam em `shared/middlewares`, não em `src/middlewares`; faltam `tableToken` e `tenant`. 
- Rotas centralizadas em `routes.ts`, não um arquivo de rotas por módulo (o guia aceita dividir depois). 
- `tables.schemas.ts` no plural, enquanto o guia cita `tables.schema.ts`. 
- Módulo `realtime` e `jobs` ausentes; sem front-end.  

## 3.7 Dependências entre módulos 

[Implementado] Entre os módulos de domínio a regra é: services usam *repositories* de outros módulos (nunca services) e obtêm-nos pelo container por token. O `auth` importa apenas os tipos `IUserRepository`/`CreateUserData` (`users`) e `IRestaurantRepository` (`restaurants`); os demais módulos dependem somente de `shared` e do cliente gerado do Prisma. A costura entre eles está no container (que importa os repositories de todos) e no banco (chaves estrangeiras entre as tabelas). O módulo `auth` usa `utils` (senha e JWT) e `errors`; os demais módulos usam apenas o provedor do Prisma, via `DbClient`. 

_Figura: **Figura 3.5** – Dependências entre módulos e infraestrutura compartilhada; amarelo indica módulo parcial. (Ver seção 3.7)_ 

[Especificado] A dependência prevista entre as fases do roadmap (v0.3): o cadastro e login (BE-02) dependem do setup (BE-01); mesas e QR Code (BE-03) dependem de BE-02; atendimento e token (BE-04) dependem de BE-03; chamados e Socket.IO (BE-05) dependem de BE-04; encerrar atendimento (BE-06) depende de BE-05; manter aberto, job e limite (BE-07) dependem de BE-06. Em runtime planejado: `SessionService` dependeria de `TableRepository`, `TableSessionRepository`, `SessionTokenRepository`, do notificador e, para cancelar chamados ao fechar, do `CallRepository`; `CallService` dependeria de `CallRepository` e do notificador, com o contexto da mesa vindo da requisição. 

Donos dos dados, conforme o guia: `tables` pertence a `TableService`; `table_sessions` a `SessionService`; `session_tokens` é criada no join do cliente e revogada no encerramento; `calls` é criada, atendida e cancelada por `CallService`, com `SessionService` cancelando os chamados abertos ao encerrar. 

## 3.8 Containers Docker planejados 

[Planejado/Não implementado] Nenhum arquivo de Docker existe no repositório. A especificação (v0.3, idêntica à v0.2 na topologia) prevê:  
| Serviço | Imagem/build | Portas | Detalhes |
|---|---|---|---|  ````````````
| web | Build de ./web, node:20-alpine | 3000:3000 | Variáveis NEXT_PUBLIC_API_URL (http://localhost:4000) e API_INTERNAL_URL (http://api:4000, usada pelo SSR). Depende de api. | ````````````
| api | Build de ./api, node:20-alpine | 4000:4000 | Usa env_file .env; depende do db saudável. | ``````````
| db | postgres:16-alpine | 5432 apenas interna | Banco garcom; usuário e senha por variáveis; volume pgdata; healthcheck com pg_isready. |   

Os três containers compartilham a rede `app-net`; somente o banco não expõe porta ao host. O front-end chama a API por SSR em `http://api:4000`; a API chama o banco em `db:5432`; o healthcheck do banco garante que a API só suba depois dele. 

Execução prevista: copiar `.env.example` para `.env`; subir os contêineres com o Docker Compose, reconstruindo as imagens; aplicar as migrations existentes (modo de implantação do Prisma) dentro do contêiner da API; acessar o web em `localhost:3000` e a API em `localhost:4000/api/v1`. 

Variáveis de ambiente especificadas: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `TABLE_SESSION_TTL` (14400 segundos, igual a 4 h) e `PUBLIC_WEB_URL` (base da URL do QR Code) na API; `NEXT_PUBLIC_API_URL` e `API_INTERNAL_URL` no web; `DB_USER` e `DB_PASSWORD` no banco. As variáveis efetivamente usadas pelo código são `DATABASE_URL`, `JWT_SECRET` e `JWT_EXPIRES_IN` (padrão `1d` quando ausente); esta última não consta da especificação. Detalhes de configuração aparecem na seção 8. 

O ponto de extensão de integrações (sistemas de gestão e PDV) é apenas conceitual: o service de chamados emitiria eventos internos que um módulo `integrations` poderia consumir no futuro.
