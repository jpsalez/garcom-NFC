# 6. Módulos de domínio (tables, sessions, calls, users, administration, restaurants) 

> **Atualização 14/11/2026.** Este capítulo tinha o título "Módulos parciais" quando só existiam os repositories. Todos os módulos abaixo estão implementados em todas as camadas (repository, service, controller, schemas e rotas) e cobertos por testes (`back-end/tests`). O texto descreve o código atual; o histórico está no Apêndice A.

Os módulos `tables`, `sessions`, `calls`, `users`, `administration` e `restaurants` formam o domínio da API. Cada um segue o molde do capítulo 3: schemas Zod, interfaces, repository, service e controller; as rotas ficam em `routes.ts` (capítulo 8). Os services de `tables` e `administration` dependem do `SessionsService` (para encerrar atendimentos ao desativar mesa ou restaurante); fora essa exceção, um service usa repositories de outros módulos e nunca services.

## 6.1 Convenções comuns a todos os repositories 
 
- **Injeção do cliente.** Cada repository é uma classe injetável que recebe o `DbClient` no construtor. Pode receber o cliente global (uso normal, singleton do contêiner) ou o cliente de uma transação (instanciando a classe manualmente, como `new SessionTokenRepository(tx)`), conforme 5.6.1. 
- **Regra de tenant.** Todo método de dados de restaurante recebe o identificador do restaurante como **primeiro** parâmetro e o inclui no filtro de busca, atualização ou exclusão (RNF01): um recurso de outro restaurante simplesmente não é encontrado. O `restaurantId` vem do JWT, nunca do cliente. O script `check_tenant.py` varre os repositories atrás de métodos sem o filtro. 
- **Repository não decide.** Não gera hash, não valida permissão e não lança erros de negócio: só lê e grava. Quem decide é o service. 
- **Tipos de entrada.** Cada módulo declara tipos de dados de criação e atualização com apenas os campos permitidos. 
- **Operações condicionais e em lote.** `closeIfActive`, `markDone`, `revokeAllBySession` e `cancelOpenBySession` usam atualização com condição de estado e devolvem a contagem de linhas afetadas; é assim que se resolve a concorrência (quem perde recebe `count = 0`).  

_Figura: **Figura 6.1** – Métodos dos repositories de restaurantes, usuários e mesas (em negrito, exceções ao filtro de tenant). (Ver seções 6.2 e 6.4)_ 

_Figura: **Figura 6.2** – Métodos dos repositories de sessões, tokens e chamados. (Ver seções 6.3 a 6.5)_ 

## 6.2 Módulo `tables` 

**[Implementado]** Arquivos: `tables.repository.interface.ts`, `tables.repository.ts`, `tables.service.ts`, `tables.controller.ts`, `tables.schemas.ts` e `tables.interfaces.ts`; mais `shared/utils/public-url.ts` (`tablePublicUrl(code)` = `<PUBLIC_APP_URL>/m/<public_code>`, DEC-05) e `shared/utils/token.ts` (`generatePublicCode`). Testes em `tests/tables.test.ts`. 

**Regras do `TablesService`.** 
 
- Listar, criar e editar devolvem a mesa com `public_url`. Criar gera o `public_code` de 12 caracteres (alfabeto sem ambíguos, `crypto.randomInt`); nomes repetidos são permitidos. 
- Editar (rótulo e `active`): mesa de outro restaurante dá 404. Desativar (`active: false`) primeiro desativa e depois encerra o atendimento aberto da mesa (`closeActiveOfTable`, motivo STAFF, `closed_by` = quem desativou). 
- `GET /tables/:id/qrcode` devolve o SVG; gerar o QR de mesa inativa a reativa. 
- Excluir: 409 `TABLE_HAS_SESSIONS` se a mesa tem histórico de atendimentos ("desative em vez de excluir"); senão, exclusão definitiva (204). Uma corrida em que a mesa ganha atendimento durante a exclusão cai no P2003 (409). 
- Permissões: OWNER cria, edita, gera QR e exclui; STAFF só lista; SUPER_ADMIN não usa `/tables`. 

