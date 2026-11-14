# 8. API, tempo real, segurança, configuração e erros 

## 8.1 Convenções gerais da API 
 
- **[Implementado]** Base `/api/v1`, corpos JSON. Usuários do balcão e do OWNER enviam `Authorization: Bearer` com JWT; a mesa envia o cabeçalho `X-Table-Token` (v0.3; a v0.2 usava `X-Table-Session` para um token compartilhado, DV-24).
- **[Implementado, 14/11/2026]** Todas as rotas são montadas sob `/api/v1` (DEC-11), inclusive `GET /api/v1/health` (usado no healthcheck do Compose); `/docs` fica fora do prefixo. O erro sempre tem o formato `{ error, code, message, details? }` (DEC-12): `code` é estável (`BAD_REQUEST`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_REQUESTS`, `INTERNAL_ERROR`) e os erros novos têm código próprio (`TABLE_HAS_SESSIONS`, `RESTAURANT_INACTIVE`). 
- Rotas "públicas" não exigem usuário; as "da mesa" exigem token de aparelho; as demais exigem JWT e papel.  

## 8.2 Endpoints REST 

Todas as rotas abaixo estão implementadas (27 no total) e montadas sob `/api/v1`. Os caminhos seguem a v0.3, com as diferenças indicadas. As rotas de OWNER e STAFF usam sempre o `restaurantId` do token; as de `:id` validam UUID (400 se malformado). 

### 8.2.1 Públicos (sem autenticação)  
| Método e caminho | Finalidade | Entrada e saída | Observações |
|---|---|---|---|
| GET /health | Verificar se a API responde | Sem entrada; 200 `{ message: "API Healthy" }` | Healthcheck do compose |
| POST /auth/register | Autocadastro: restaurante + OWNER (RF01) | Entrada: name, email, password (8 a 128), restaurantName; 201 `{ user, restaurant }` | Fluxo B em transação; e-mail duplicado com erro genérico; 5 por hora por IP |
| POST /auth/login | Obter JWT | Entrada: email, password; 200 `{ token, user }`; 401 "E-mail ou senha inválidos" | 10 por 15 min por IP+e-mail e 30 por 15 min por IP |
| POST /public/tables/:code/scan | Entrar no atendimento ativo ou abrir; devolve o token do aparelho | 200 `{ token, expires_at, table: { label }, restaurant: { name } }`; 404 se a mesa não existe, está inativa ou o restaurante está desativado | POST por ter efeito colateral; 30 por 15 min por IP+mesa; substitui `GET /public/tables/:code` e `POST /public/tables/:code/token` da v0.3 |

### 8.2.2 Da mesa (token de aparelho)  
| Método e caminho | Finalidade | Entrada e saída | Observações |
|---|---|---|---|
| POST /public/calls | Chamar garçom ou pedir conta | Corpo `{ type: WAITER \| BILL }` e cabeçalho `X-Table-Token`; 201 (criou) ou 200 (já havia OPEN do tipo) com `{ id, session_id, type, status, created_at, done_at, table: { label } }` | 401 para token ausente, desconhecido, revogado, sessão não ACTIVE ou vencida; 429 `TOO_MANY_REQUESTS` (10 por 5 min por token). `/me/calls` não existe (DEC-08) |

### 8.2.3 SUPER_ADMIN e OWNER (JWT)
| Método e caminho | Papel | Finalidade | Observações |
|---|---|---|---|
| POST, GET /admin/restaurants | SUPER_ADMIN | Criar (slug em uso dá 409) e listar restaurantes | |
| PATCH /admin/restaurants/:restaurantId | SUPER_ADMIN | Ativar ou desativar | Desativar encerra os atendimentos, invalida o cache e derruba os sockets |
| GET, POST /admin/restaurants/:restaurantId/users | SUPER_ADMIN | Listar e criar usuários de qualquer restaurante | 409 `RESTAURANT_INACTIVE` se desativado (DEC-13) |
| PATCH, DELETE /admin/restaurants/:restaurantId/users/:id | SUPER_ADMIN | Editar (nome, categoria, ativo) e excluir | Último OWNER ativo protegido (409) |
| GET, POST /staff | OWNER | Listar e criar STAFF do próprio restaurante | Cria só STAFF; categoria opcional |
| PATCH, DELETE /staff/:id | OWNER | Editar (nome, categoria, ativo) e excluir | Só STAFF; outro papel ou restaurante dá 404 |
| GET /tables | OWNER, STAFF | Listar mesas (com `public_url`) | |
| POST /tables | OWNER | Criar mesa (gera `public_code` de 12 caracteres) | |
| PATCH /tables/:id | OWNER | Renomear, ativar ou desativar | Desativar encerra o atendimento aberto; `/deactivate`, `/activate` e `/regenerate-code` não existem |
| GET /tables/:id/qrcode | OWNER | QR Code em SVG de `<PUBLIC_APP_URL>/m/<código>` | Reativa mesa inativa |
| DELETE /tables/:id | OWNER | Excluir mesa | 204; 409 `TABLE_HAS_SESSIONS` se já teve atendimento |

### 8.2.4 Balcão (JWT; papéis OWNER e STAFF)  
| Método e caminho | Finalidade | Observações |
|---|---|---|
| GET /calls | Cards em ordem de chegada | `?status=` OPEN (padrão), DONE ou CANCELLED e `?since=<data>` (400 se inválida); resposta `{ serverTime, calls[] }` com `table.label` |
| PATCH /calls/:id/done | Finalizar chamado | `done_by` = usuário logado; 404; 409 `CALL_NOT_OPEN` |
| GET /sessions | Mesas em atendimento, com a contagem de aparelhos | `?status=ACTIVE` (padrão) ou `CLOSED`; status inválido dá 400; sem paginação ainda |
| POST /tables/:id/session | Abrir o atendimento de uma mesa | 409 `TABLE_INACTIVE` ou `SESSION_ALREADY_ACTIVE` |
| POST /sessions/:id/close | Encerrar | 409 `SESSION_CLOSED` se já encerrado; revoga tokens e cancela chamados |
| POST /sessions/:id/extend | Estender (+`TABLE_SESSION_TTL`, 4 h; é o "manter aberto") | 409 `SESSION_CLOSED` se encerrado |

O documento de módulos previa `PATCH /sessions/:id` (keepOpen) e `POST /tables/:id/sessions`; hoje valem `POST /sessions/:id/extend` (DEC-09) e `POST /tables/:id/session` (DEC-01). Rotas da v0.2 (setores, cardápio, comandas, KDS, avaliações, relatórios) e `/auth/me` não fazem parte do MVP. A documentação OpenAPI (`/docs`, fora de produção) cobre as rotas.

## 8.3 Eventos Socket.IO 

**[Implementado]** Código em `back-end/src/shared/realtime/` (`notifier.ts`: interface `INotifier` com `toRestaurant(restaurantId, event, payload)`, `disconnectUser` e `disconnectRestaurant`; `socket-notifier.ts`: `SocketNotifier`, registrado no container como "Notifier"; sem servidor ligado, como nos testes, não envia nada). `main.ts` usa `http.createServer(app)` e o Socket.IO divide a porta com o Express. Dependências: `socket.io` e `socket.io-client` (dev). Testes: `tests/realtime.test.ts`.

| Evento | Sala | Payload |
|---|---|---|
| call:created | restaurant:<restaurantId> | CallView {id, session_id, type, status, created_at, done_at, table:{label}}; só quando cria, não no chamado repetido (DEC-03) |
| call:done | restaurant:<restaurantId> | {id} |
| session:opened | restaurant:<restaurantId> | {id, table:{id,label}, expires_at} |
| session:extended | restaurant:<restaurantId> | {id, expires_at} |
| session:closed | restaurant:<restaurantId> | {id, reason} (reason STAFF ou TIMEOUT) |

- Autenticação: JWT em `handshake.auth.token`, mesma regra do HTTP (`authenticateToken` em `auth.middleware.ts`, que usa `AuthCache`). Só quem tem restaurante (OWNER/STAFF) entra; a sala é `restaurant:<restaurantId>`. CORS pelas mesmas origens (FRONTEND_URL).
- Emissão apenas após o commit, só para a sala do restaurante (isolamento por tenant).
- Não existe `call:cancelled`: `session:closed` manda o balcão remover todos os cards da sessão (por isso CallView ganhou `session_id`). Nomes com dois pontos por decisão do usuário (DV-38 resolvida; substituem os com ponto da v0.3).
- O cliente (mesa) não usa tempo real (DEC-08); sem sala `session:<id>`.
- Aviso de 15 min (DEC-02): calculado no front a partir de `expires_at`; o back-end não emite aviso. O job de expiração (a cada 60 s) está [Implementado]: encerra com TIMEOUT e emite `session:closed {id, reason:'TIMEOUT'}`; o balcão recebe `expires_at` no GET /sessions e em `session:opened`/`session:extended`.
- Desativar ou excluir um usuário e desativar um restaurante derrubam os sockets correspondentes (`disconnectUser`, `disconnectRestaurant`); o JWT só é conferido na conexão. Limitações aceitas: instância única (várias exigiriam adapter Redis); eventos podem se perder em queda, então o balcão recarrega `GET /calls` e `GET /sessions` ao reconectar.
- Eventos da v0.2 (`order.created`, `tab.updated`, `call.accepted` etc.) não fazem parte do MVP. Futuro: módulo "integrations".

## 8.4 Autenticação, autorização, papéis e tenant 

### 8.4.1 Autenticação 
 
- **Usuários (OWNER e STAFF; SUPER_ADMIN na API):** JWT HS256 assinado com `JWT_SECRET`, contendo `sub`, `restaurantId` e `role`; validade por `JWT_EXPIRES_IN` (padrão 1 dia). **[Implementado]**. Senha com scrypt (salt aleatório de 16 bytes, chave de 64 bytes, formato `salt:hash`), de 8 a 128 caracteres, e comparação em tempo constante; a documentação cita argon2 ou bcrypt (RNF05; DV-22). 
- **Mensagens anti-enumeração [Implementado]:** o login devolve a mesma mensagem para e-mail inexistente, senha errada e usuário ou restaurante desativado, e compara contra `DUMMY_PASSWORD_HASH` quando o usuário não existe (tempo uniforme); o cadastro responde com erro genérico para e-mail duplicado. 
- **CORS e rate limit [Implementado]:** CORS por `FRONTEND_URL` (lista separada por vírgula; sem ela nenhuma origem de navegador). Rate limit em memória (`express-rate-limit`), desligado com `NODE_ENV=test`: login 10 por 15 min por IP+e-mail e 30 por 15 min só por IP; cadastro 5 por hora por IP; scan 30 por 15 min por IP+mesa; chamados 10 por 5 min por token do aparelho. Resposta 429. Atrás de proxy reverso é preciso `TRUST_PROXY` (número de proxies), senão o IP dos limites é o do proxy; um valor maior que o real deixa o IP forjável por `X-Forwarded-For`. 
- **Aparelho da mesa [Implementado]:** token opaco por aparelho, hash SHA-256 no banco, cabeçalho `X-Table-Token` (seção 7.4). 
- **`ensureAuthenticated` [Implementado]:** valida o Bearer, consulta o banco (`findForAuth`) com cache em memória (TTL 30 s, `AUTH_CACHE_TTL_SECONDS`, invalidação ao alterar ou remover usuário e ao ativar ou desativar restaurante) e preenche `req.user { id, restaurantId, role }` a partir do banco. Existem `ensureRole`, `tenantOf` e `validateUuidParams`, aplicados a todas as rotas autenticadas. 
- **Limites de entrada [Implementado]:** corpo acima de 100 KB dá 413 `PAYLOAD_TOO_LARGE`; JSON inválido dá 400; senha até 128 caracteres, nomes até 100, slug até 60. 

### 8.4.2 Papéis (autorização)  
| Papel | Descrição | Pode |
|---|---|---|  
| Cliente (sem login) | Token de aparelho | Abrir a tela da mesa (scan), chamar garçom, pedir a conta | 
| STAFF | Funcionário; acessa o painel do restaurante (balcão) | Ver e finalizar chamados, listar mesas, abrir, encerrar e estender atendimentos | 
| OWNER | Dono que fez o autocadastro (fluxo B) | Tudo o que o STAFF faz, mais gerir a equipe STAFF, criar, editar, excluir mesas e gerar o QR Code | 
| SUPER_ADMIN | Dono da plataforma (DV-48), sem restaurante; criado por seed | Criar, ativar e desativar restaurantes e gerir usuários de qualquer restaurante; o dashboard global é [Planejado] |

A v0.2 falava em ADMIN, WAITER e KITCHEN; o código usa SUPER_ADMIN, OWNER e STAFF (ADMIN deixou de existir em 12/11/2026; DV-13). `ensureRole` é [Implementado]; o "último admin" virou a proteção do último OWNER ativo (409); o acesso de usuário removido ou desativado é cortado na hora pela consulta ao banco (cache de até 30 s, invalidado nas mudanças). Códigos de resposta: 401 (não sei quem é), 403 (sei quem é, mas não pode), 404 (não existe para você, caso de outro restaurante). Menor privilégio: rota nova nasce restrita ao OWNER e só é aberta ao STAFF se necessário.

### 8.4.3 Tenant (isolamento por restaurante) 

RN01 e RNF01: cada restaurante só acessa seus dados; tenant por coluna `restaurant_id` (decisão arquitetural). Regras: o `restaurantId` vem sempre do JWT (ou do atendimento, na rota da mesa), nunca do corpo; o repositório recebe o tenant como primeiro parâmetro e filtra por ele; recurso de outro restaurante parece inexistente (404). **[Implementado]** nos repositórios de usuários, mesas, sessões e chamados, com `tenantOf` e o CHECK `users_restaurant_by_role`; o script `check_tenant.py` e o teste `tests/tenant-isolation.test.ts` vigiam. Exceções legítimas sem tenant: login (`findByEmail`, e-mail único global), scan (`findByPublicCode` descobre o restaurante pela mesa), validação do token do aparelho (`findByHash`, o tenant sai da sessão) e job de expiração (`findExpired`). 

## 8.5 Formato de erros, códigos HTTP e tabela de erros 

### 8.5.1 Formato 

**[Implementado]** O tratador global responde `{ error, code, message, details? }` (DEC-12): `error` é o nome da classe do erro (por exemplo `NotFoundError`), `code` é um código estável para o front tratar (por exemplo `CALL_NOT_OPEN`), `message` é o texto legível e `details` (quando houver) é a lista de campo e mensagem da validação. A v0.2 e a v0.3 mostram um objeto `error` aninhado com `code` (DV-34); o formato plano do código prevaleceu. 

### 8.5.2 Hierarquia de erros 

Classe base `AppError` (mensagem, status, detalhes opcionais e `code`) e subclasses: `BadRequestError` 400 (`BAD_REQUEST`), `ValidationError` 400 (`VALIDATION_ERROR`, com details), `UnauthorizedError` 401 (`UNAUTHORIZED`), `ForbiddenError` 403 (`FORBIDDEN`), `NotFoundError` 404 (`NOT_FOUND`) e `ConflictError` 409 (`CONFLICT`); erros de regra levam código próprio (`CALL_NOT_OPEN`, `SESSION_CLOSED`, `SESSION_ALREADY_ACTIVE`, `TABLE_INACTIVE`, `TABLE_HAS_SESSIONS`, `RESTAURANT_INACTIVE`). Os controllers não usam `try/catch`: o Express 5 propaga erros assíncronos ao tratador final, que é o último middleware registrado. 

### 8.5.3 Tabela de erros  
| HTTP | Código/nome | Quando | Estado |
|---|---|---|---|  ``
| 400 | VALIDATION_ERROR | Corpo, query ou parâmetro não passa no esquema Zod (inclusive UUID malformado) | Impl. |
| 400 | BAD_REQUEST | JSON malformado; categoria em usuário que não é STAFF | Impl. |
| 401 | UNAUTHORIZED | Login inválido; token de usuário ausente, mal formatado, inválido ou expirado; usuário ou restaurante desativado; token de aparelho ausente, revogado ou vencido (mensagem única; o `TOKEN_REVOKED` da v0.3 não foi adotado) | Impl. |
| 403 | FORBIDDEN | Papel sem permissão; usuário sem restaurante | Impl. |
| 404 | NOT_FOUND | Recurso ausente ou de outro restaurante; mesa inexistente, inativa ou de restaurante desativado no scan (sem `TABLE_NOT_FOUND`); Prisma P2025 | Impl. |
| 409 | CONFLICT e códigos próprios | E-mail já cadastrado; unicidade violada (P2002); registro referenciado (P2003); `TABLE_HAS_SESSIONS`; `TABLE_INACTIVE`; `SESSION_ALREADY_ACTIVE`; `SESSION_CLOSED`; `CALL_NOT_OPEN`; `RESTAURANT_INACTIVE`; último OWNER ativo | Impl. |
| 413 | PAYLOAD_TOO_LARGE | Corpo acima de 100 KB | Impl. |
| 429 | TOO_MANY_REQUESTS | Limite de chamados (10/5 min por token), login, cadastro e scan; substitui o TOO_MANY_CALLS | Impl. |
| 500 | INTERNAL_ERROR | Erro não previsto; é registrado em log (nos erros do Prisma, só o nome e o código) e a resposta não vaza detalhes | Impl. |

## 8.6 Configuração e variáveis de ambiente  
| Variável | Serviço | Finalidade | Estado no código |
|---|---|---|---|  ````
| DATABASE_URL | api | String de conexão PostgreSQL (também lida por prisma.config.ts) | Usada |
| JWT_SECRET | api | Segredo do JWT; ausência provoca erro; em produção a API não sobe com menos de 32 caracteres ou com o padrão de desenvolvimento | Usada |
| JWT_EXPIRES_IN | api | Validade do JWT; padrão 1d; não consta na documentação v0.3 | Usada |
| PORT | api | Porta da API (padrão 4000) | Usada |
| FRONTEND_URL (substitui CORS_ORIGIN) | api | Origem(ns) do front, separadas por vírgula; alimenta o CORS e o Socket.IO | Usada |
| PUBLIC_APP_URL (era PUBLIC_WEB_URL) | api | Base da URL pública da mesa e do QR Code (`/m/<código>`); obrigatória na subida; padrão `http://localhost:3000` no `.env.example` e no compose (DV-43 resolvida) | Usada |
| TABLE_SESSION_TTL | api | Duração do atendimento em segundos (padrão 14400, 4 h); estender acrescenta o mesmo valor | Usada |
| TRUST_PROXY | api | Quantos proxies reversos ficam à frente da API; sem valor, o IP dos limites é o da conexão direta | Opcional |
| AUTH_CACHE_TTL_SECONDS | api | TTL do cache de autenticação; padrão 30; 0 desliga | Usada |
| NODE_ENV | api | `production` esconde `/docs` e liga a exigência de segredo forte; `test` desliga os rate limits | Usada |
| SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD | seed | Dados do primeiro SUPER_ADMIN (senha 12+ caracteres) | Usada (prisma/seed-super-admin.ts) |
| NEXT_PUBLIC_API_URL | web | URL da API vista pelo navegador (padrão `http://localhost:4000/api/v1`) | Usada |
| POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, DB_PORT, API_PORT, WEB_PORT | compose | Opcionais; padrões `garcom`, `garcom`, `garcom`, 5432, 4000 e 3000 | Usadas no compose |

**[Implementado]** `docker-compose.yml` na raiz: PostgreSQL 16 (porta só em 127.0.0.1), API, front e painel de desenvolvimento; sobe com `docker compose up` sem `.env` (o compose traz um `JWT_SECRET` só de desenvolvimento). A API aplica as migrations (`prisma migrate deploy`) ao subir; o banco de testes (porta 5433) vem pelo perfil `test`. Modelo de variáveis em `back-end/.env.example`. **[Pendente]** Dockerfile e compose de produção. Configuração do Prisma: `prisma.config.ts` (schema, migrations, `DATABASE_URL`), cliente gerado em `generated/prisma`.

## 8.7 Segurança  
| Tema | Medida especificada | Estado |
|---|---|---|  
| Isolamento entre restaurantes (RNF01, RN01) | Filtro por restaurante em toda consulta; 404 para recurso de outro tenant | Impl. (repositórios, `tenantOf`, CHECK no banco, teste de isolamento) | 
| Senha (RNF05) | Hash com salt, comparação em tempo constante | Impl. (scrypt; 8 a 128 caracteres) | 
| Token do aparelho (RNF05) | Aleatório, só hash no banco, revogável | Impl. (SHA-256; revogado ao encerrar) | 
| Abuso (RNF06) | Limite de chamados, scan, login e cadastro; trust proxy atrás de proxy | Impl.; `TRUST_PROXY` precisa ser definido no deploy | 
| Código público da mesa | Aleatório, nunca sequencial | Impl. (12 caracteres, `crypto.randomInt`) | 
| Concorrência | Índice único parcial de sessão ativa e de chamado aberto por tipo; atualização condicional; transação ao encerrar; trava da sessão ao criar chamado | Impl. | 
| CORS, cookies | Origens explícitas (nunca curinga com credenciais) | CORS impl.; o token do balcão e o do aparelho ficam no `localStorage` (risco de XSS; alternativa: cookie httpOnly) | 
| Cabeçalhos de segurança | `helmet` ou equivalente no proxy | [Pendente]; `x-powered-by` já está desligado | 
| Documentação da API | Não exposta em produção | Impl. (`/docs` só fora de produção) | 
| Dependências | Auditoria | `npm audit` do back-end: 3 vulnerabilidades altas na cadeia do CLI do Prisma (correção exige `--force`) | 
| Etiqueta NFC | Gravar a URL, testar e só então travar a tag (irreversível); mesmo caminho do QR | Operacional | 
| LGPD (RNF08) | Cliente anônimo; nenhum dado pessoal coletado | Consistente com o modelo (sem dados do cliente) | 
| Validação de entrada | Zod em corpo, query e parâmetros | Impl.; o resultado validado substitui `req.body` | 
| Vazamento de erros | 500 genérico sem detalhes; log de erro do Prisma só com nome e código | Impl. | 
| Sessão do usuário | Sem refresh nem recuperação de senha | [Pendente] |
