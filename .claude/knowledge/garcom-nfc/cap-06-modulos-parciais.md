# 6. Módulos parciais (tables, sessions, calls, restaurants) 

Os módulos `tables`, `sessions`, `calls` e os repositories de restaurantes, usuários e tokens de sessão têm hoje apenas a camada de acesso a dados: interface do repository e sua implementação. Não há services em funcionamento, controllers, schemas de entrada, rotas, middlewares específicos ou tempo real. Tudo o que está descrito como regra de negócio sobre esses módulos nas notas é **[Planejado/Não implementado]** e é apenas citado aqui para contextualizar o que cada método do repository foi pensado para atender. As regras de negócio e os fluxos serão detalhados na seção 7. 

## 6.1 Convenções comuns a todos os repositories 
 
- **Injeção do cliente.** Cada repository é uma classe injetável que recebe o `DbClient` no construtor. Pode receber o cliente global (uso normal, singleton do contêiner) ou o cliente de uma transação (instanciando a classe manualmente), conforme definido em 5.6.1. 
- **Regra de tenant.** Quase todo método recebe o identificador do restaurante como primeiro parâmetro e o inclui no filtro de busca, atualização ou exclusão. O objetivo é o isolamento por restaurante exigido por RNF01 (toda consulta filtrada por `restaurant_id`): um identificador de recurso de outro restaurante simplesmente não é encontrado. Nos métodos de escrita, o Prisma lança o erro P2025 quando nenhum registro satisfaz o filtro; o tratador de erros converte em 404 (seção 5.3.3). As exceções (métodos sem tenant) estão assinaladas em cada tabela e são justificadas por rotas públicas, login, jobs ou tabelas sem a coluna. 
- **Repository não decide.** Não gera hash, não valida permissão e não lança erros de negócio: só lê e grava. Quem decide é o service [Planejado]. 
- **Tipos de entrada.** Cada módulo declara tipos de dados de criação e atualização com apenas os campos permitidos, evitando que o service passe campos arbitrários. 
- **Operações em lote.** Dois métodos (`revokeAllBySession` e `cancelOpenBySession`) usam atualização em massa e devolvem apenas a quantidade de registros afetados, pensados para o encerramento de sessão em transação.  

_Figura: **Figura 6.1** – Métodos dos repositories de restaurantes, usuários e mesas (em negrito, exceções ao filtro de tenant). (Ver seções 6.2 e 6.4)_ 

_Figura: **Figura 6.2** – Métodos dos repositories de sessões, tokens e chamados. (Ver seções 6.3 a 6.5)_ 

## 6.2 Módulo `tables` 

**Estado.** Arquivos existentes: `tables.repository.interface.ts` e `tables.repository.ts` (completos); `tables.service.ts` (esqueleto); `tables.controller.ts` e `tables.schemas.ts` (arquivos vazios). O esqueleto do service é uma classe com nome iniciado em minúscula (`tablesService`), sem decorator de injeção e com um único método `create` vazio; portanto não é resolvido pelo contêiner nem está registrado. O nome do arquivo de schemas está no plural, enquanto as notas citam o singular (`tables.schema.ts`). (DV-45.) 

**Tipos.** `CreateTableData` (identificador do restaurante, rótulo e código público) e `TableWithRestaurant` (mesa com os campos `id`, `name` e `slug` do restaurante). 

### 6.2.1 Métodos do `TableRepository`  
| Método | Entradas | O que faz | Tenant | Finalidade |
|---|---|---|---|---|  ``````
| create | restaurante, rótulo, código público | Insere uma mesa na tabela tables; active assume true por padrão do schema | restaurante vem no próprio dado | Cadastro de mesa pelo administrador | ``
| findById | restaurante, id | Busca uma mesa por id restrita ao restaurante; devolve nulo se não houver | filtra | Obter a mesa para editar, ativar, desativar | ``****
| findByPublicCode | código público | Busca pela chave única do código impresso na placa; inclui o restaurante (id, nome, slug) | sem filtro: o tenant é descoberto a partir da mesa | Rota pública do QR Code/NFC, onde o cliente não tem login | ``
| findMany | restaurante, filtro opcional de ativa | Lista as mesas do restaurante ordenadas por rótulo crescente; se o filtro de ativa não for informado, é ignorado e retorna ativas e inativas | filtra | Painel do administrador | ``
| update | restaurante, id, dados | Atualiza a mesa; erro P2025 se não encontrada no restaurante | filtra | Renomear, ativar, desativar, regenerar código | ``
| delete | restaurante, id | Remove a mesa; erro P2025 se inexistente | filtra | Previsto só por completude; as notas recomendam desativar em vez de apagar, pois sessões e chamados têm chave estrangeira para a mesa |   

