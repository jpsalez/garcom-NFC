# 5. Módulos implementados (auth e infraestrutura compartilhada) 

> **Atualização 12/11/2026 (o código manda; o texto detalhado abaixo é o instantâneo anterior e está parcialmente DESATUALIZADO).** [Implementado] hoje: `register` = fluxo B (OWNER + restaurante em `runInTransaction`, slug automático com sufixo, resposta `{ user, restaurant }`, erro genérico de e-mail duplicado); `login` compara com `DUMMY_PASSWORD_HASH` e bloqueia usuário/restaurante inativo; JWT HS256 fixo; e-mail normalizado (trim+lowercase) e senha mínima 8 nos schemas; role ADMIN não existe mais (SUPER_ADMIN/OWNER/STAFF); `ensureAuthenticated` consulta o banco com cache em memória (`shared/cache/auth-cache.ts`, TTL 30 s) e grava `req.user {id, restaurantId, role}`; existem `ensureRole`, `tenantOf`, `validateUuidParams`; `validateSchema` grava `req.body` com os dados do schema; módulos novos `users` (staff), `administration`, `restaurants`; CORS por `FRONTEND_URL`; rate limit (login 10/15 min por IP+e-mail, register 5/h por IP); Docker Compose, `.env.example` e CI existem; rotas em `routes.ts` conforme cap-08 (8.2.1 e 8.2.3). Onde abaixo houver "só o usuário ADMIN, sem restaurante", "`req.id`", "nenhuma rota usa ensureAuthenticated", "sem rate limit" ou "sem Docker", leia como histórico.

Este capítulo descreve, com base na leitura direta do código em `back-end/src`, tudo o que hoje funciona de ponta a ponta no servidor: o ponto de entrada da aplicação, as três rotas existentes, o módulo `auth` completo (cadastro e login) e a infraestrutura compartilhada em `shared/` (middlewares, erros, utilitários de senha e token, provedor do banco, contêiner de injeção de dependência e extensão de tipos do Express). Todas as afirmações deste capítulo estão marcadas implicitamente como **[Implementado]**, salvo quando houver rótulo explícito de **[Especificado]** (documentos v0.2, v0.3, guia) ou **[Planejado/Não implementado]**. Quando o comportamento do código difere da documentação, vale a precedência definida na especificação comum: código, depois v0.3, depois v0.2. As divergências estão reunidas na tabela consolidada do Apêndice A (identificadores DV-nn) e também citadas no texto. 
Observação sobre escopo: o código inspecionado contém somente o back-end. Não há front-end, testes automatizados (só vitest.config.ts) nem tempo real (Socket.IO); Docker Compose e CI existem (atualizado 12/11/2026). A pasta `shared/realtime` citada nas notas existe apenas como intenção; no código lido não há arquivos de tempo real. 

## 5.1 Inicialização e roteamento 

### 5.1.1 Arquivo `main.ts` (ponto de entrada) 

**Finalidade.** É o arquivo executado pelo script de desenvolvimento (o script de desenvolvimento do projeto, que usa o utilitário tsx em modo de observação). Ele não contém regra de negócio; apenas monta a aplicação na ordem correta. 

**Funcionamento passo a passo.** 
 
- Importa `reflect-metadata` como primeiro import. Isso é obrigatório porque a biblioteca de injeção de dependência (tsyringe) usa decorators que consultam essa camada de metadados no instante em que as classes são carregadas; se ela viesse depois, as classes decoradas falhariam ao serem avaliadas. 
- Importa `dotenv/config`, que lê o arquivo `.env` e preenche `process.env` (`JWT_SECRET`, `JWT_EXPIRES_IN`, `DATABASE_URL`) antes de qualquer módulo que dependa dessas variáveis. 
- Importa o objeto `app` de `server.ts`, a função de montagem de rotas, a função de registro de dependências e o tratador global de erros. 
- Executa uma função de bootstrap com três ações em ordem fixa: (a) registrar as dependências no contêiner; (b) acoplar ao `app` o roteador devolvido pela montagem de rotas; (c) acoplar por último o `errorHandler`. A ordem importa: o Express só entrega um erro a um tratador de erros registrado depois do ponto onde o erro foi lançado; por isso o tratador é sempre a última peça.  

**[Planejado/Não implementado].** O job periódico de expiração de sessões (descrito nas notas como um temporizador de 60 s no `main.ts`) não existe no código. Também não há Socket.IO. 

### 5.1.2 Arquivo `server.ts` 