### 6.2.1 Métodos do `TableRepository`  
| Método | Entradas | O que faz | Tenant | Finalidade |
|---|---|---|---|---|
| create | dados (restaurante, rótulo, código público) | Insere uma mesa; `active` assume true | restaurante vem no próprio dado | Cadastro de mesa pelo OWNER |
| findById | restaurante, id | Busca uma mesa restrita ao restaurante; nulo se não houver | filtra | Editar, gerar QR, excluir |
| findByPublicCode | código público | Busca pela chave única do código impresso; inclui o restaurante (id, nome, slug, `active`) | sem filtro: o tenant é descoberto a partir da mesa | Scan do QR Code/NFC, onde o cliente não tem login |
| findMany | restaurante, filtro opcional de ativa | Lista as mesas do restaurante por rótulo crescente | filtra | Painel `/admin/mesas` |
| update | restaurante, id, dados | Atualiza a mesa; P2025 se não encontrada | filtra | Renomear, ativar, desativar |
| hasSessions | restaurante, id | Informa se há atendimentos registrados para a mesa | filtra | Decidir entre excluir e desativar |
| delete | restaurante, id | Remove a mesa; P2025 se inexistente | filtra | Exclusão de mesa sem histórico |

## 6.3 Módulo `sessions` (atendimentos) 

**[Implementado]** Arquivos: `sessions.repository.interface.ts`, `sessions.repository.ts` (dois repositories: `TableSessionRepository` e `SessionTokenRepository`), `sessions.service.ts`, `sessions.controller.ts`, `sessions.interfaces.ts` e `sessions.schemas.ts` (só a query de `GET /sessions`). Testes em `tests/sessions.test.ts`, `tests/session-expiry.test.ts` e `tests/table-session-index.test.ts`. 

### 6.3.1 Regras do `SessionsService` 
 
- **`scan(publicCode)`** (rota pública): código fora do formato dá 404 sem consultar o banco; mesa inexistente, inativa ou de restaurante desativado dá o mesmo 404. Encontra o atendimento ativo da mesa ou abre um novo (4 h). Se dois scans abrem ao mesmo tempo, o índice `table_sessions_one_active` barra o segundo, que usa o atendimento vencedor. Cada scan gera um token novo (`generateSessionToken`), grava só o hash e devolve `{ token, expires_at, table: { label }, restaurant: { name } }`. 
- **`open`** (balcão): 404 se a mesa não é do restaurante; 409 `TABLE_INACTIVE` se inativa; 409 `SESSION_ALREADY_ACTIVE` se já há atendimento ativo. Emite `session:opened`. 
- **`close`**: 404 se não é do restaurante; 409 `SESSION_CLOSED` se já encerrado. Faz o fechamento atômico (ver 6.3.4). 
- **`extend`** (também é o "manter aberto", DEC-09): acrescenta `TABLE_SESSION_TTL` (4 h) a partir do maior entre o vencimento atual e agora; emite `session:extended`. 
- **`list`**: `GET /sessions?status=&limit=&offset=` (ACTIVE por padrão), com o rótulo da mesa e a contagem de tokens não revogados. 
- **`expireDue`** (job): busca as vencidas de todos os restaurantes e encerra cada uma com TIMEOUT, uma por vez; a falha de uma não derruba as demais. 
- **`closeActiveOfTable` e `closeAllActive`**: usados ao desativar mesa ou restaurante. 
- **Segunda camada da expiração:** `findActive` encerra com TIMEOUT a sessão vencida no primeiro uso, mesmo que o job ainda não tenha rodado. 

### 6.3.2 Métodos do `TableSessionRepository`  
| Método | Entradas | O que faz | Tenant | Finalidade |
|---|---|---|---|---|
| create | restaurante, mesa, expiração | Insere a sessão (status ACTIVE, keep_open falso) | restaurante no dado | Abrir atendimento |
| findById | restaurante, id | Busca uma sessão do restaurante | filtra | Fechar, estender |
| findActiveByTable | restaurante, mesa | Primeira sessão ACTIVE da mesa | filtra | Encontrar ou criar; regra de uma sessão ativa por mesa |
| findMany | restaurante, filtro de status | Lista sessões do restaurante com id e rótulo da mesa e a contagem de tokens não revogados | filtra | Painel de mesas em atendimento |
| findExpired | instante atual | Lista sessões ACTIVE com keep_open falso e expiração menor ou igual ao instante | sem tenant: varre todos os restaurantes | Job de expiração (RF12/RN10) |
| extendIfActive | restaurante, id, nova expiração | Atualiza `expires_at` **somente se ainda ACTIVE** (updateMany) e devolve a contagem | filtra | Estender sem desfazer um encerramento simultâneo |
| closeIfActive | restaurante, id, dados | Fecha **somente se ainda ACTIVE** (updateMany) e devolve a contagem | filtra | Fechamento atômico sem corrida |
| lockActive | restaurante, sessão | Trava a linha da sessão ativa (`FOR SHARE`) dentro de uma transação | filtra | Criar chamado sem corrida com o encerramento |