**Transação.** Nenhum método usa transação por si; todos podem ser usados dentro de uma, via `DbClient`. 

**O que falta [Planejado].** Schemas Zod de criação e renomeação; service com geração do código público (nas notas, gerado com bytes aleatórios), listagem, renomear, ativar, desativar (recusando se há sessão ativa na mesa, com 409), regenerar código (a placa antiga deixa de funcionar) e a busca "ou falha" com 404 para mesa de outro restaurante; controller; rotas restritas ao papel ADMIN (dependem do `ensureRole`, inexistente); registro do service no contêiner. Nota: a geração de código e o endpoint de QR Code não existem; também não há dependência de biblioteca de QR Code. 

## 6.3 Módulo de sessões (pasta `sessions`) 

**Estado.** Apenas `sessions.repository.interface.ts` e `sessions.repository.ts`, que contêm dois repositories: `TableSessionRepository` (tabela `table_sessions`, o atendimento da mesa) e `SessionTokenRepository` (tabela `session_tokens`, um token por aparelho). A pasta se chamava `seassions` (erro de digitação) e foi renomeada para `sessions` em 12/11/2026, com os imports do contêiner atualizados (DV-45). Nesta seção, "sessão" é o mesmo conceito que a v0.3 chama de "atendimento". 

### 6.3.1 Tipos 
 
- `CreateTableSessionData`: restaurante, mesa e instante de expiração. 
- `UpdateTableSessionData`: campos opcionais de status (ACTIVE ou CLOSED), `keep_open`, `expires_at`, `closed_reason` (STAFF ou TIMEOUT) e `closed_by` (usuário). 
- `TableSessionListItem`: sessão com o rótulo da mesa e a contagem de tokens. 
- `CreateSessionTokenData`: sessão e hash do token. `SessionTokenWithSession`: token com a sessão associada.  

### 6.3.2 Métodos do `TableSessionRepository`  
| Método | Entradas | O que faz | Tenant | Finalidade |
|---|---|---|---|---|  ````
| create | restaurante, mesa, expiração | Insere a sessão (status ACTIVE, keep_open falso por padrão) | restaurante no dado | Abrir sessão da mesa | ``
| findById | restaurante, id | Busca uma sessão do restaurante | filtra | Fechar, alterar "manter aberta" | ``****
| findActiveByTable | mesa | Primeira sessão ACTIVE da mesa | sem restaurante (a mesa já é específica) | Saber se a mesa está aberta; atende a regra de uma sessão ativa por mesa e o fluxo "encontrar ou criar" | ``
| findMany | restaurante, filtro opcional de status | Lista sessões do restaurante, incluindo id e rótulo da mesa e a contagem de tokens não revogados (celulares ativos); sem ordenação definida | filtra | Painel "mesas em atendimento" | ````****
| findExpired | instante atual | Lista sessões ACTIVE com keep_open falso e expiração menor ou igual ao instante | sem tenant: varre todos os restaurantes | Job de expiração (RF12/RN10) | ````
| update | restaurante, id, dados | Atualiza status, keep_open, expiração, motivo e autor do fechamento; P2025 se inexistente | filtra | Fechar a sessão, manter aberta | ``
| delete | restaurante, id | Remove a sessão | filtra | Previsto por completude |   

O banco garante, por índice único parcial (`table_sessions_one_active`, na migration de criação), no máximo uma sessão ACTIVE por mesa: a segunda criação simultânea falha com P2002, que o tratador converte em 409. O repository não faz essa checagem por conta própria. 

### 6.3.3 Métodos do `SessionTokenRepository` 