Cria a instância do Express, habilita o interpretador de corpo JSON (`express.json()`), abre a escuta na porta 3000 (valor fixo no código, sem variável de ambiente) escrevendo no console a mensagem de que está rodando, e exporta o `app`. Pontos de atenção: 
 
- A escuta é aberta no momento em que o módulo é importado, isto é, antes de o bootstrap registrar rotas e tratador de erros. Na prática a janela é de milissegundos, mas implica que importar `server.ts` (por exemplo, em testes) abriria a porta. O guia aponta exatamente este problema para testes de integração. (Divergência DV-36.) 
- A porta fixa 3000 difere do exemplo de Compose da v0.3, que usa `http://localhost:4000` para a API. (DV-36.) 
- O servidor HTTP é criado implicitamente pelo Express; não há `http.createServer`, o que será necessário para acoplar Socket.IO no futuro [Planejado].  

### 5.1.3 Arquivo `routes.ts` 

Exporta a função de montagem de rotas, que cria um roteador do Express, obtém o `AuthController` do contêiner de injeção (a classe é resolvida automaticamente porque está marcada como injetável e depende de um token de nome "AuthService") e registra exatamente três rotas:  
| Método e caminho | Middlewares na ordem | Handler | Resposta de sucesso |
|---|---|---|---|  ``
| GET /health | nenhum | função anônima | 200 com objeto contendo a mensagem "API Healthy" | ``````
| POST /auth/register | validação com createUserSchema | authController.register | 201 com o usuário público | ``````
| POST /auth/login | validação com loginUserSchema | authController.login | 200 com token e usuário público |   

Nenhuma rota usa o middleware de autenticação; não existe prefixo de versão (a v0.3 [Especificado] fala em base `/api/v1`; DV-36). A rota `/health` não é descrita em detalhe nos documentos, sendo um acréscimo do código. Todas as demais rotas especificadas (mesas, atendimentos, chamados, rotas públicas e da mesa, staff) **[Planejado/Não implementado]**; ver seção 9. 

## 5.2 Módulo `auth` 

O módulo `auth` é o único módulo completo nas camadas controller, service, repository, schema e interfaces. Ele cobre o autocadastro de um administrador e o login de administradores e garçons. Os arquivos são `auth.schema.ts`, `auth.interfaces.ts`, `auth.repository.ts`, `auth.service.ts` e `auth.controller.ts`. 

### 5.2.1 Schemas de entrada (`auth.schema.ts`) 

Dois esquemas Zod (versão 4) definem o formato aceito no corpo da requisição: 
 
- `createUserSchema`: `name` (texto), `email` (e-mail válido, usando o validador de e-mail do Zod 4) e `password` (texto). 
- `loginUserSchema`: `email` (e-mail válido) e `password` (texto).  

Os tipos TypeScript de entrada são derivados dos esquemas. Intencionalmente o cliente não envia `role`, `restaurant_id` nem hash: o servidor decide. Como os objetos Zod não são configurados como estritos, campos extras enviados são ignorados na validação, e mesmo que passem pelo corpo, o service só lê `name`, `email` e `password`. 
**Lacunas de validação [Implementado, requer validação com a equipe].** Não há tamanho mínimo ou máximo, remoção de espaços, nem política de força de senha: uma senha vazia ou um nome vazio são aceitos, pois ambos são apenas "texto". O e-mail também não é normalizado (maiúsculas e minúsculas são diferentes para o banco, que usa unicidade exata). As mensagens de erro de campo são as mensagens padrão do Zod, em inglês. (DV-23.) 

### 5.2.2 Interfaces e tipos (`auth.interfaces.ts`) 
 
- **PublicUser**: o tipo de usuário sem o hash da senha; é o que pode sair em respostas HTTP. 
- **LoginResult**: par token e usuário público. 
- **IAuthService**: contrato do service com `register` (devolve usuário público) e `login` (devolve LoginResult).  

A separação entre schema e interfaces existe porque o cliente envia `password` e o banco guarda `password_hash`. Os repositories de restaurante e de usuário NÃO vivem mais no `auth`: foram movidos para `modules/restaurants` e `modules/users` (ver 5.2.3), e o `CreateUserData` (o que o repository de usuário grava: nome, e-mail, hash da senha, papel e, opcionalmente, restaurante; produzido pelo service) acompanhou `IUserRepository`. O `auth` importa só os tipos e recebe os repositories pelo container. 