O banco garante, por índice único parcial (`table_sessions_one_active`), no máximo uma sessão ACTIVE por mesa. 

### 6.3.3 Métodos do `SessionTokenRepository` 

A tabela `session_tokens` não tem coluna de restaurante; o isolamento vem da sessão. O módulo não expõe mais `findById`, `update` e `delete` de token (removidos na revisão geral como código morto).  
| Método | Entradas | O que faz | Tenant | Finalidade |
|---|---|---|---|---|
| create | sessão, hash do token | Insere o token de um aparelho (somente o hash é gravado) | não aplicável | Scan do cliente |
| findByHash | hash do token | Busca pelo hash único e inclui a sessão e a mesa | sem filtro: o tenant sai da sessão incluída | `ensureTableToken` a cada chamada do cliente |
| revokeAllBySession | sessão, instante | Em lote, grava o instante de revogação em todos os tokens ainda não revogados; devolve a contagem | sem restaurante (a sessão já foi validada) | Encerramento do atendimento (RN09) |

### 6.3.4 Uso em transação 

O fechamento (`finish`, usado por encerrar, expirar e desativar) é uma única transação com três escritas: `closeIfActive` (sessão CLOSED com motivo e autor), `revokeAllBySession` e `cancelOpenBySession` (do módulo de chamados). Os três repositories são instanciados com o cliente transacional (`new TableSessionRepository(tx)` etc.). Se outro pedido encerrou antes (`count = 0`), o fechamento devolve nulo e não emite evento. Só depois do commit sai o `session:closed` (`{ id, reason }`) para a sala do restaurante. 

### 6.3.5 Limitações conhecidas 
 
- `extend` é condicional (`extendIfActive`): se o atendimento foi encerrado entre a leitura e a escrita, nada é estendido nem anunciado e a resposta é 409 `SESSION_CLOSED`. 
- O job de expiração roda no processo da API (instância única); com mais de uma instância seria preciso coordenar. 
- O aviso de 15 min antes de vencer (DEC-02) é calculado no front a partir de `expires_at`; a API não o emite. 
- A listagem usa `limit` e `offset` (resposta continua sendo uma lista); não há contagem total nem cursor. 

## 6.4 Módulos `restaurants`, `users` e `administration` 

### 6.4.1 `RestaurantRepository`  
| Método | O que faz | Tenant | Uso atual |
|---|---|---|---|
| create | Insere restaurante (nome, slug único) | a entidade é o tenant | register e `POST /admin/restaurants` |
| findAll | Lista restaurantes | idem | `GET /admin/restaurants` |
| findById | Busca por id | idem | login (restaurante ativo), `UsersService.create`, administração |
| findBySlug | Busca por slug único | idem | register (sufixo em colisão) e administração |
| update | Atualiza por id; P2025 se inexistente | idem | `PATCH /admin/restaurants/:id` (ativar e desativar) |

`slug.ts` traz `slugify` e `withRandomSuffix`. O `delete` de restaurante foi removido (restaurante não se exclui, desativa-se). 

### 6.4.2 `UserRepository`  
| Método | O que faz | Tenant | Uso atual |
|---|---|---|---|
| create | Insere usuário (nome, e-mail, hash, role, restaurante, categoria) | restaurante no dado | register, `/staff` e `/admin/.../users` |
| findByEmail | Busca por e-mail único global | sem tenant (o login ainda não sabe o restaurante) | register (checagem), login, criação de usuário |
| findForAuth | Busca por id com o restaurante (para `active`) | sem tenant | `ensureAuthenticated` (cache miss) |
| findById | Busca por id dentro do restaurante | filtra | editar e excluir |
| findMany | Lista usuários do restaurante | filtra | listagens e regra do último OWNER |
| update | Atualiza usuário do restaurante | filtra | nome, categoria e `active` |
| delete | Remove usuário do restaurante | filtra | exclusão (`closed_by` e `done_by` viram nulos) |

### 6.4.3 `UsersService` e `StaffController` (equipe do OWNER) 

Rotas `GET/POST /staff` e `PATCH/DELETE /staff/:id`, só OWNER, sempre com o `restaurantId` do token e restritas a usuários STAFF (outro papel ou outro restaurante dá 404). Regras: e-mail duplicado dá 409 "E-mail já cadastrado"; criar usuário em restaurante desativado dá 409 `RESTAURANT_INACTIVE` (DEC-13); `category` só vale para STAFF (400 caso contrário); desativar ou excluir o último OWNER ativo dá 409 (a leitura da equipe e a escrita rodam numa transação que trava a linha do restaurante com `RestaurantRepository.lock`, então dois pedidos simultâneos não passam os dois); ao editar ou excluir, o cache de autenticação é invalidado e, ao desativar ou excluir, o socket do usuário é derrubado. O mesmo service atende o SUPER_ADMIN com a lista de papéis permitidos. 