A tabela `session_tokens` não tem coluna de restaurante; o isolamento é obtido por meio da sessão (relação), nos métodos que recebem o restaurante.  
| Método | Entradas | O que faz | Tenant | Finalidade |
|---|---|---|---|---|  ``
| create | sessão, hash do token | Insere o token de um aparelho (somente o hash é gravado) | não aplicável | Entrada do cliente na mesa | ``****
| findById | id | Busca por id | sem tenant | Consultas internas por identificador | ``****
| findByHash | hash do token | Busca pelo hash único e inclui a sessão | sem filtro: o tenant sai da sessão incluída | Validação do token do cliente a cada requisição (middleware futuro) | ``
| findManyBySession | restaurante, sessão | Lista os tokens da sessão exigindo que a sessão pertença ao restaurante | filtra via sessão | Listar aparelhos da mesa | ``****
| update | id, dados | Atualiza um token (por exemplo, revogá-lo) | sem tenant | Revogação individual | ``
| revokeAllBySession | sessão, instante | Em lote, grava o instante de revogação em todos os tokens ainda não revogados da sessão; devolve a contagem | sem restaurante (a sessão já foi validada antes) | Encerramento de sessão: tokens deixam de valer (RN de revogação) | ``****
| delete | id | Remove o token | sem tenant | Previsto por completude |   

Observação de segurança: três métodos de token (`findById`, `update`, `delete`) não verificam tenant; o chamador (futuro service) deverá garantir que o id pertence ao restaurante, por exemplo via a sessão. Isso é consistente com o comentário do código, que diz que o tenant é checado pela sessão, mas hoje só `findManyBySession` o faz. (DV-33. Requer validação.) 

### 6.3.4 Uso em transação 

O fechamento de uma sessão é descrito nas notas como uma única transação com três escritas: atualizar a sessão para CLOSED com motivo e autor, revogar todos os tokens (`revokeAllBySession`) e cancelar os chamados em aberto (`cancelOpenBySession`, do módulo de chamados). Por isso os três repositories são instanciados com o cliente da transação; os avisos em tempo real devem sair somente depois da confirmação. **[Planejado/Não implementado]**: nenhuma transação é aberta hoje. 

### 6.3.5 O que falta 
 
- Service: abrir sessão (recusar mesa inexistente, inativa ou já aberta, com expiração calculada por uma duração fixa), entrada do cliente pelo código público (gerar token aleatório, gravar só o hash, devolvê-lo uma única vez), fechar (motivo STAFF ou TIMEOUT), manter aberta, listar ativas e expirar em lote. A duração padrão diverge entre documentos: a v0.3 [Especificado] fala em 4 horas (variável `TABLE_SESSION_TTL` de 14400 s), enquanto as notas de módulos e o guia usam 3 horas como exemplo. (DV-03. Decisão: vale a v0.3 para o produto; nada no código fixa o valor.) 
- Utilitário de geração e hash de tokens (`shared/utils/token.ts`, inexistente), middleware de validação do token do cliente (`x-table-token`), controllers, schemas, rotas, job de expiração e notificador. 
- Definição de quando a sessão começa: a v0.3 diz "no primeiro chamado" (glossário) e "na entrada pela página" (API), e o README do back-end indica que o garçom abre a mesa manualmente. (DV-01. Requer validação.)  

## 6.4 Repositories de restaurantes e usuários (módulos `restaurants` e `users`) 

Residem em `modules/restaurants/restaurants.repository.ts` e `modules/users/users.repository.ts` (antes ficavam em `auth.repository.ts`) e são consumidos pelo `auth` e, futuramente, pelo `administration`. Como o módulo de autenticação os usa de fato apenas em parte, o quadro abaixo indica o uso atual. 

### 6.4.1 `RestaurantRepository`  
| Método | O que faz | Tenant | Uso atual |
|---|---|---|---|  ``
| create | Insere restaurante (nome, slug único) | a entidade é o tenant | nenhum (o cadastro não o chama) | ``
| findById | Busca por id | idem | nenhum | ``
| findBySlug | Busca por slug único | idem | nenhum; não citado no PDF das notas, extra do código | ``
| update | Atualiza por id; P2025 se inexistente | idem | nenhum | ``
| delete | Remove por id | idem | nenhum |   

O cadastro de restaurante com geração de slug (nome do restaurante no corpo, criação de restaurante e administrador numa mesma transação) é o principal item **[Planejado/Não implementado]** deste repository. O guia propõe, para evitar restaurantes órfãos quando o e-mail já existe, uma transação ou escrita aninhada; o `DbClient` foi desenhado para isso. O esquema de entrada do cadastro hoje não tem campo de nome de restaurante. (DV-15.) 