### 5.2.3 Repositories usados pelo módulo (`users/` e `restaurants/`) 

Desde a refatoração de 12/11/2026, `UserRepository` (`modules/users/users.repository.ts`, contrato em `users.repository.interface.ts`) e `RestaurantRepository` (`modules/restaurants/restaurants.repository.ts`, contrato em `restaurants.repository.interface.ts`) são módulos de dados próprios, para que `auth` e `administration` os consumam pelo container sem depender um do outro. O `auth.repository.ts` deixou de existir. 

O detalhamento método a método está na seção 6.4 (tabelas dos repositories). Em resumo: `RestaurantRepository` e `UserRepository` recebem o cliente de banco por injeção (nome "DbClient"), de modo que possam ser instanciados manualmente com um cliente de transação. `UserRepository.findByEmail` é a única busca de usuário sem filtro de restaurante (o login ainda não conhece o tenant; o e-mail é único globalmente). Todos os demais métodos de usuário exigem o identificador do restaurante. 

### 5.2.4 Fluxo de cadastro (`register`), passo a passo 

**Finalidade [Implementado].** Criar um usuário administrador a partir de nome, e-mail e senha. **Divergência importante:** a v0.3 [Especificado] (p18, RF01) diz que o cadastro "cria restaurante e Admin"; o código só cria o usuário. Não há restaurante criado, `restaurant_id` fica nulo e não há transação. O próprio código traz um TODO sobre separar a criação de outros usuários. (DV-15. Requer validação.) 
 
- **Requisição.** O cliente envia POST para `/auth/register` com nome, e-mail e senha em JSON. O interpretador JSON popula o corpo da requisição. 
- **Validação.** O middleware de validação aplica `createUserSchema` ao corpo. Se falhar, lança `ValidationError` com a lista de campos com problema, e o fluxo salta direto ao tratador global de erros (resposta 400). O controller não é executado. Se passar, chama `next`. Atenção: o middleware não substitui o corpo pelo resultado do parse; o controller recebe o corpo original (ver 5.3.1). 
- **Controller.** `AuthController.register` lê o corpo, chama `authService.register` e responde com status 201 e o JSON do usuário público. Não há try/catch: o Express 5 propaga rejeições de funções assíncronas ao tratador de erros. 
- **Service, checagem de e-mail.** Consulta `userRepository.findByEmail`. Se existir usuário, lança `ConflictError` com a mensagem "E-mail já cadastrado" (409). 
- **Service, hash da senha.** Chama `passwordHash` (scrypt com sal aleatório; ver 5.5.1). 
- **Service, montagem do dado.** Monta o objeto com nome, e-mail, hash e role fixa ADMIN. Nenhum identificador de restaurante é informado. 
- **Repository.** `userRepository.create` insere na tabela `users`. 
- **Saída.** O service remove o hash do objeto retornado e devolve o usuário público: identificador, nome, restaurante (nulo), e-mail e role.  

_Figura: **Figura 5.1** – Passo a passo do cadastro (POST /auth/register). (Ver seção 5.2.4)_ 

**Cenários.**  
| Cenário | Causa | Resultado |
|---|---|---|  
| Sucesso | Corpo válido e e-mail livre | 201 com usuário público (role ADMIN, restaurante nulo) | ``
| Corpo inválido | Campo ausente, tipo errado ou e-mail malformado | 400 ValidationError, mensagem "Dados inválidos", lista de campo e mensagem | ````
| E-mail já cadastrado | Encontrado por findByEmail | 409 ConflictError "E-mail já cadastrado" | ``
| Corrida entre dois cadastros | Ambos passam na checagem e o segundo insert viola a unicidade do e-mail no banco | Erro Prisma P2002 convertido pelo tratador em 409 ConflictError com mensagem genérica "Registro já existe" | ``
| Falha de banco ou outra falha | Qualquer exceção não prevista | 500 InternalServerError |   

**Efeitos.** Exatamente uma linha criada em `users`. Efeito colateral relevante: como o restaurante não é criado, o usuário resultante não pertence a nenhum tenant, o que enfraquece o isolamento multi-tenant (RNF01) quando o login emitir um token com `restaurantId` nulo. (DV-15, DV-17.) O service injeta o `RestaurantRepository` mas não o usa. 

### 5.2.5 Fluxo de login (`login`), passo a passo 

**Finalidade [Implementado].** Autenticar administrador ou garçom (ambos usam o mesmo fluxo; a role vem do banco) e emitir um JWT. 
 