### 6.4.4 `AdministrationService` (SUPER_ADMIN) 

Arquivos: `administration.service.ts`, `administration.schema.ts` (criar restaurante e ativar ou desativar), `administration.controller.ts` e `administration.interfaces.ts`. Rotas `/admin/restaurants`: criar (slug em uso dá 409), listar, ativar ou desativar e gerenciar usuários de qualquer restaurante (`/admin/restaurants/:restaurantId/users`). Desativar um restaurante invalida o cache de todos os usuários dele, encerra os atendimentos ativos (`closeAllActive`, que não são reabertos ao reativar) e derruba os sockets (`disconnectRestaurant`). O primeiro SUPER_ADMIN vem do seed (`npm run db:seed:super-admin`). 

## 6.5 Módulo `calls` 

**[Implementado]** Arquivos: `calls.service.ts`, `calls.controller.ts`, `calls.interfaces.ts`, `calls.schemas.ts`, `calls.repository.ts` e `calls.repository.interface.ts`. Testes em `tests/calls.test.ts` e `tests/realtime.test.ts`. Chamados têm tipo WAITER ou BILL e estado OPEN, DONE ou CANCELLED. 

### 6.5.1 Regras do `CallsService` 
 
- **`create`** (cliente, `POST /public/calls`, protegida por `ensureTableToken` e pelo limiter de 10 chamados por 5 min por token): se já há chamado OPEN do tipo na sessão, devolve-o (200, `created: false`) com o `created_at` original; senão abre uma transação, trava a sessão (`lockActive`, `FOR SHARE`) e cria o chamado; se a sessão encerrou nesse intervalo, o token deixa de valer (401). Toques simultâneos: o índice `calls_one_open_per_type` barra o segundo e o service devolve o que venceu. Emite `call:created` só depois do commit. 
- **`list`** (balcão, `GET /calls?status=&since=`): devolve `{ serverTime, calls }`, com o rótulo da mesa, em ordem de chegada; `since` filtra por `created_at` (usado para "concluídos hoje"). 
- **`done`** (`PATCH /calls/:id/done`): `markDone` condicional (`WHERE status = OPEN`) grava `done_by` = usuário do token. 404 se o chamado não é do restaurante; 409 `CALL_NOT_OPEN` se já finalizado ou cancelado. Emite `call:done`. 

### 6.5.2 Métodos do `CallRepository` 
| Método | Entradas | O que faz | Tenant | Finalidade |
|---|---|---|---|---|
| create | dados (restaurante, sessão, token, tipo) | Insere chamado com status OPEN e `created_at` automático | no dado | Cliente chama garçom ou pede conta |
| findById | restaurante, id | Busca um chamado do restaurante | filtra | Consulta após finalizar |
| findOpen | restaurante, sessão, tipo | Chamado OPEN do tipo na sessão | filtra | Repetição devolve o existente (DEC-03) |
| findMany | restaurante, status, since | Lista por ordem de chegada, com sessão e mesa (índice `restaurant_id, status`) | filtra | Tela do balcão |
| markDone | restaurante, id, doneBy | Atualização condicional a OPEN; devolve a contagem | filtra | Finalizar sem sobrescrever outro garçom |
| cancelOpenBySession | sessão | Em lote, OPEN para CANCELLED; devolve a contagem | sem restaurante (a sessão já foi validada) | Parte da transação de fechamento |

### 6.5.3 Fora do MVP 

`GET/DELETE /me/calls` (DEC-08: o cliente não acompanha o chamado) e os códigos `TOKEN_REVOKED` e `TABLE_NOT_FOUND` da v0.3 (o 401 do token usa mensagem única e o scan responde 404 genérico). Não há evento `call:cancelled`: `session:closed` limpa os cards da sessão. 

## 6.6 Resumo por módulo 

| Módulo | Estado | Pendências |
|---|---|---|
| auth | Completo | telas de recuperação de senha no front |
| users e administration | Completo | tela do SUPER_ADMIN no front |
| restaurants | Completo | não há exclusão (por desenho) |
| tables | Completo | `/deactivate`, `/activate` e `/regenerate-code` não foram feitos (desativar é um PATCH) |
| sessions | Completo | aviso de 15 min só no front |
| calls | Completo | `/me/calls` fora do MVP |
| realtime e job | Completo (instância única) | Redis adapter e lock do job para várias instâncias |