### 6.4.2 `UserRepository`  
| Método | O que faz | Tenant | Uso atual |
|---|---|---|---|  ``
| create | Insere usuário (nome, e-mail, hash, role, restaurante opcional) | restaurante no dado (opcional) | cadastro | ``****
| findByEmail | Busca por e-mail único global | sem tenant (o login ainda não sabe o restaurante) | cadastro (checagem) e login | ``
| findById | Busca por id dentro do restaurante | filtra | nenhum | ``
| findMany | Lista usuários do restaurante | filtra | nenhum | ``
| update | Atualiza usuário do restaurante | filtra | nenhum | ``
| delete | Remove usuário do restaurante | filtra | nenhum |   

Consequências do e-mail único global: a mesma pessoa não pode ser funcionária de dois restaurantes com o mesmo e-mail. O guia registra o ponto sem discutir; fica como decisão a validar. Falta o módulo de usuários (POST/GET/DELETE em `/users`, administrador criando garçons com o restaurante dele), incluindo regra de "último administrador" e a dúvida da v0.3 (ponto a validar 2) sobre se o garçom terá login individual ou um único acesso do balcão. 

## 6.5 Módulo `calls` 

**Estado.** Apenas `calls.repository.interface.ts` e `calls.repository.ts`. Chamados têm tipo WAITER ou BILL e estado OPEN, DONE ou CANCELLED. 

**Tipos.** `CreateCallData` (restaurante, sessão, token do aparelho e tipo); `UpdateCallData` (status, instante de conclusão e usuário que concluiu); `CallWithTable` (chamado com a sessão e, dela, id e rótulo da mesa).  
| Método | Entradas | O que faz | Tenant | Finalidade |
|---|---|---|---|---|  ``
| create | restaurante, sessão, token, tipo | Insere chamado com status OPEN (padrão do schema) e instante de criação automático | no dado | Cliente chama garçom ou pede conta | ``
| findById | restaurante, id | Busca um chamado do restaurante | filtra | Consulta e atendimento | ``
| findMany | restaurante, filtro de status | Lista por ordem de criação crescente (chegada), incluindo sessão e mesa (id, rótulo) | filtra | Tela do balcão: um card por chamado (índice composto de restaurante e status no schema acelera esta consulta) | ``
| findManyBySession | restaurante, sessão, filtro | Lista os chamados da sessão, ordem crescente | filtra por restaurante e sessão | Cliente vê seus chamados; checar duplicidade | ``
| update | restaurante, id, dados | Atualiza status, conclusão e autor; P2025 se inexistente | filtra | Concluir ou cancelar | ``****
| cancelOpenBySession | sessão | Em lote, muda de OPEN para CANCELLED todos os chamados abertos da sessão; devolve contagem | sem restaurante (a sessão já foi validada) | Parte da transação de fechamento de sessão | ``
| delete | restaurante, id | Remove o chamado | filtra | Por completude |   

**Concorrência.** O método de atualização genérico não é adequado para "atender", pois escreveria por cima de outro garçom. As notas propõem um método novo de atualização em massa com status OPEN na condição (`markDone`, ausente no código): só um dos dois garçons concomitantes obtém contagem 1; o outro recebe 409. O mesmo vale para cancelamento pelo cliente (`cancelBySession`, também ausente). 

**O que falta [Planejado].** Service (criar, listar os meus, cancelar, listar abertos, atender), controller, schemas (tipo WAITER ou BILL), rotas do cliente (`/me/calls`) e do garçom (`/calls`, atender), emissão em tempo real, e o índice parcial "um chamado OPEN por tipo por sessão" (`calls_one_open_per_type`), que não existe na migration. Também ausentes: limite de chamados e erro 429 (RNF06, marcado como proposto), códigos de erro `TOKEN_REVOKED` e `TABLE_NOT_FOUND` da v0.3. 

## 6.6 Resumo do que falta por módulo 

Em todos os módulos deste capítulo, o repository está completo; faltam service, controller, schemas e rotas (a única exceção é `auth`, que tem tudo, com `register` incompleto, 2 rotas e sem `ensureRole`). Em `tables` o service é um esqueleto vazio e falta a geração do código público; em `sessions` faltam `token.ts`, o middleware da mesa, o job e o notificador; em `calls` faltam `markDone`, `cancelBySession`, o índice parcial, o tempo real e o limite; em `restaurants` falta a criação junto com o cadastro; o módulo futuro `users` (criação de garçons) depende dos repositories já existentes em `auth`. O quadro completo por módulo está em 9.1.