- **Requisição e validação.** POST em `/auth/login`; o middleware aplica `loginUserSchema`. Falha leva a 400. 
- **Controller.** `AuthController.login` chama `authService.login` e responde 200 com o resultado. 
- **Busca.** `userRepository.findByEmail` localiza o usuário pelo e-mail (sem tenant). 
- **Comparação de senha.** Se o usuário existe, `comparePassword` recalcula o scrypt com o sal armazenado e compara em tempo constante. Se o usuário não existe, a comparação não é executada (valor falso direto). 
- **Decisão.** Se o usuário não existe ou a senha está errada, lança `UnauthorizedError` com a mesma mensagem "E-mail ou senha inválidos" nos dois casos, para não revelar quais e-mails existem. Observação: como o scrypt só roda quando o usuário existe, o tempo de resposta pode, em princípio, distinguir os dois casos; as notas registram esse ponto como lacuna. (DV-19.) 
- **Emissão do token.** `signToken` assina um JWT com `sub` (id do usuário), `restaurantId` (pode ser nulo) e `role`; validade lida de `JWT_EXPIRES_IN` (padrão 1 dia). 
- **Saída.** Devolve token e usuário público (sem hash).  

_Figura: **Figura 5.2** – Passo a passo do login (POST /auth/login). (Ver seção 5.2.5)_  
| Cenário | Resultado |
|---|---|  
| Credenciais corretas | 200 com token e usuário público | ``
| Corpo inválido | 400 ValidationError | ``
| E-mail inexistente | 401 UnauthorizedError "E-mail ou senha inválidos" | 
| Senha errada | 401, mesma mensagem | 
| Hash armazenado em formato inesperado (sem separador) | comparação devolve falso, portanto 401 | ``
| JWT_SECRET ausente no ambiente | exceção comum ao assinar, resultando em 500 (erro de configuração) |   
**Ausências de segurança [Planejado/Não implementado].** Não existe limite de tentativas (rate limit) no login; o guia propõe cerca de 5 tentativas por 15 minutos. Também não há renovação de token (refresh) nem lista de revogação: o JWT vale até expirar. O token emitido para um administrador sem restaurante tem `restaurantId` nulo. 

### 5.2.6 Controller (`auth.controller.ts`) 

Classe injetável cuja dependência é o service, obtida pelo nome "AuthService" (o controller depende da interface, não da classe concreta). Os dois métodos são funções-seta (atributos de instância) para que o valor de `this` não se perca quando o Express os usa como callbacks nas rotas. Cada método tem três linhas: ler o corpo (convertido por afirmação de tipo, já validado pelo middleware), chamar o service e responder. Não há regra de negócio nem tratamento de exceções. 

### 5.2.7 Tabela de códigos HTTP do módulo  
| Código | Quando | Origem |
|---|---|---|  ``
| 200 | Login bem-sucedido; /health | controller / rota | 
| 201 | Cadastro bem-sucedido | controller | ``
| 400 | Corpo inválido | ValidationError do middleware | ``
| 401 | Credenciais inválidas | UnauthorizedError do service | ``
| 409 | E-mail já cadastrado (checagem ou corrida via P2002) | ConflictError | 
| 500 | Falha inesperada | tratador global |   

## 5.3 Middlewares compartilhados 

### 5.3.1 Validação (`validator.middleware.ts`) 

**Finalidade.** Fábrica de middleware: recebe um esquema Zod e devolve a função que o aplica ao corpo da requisição. **Funcionamento.** Usa a forma segura de parse; em caso de falha, monta a lista de detalhes (um item por problema, com o campo, em notação com pontos para caminhos aninhados, e a mensagem) e lança `ValidationError`; em caso de sucesso chama `next`. 

**Limites.** Valida só o corpo (não parâmetros de rota nem query string); não substitui o corpo pelo resultado parseado, de modo que transformações do Zod (como remoção de espaços, quando forem adicionadas) e a remoção de campos extras não chegam ao controller. Quando o cliente não envia corpo JSON ou o tipo de conteúdo não é JSON, o Express 5 deixa o corpo indefinido, o que falha na validação e resulta em 400. (DV-23.) 

### 5.3.2 Autenticação (`auth.middleware.ts`, função `ensureAuthenticated`) 

**Finalidade.** Exigir um JWT válido no cabeçalho `Authorization` e identificar o usuário. **Funcionamento passo a passo:** 
 
- Se o cabeçalho não existe: `UnauthorizedError` "Token não informado" (401). 
- Separa o valor por espaço em esquema e token. Se o esquema não é exatamente "Bearer" ou o token está vazio: 401 "Token mal formatado". 
- Dentro de um bloco protegido, chama `verifyToken`; sucesso grava o campo `sub` do payload em `req.id`. Qualquer falha dentro do bloco (assinatura inválida, token expirado, payload sem `sub`, ou mesmo segredo ausente no ambiente) vira 401 "Token inválido ou expirado". 
- Chama `next`.  

_Figura: **Figura 5.3** – Fluxograma do middleware ensureAuthenticated. (Ver seção 5.3.2)_ 

**Estado atual e divergências.** O middleware só preenche `req.id`. Não preenche `restaurantId` nem `role` (embora o JWT os carregue), e não existe `ensureRole`; o guia e as notas tratam esses dois itens como próximos passos [Planejado]. Além disso, nenhuma rota usa o middleware hoje: ele está pronto, mas sem uso. (DV-17.) Por ser síncrono e usar `throw`, o Express o encaminha ao tratador de erros. Um efeito colateral registrado: a falta do `JWT_SECRET` é mascarada como "token inválido" (401), escondendo um erro de configuração que, no login, apareceria como 500. (DV-19.) 

### 5.3.3 Tratador global de erros (`error.middleware.ts`) 

**Finalidade.** Ser a rede de segurança única: todo erro lançado em middlewares, controllers e services resulta em resposta padronizada. Por isso controllers dispensam try/catch. O formato de resposta é um objeto com `error` (nome da classe do erro), `message` e, quando houver, `details`. **Ordem de decisão:** 
 
- Se o erro é uma `AppError` (ou subclasse): responde com o status dela, o nome, a mensagem e os detalhes (se definidos). 
- Se é um erro conhecido do Prisma: código P2002 (violação de unicidade) responde 409 `ConflictError` com mensagem padrão "Registro já existe"; código P2025 (registro não encontrado em update ou delete) responde 404 `NotFoundError` com mensagem padrão "Recurso não encontrado". Outros códigos do Prisma seguem para o item 3. 
- Qualquer outro erro: registra no console e responde 500 `InternalServerError` com a mensagem genérica "Erro interno do servidor", sem vazar detalhes.  

_Figura: **Figura 5.4** – Fluxograma do tratador global de erros. (Ver seção 5.3.3)_ 

**Observações.** (a) As mensagens dos casos Prisma são genéricas; um P2002 em e-mail não diz qual campo. (b) O tratador não examina o status que alguns erros de terceiros trazem: por exemplo, um JSON malformado no corpo gera, na biblioteca de leitura de corpo do Express, um erro com status 400, mas como não é `AppError` nem erro Prisma, tende a cair no ramo 500. Esta é uma dedução da leitura do código, ainda não testada: **Requer validação**. (DV-39.) (c) O formato de erro difere do especificado na v0.3 (p19): lá o erro aparece como um objeto com um campo de código, como `TOKEN_REVOKED` ou `TABLE_NOT_FOUND`; no código, o campo `error` é o nome da classe. (DV-34.) 

## 5.4 Erros da aplicação (`shared/errors`) 

`AppError` estende o erro nativo e acrescenta `statusCode` (padrão 400), `details` opcional e o nome "AppError". A documentação recomenda não usá-la diretamente nos services, e sim as subclasses de `http-errors.ts`, cada uma com mensagem padrão e nome próprio:  
| Classe | Status | Mensagem padrão | Uso previsto |
|---|---|---|---|  ``
| BadRequestError | 400 | Requisição inválida | pedido incorreto fora do esquema | ``
| ValidationError | 400 | Dados inválidos (recebe os detalhes primeiro) | falha de validação Zod | ``
| UnauthorizedError | 401 | Não autenticado | login, token ausente ou inválido | ``
| ForbiddenError | 403 | Acesso negado | falta de permissão (ainda sem uso no código) | ``
| NotFoundError | 404 | Recurso não encontrado | recurso inexistente ou de outro tenant | ``
| ConflictError | 409 | Registro já existe | duplicidade e concorrência |   

Em uso hoje: `ValidationError` (validador), `UnauthorizedError` (auth e service), `ConflictError` (service e tratador) e `NotFoundError` (apenas tratador, via P2025). `BadRequestError` e `ForbiddenError` existem sem uso. O mecanismo é simples: o `throw` interrompe a função e o tratador monta a resposta. 

## 5.5 Utilitários de segurança (`shared/utils`) 

### 5.5.1 Senha (`password.ts`) 

**[Implementado]** Uso do algoritmo scrypt do módulo criptográfico nativo do Node (versão assíncrona). `passwordHash` gera um sal aleatório de 16 bytes, deriva uma chave de 64 bytes e devolve o texto "sal:hash" com ambos em hexadecimal. `comparePassword` separa o texto armazenado em sal e hash; se faltar qualquer parte, devolve falso; caso contrário deriva a chave com o mesmo sal e com o tamanho do hash armazenado e compara com igualdade em tempo constante, o que evita ataque de temporização. A v0.2 [Especificado] (RNF05) previa argon2 ou bcrypt; o código usa scrypt sem dependência externa, o que é mais recente e aceitável, mas diverge do texto antigo. (DV-22. Decisão: vale o código.) Os parâmetros de custo do scrypt (N, r, p) não são configurados, usando os padrões do Node. 

### 5.5.2 JWT (`jwt.ts`) 

O payload é composto por `sub` (id do usuário), `restaurantId` (texto ou nulo) e `role` (ADMIN ou STAFF). O segredo vem de `JWT_SECRET`; se ausente, a leitura lança erro com mensagem de que a variável não foi definida no `.env`. `signToken` assina com a validade de `JWT_EXPIRES_IN`, padrão "1d". `verifyToken` valida assinatura e expiração e ainda rejeita payload textual ou sem `sub` do tipo texto. A variável `JWT_EXPIRES_IN` não consta na lista de variáveis da v0.3 (DV-43). O guia observa que um usuário apagado continua com token válido até 1 dia, pois a verificação não consulta o banco. 

## 5.6 Provedor do banco e contêiner de injeção 

### 5.6.1 Provedor Prisma (`shared/providers/prisma.ts`) 

Cria uma única instância do cliente Prisma (gerado em `generated/prisma`) e a exporta. Define o tipo `DbClient`, que é a união do cliente normal com o cliente de transação. Esse tipo é o mecanismo central para que os repositories funcionem tanto fora quanto dentro de uma transação interativa: no código de um service futuro, abre-se uma transação e instancia-se manualmente cada repository passando o cliente da transação em vez do cliente global. Hoje, nenhum código abre transação [Planejado]; o cadastro com restaurante e o fechamento de sessão a exigirão. 

### 5.6.2 Contêiner (`shared/container/container.ts`) 

Função `registerDependencies`, chamada no bootstrap, registra por nome (texto) as dependências: 
 
- "DbClient": valor único, o cliente Prisma. 
- Como singletons: "RestaurantRepository", "UserRepository", "TableRepository", "TableSessionRepository", "SessionTokenRepository" e "CallRepository" (cada um mapeado à implementação concreta, mas tipado pela interface). 
- "AuthService" (singleton), o único service registrado.  

Controllers não são registrados: `AuthController` é resolvido diretamente em `routes.ts` por ser injetável. Regra do projeto: todo repository ou service novo precisa ser registrado, senão a resolução falha. Não há registro de `TableService`, `SessionService`, `CallService` nem de notificador de tempo real [Planejado]. O caminho de importação do container referencia a pasta `modules/sessions` (pasta renomeada de `seassions`; ver seção 6.3). O módulo também reexporta o objeto `container` do tsyringe. A razão de depender de interfaces por nome é permitir trocar implementações em testes e usar repositories em transações. 

## 5.7 Extensão de tipos do Express (`@types/express.d.ts`) 

Acrescenta ao tipo de requisição do Express um campo opcional `id` (texto), preenchido apenas nas rotas que passam por `ensureAuthenticated`. Não declara `restaurantId`, `role` nem o contexto da mesa (`tableSession`) previstos nas notas [Planejado]. (DV-17.) 

## 5.8 Resumo de dependências do capítulo  
| Componente | Depende de | Usado por |
|---|---|---|  ``
| main.ts | server, routes, container, error.middleware | execução | ``
| routes.ts | container, validator, AuthController, schemas | main | ``
| AuthController | IAuthService (nome "AuthService") | routes | ``
| AuthService | repositories de restaurante e usuário, password, jwt, http-errors | controller | 
| Repositories | DbClient | services (futuros e auth) | ``
| ensureAuthenticated | jwt, http-errors | nenhuma rota ainda | ````
| errorHandler | AppError, http-errors, tipos Prisma | main (último use) |
