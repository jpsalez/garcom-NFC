# 8. API, tempo real, segurança, configuração e erros 

## 8.1 Convenções gerais da API 
 
- **[Especificado]** Base `/api/v1`, corpos JSON. Usuários do balcão e do admin enviam `Authorization: Bearer` com JWT; a mesa envia o cabeçalho `X-Table-Token` (v0.3; a v0.2 usava `X-Table-Session` para um token compartilhado, DV-24). 
- **[Implementado, 14/11/2026]** Todas as rotas são montadas sob `/api/v1` (DEC-11), inclusive `GET /api/v1/health` (usado no healthcheck do Compose); `/docs` fica fora do prefixo. O erro sempre tem o formato `{ error, code, message, details? }` (DEC-12): `code` é estável (`BAD_REQUEST`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_REQUESTS`, `INTERNAL_ERROR`) e os erros novos têm código próprio (`TABLE_HAS_SESSIONS`, `RESTAURANT_INACTIVE`). 
- Rotas "públicas" não exigem usuário; as "da mesa" exigem token de aparelho; as demais exigem JWT e papel.  

## 8.2 Endpoints REST 

Legenda de estado: **Impl.** = implementado; **Plan.** = planejado (não implementado). Os caminhos são os da v0.3; as variantes do documento de módulos aparecem na coluna de observações. 

### 8.2.1 Públicos (sem autenticação)  
| Método e caminho | Finalidade | Entrada e saída | Estado |
|---|---|---|---|  ``
| GET /health | Verificar se a API responde | Sem entrada; 200 com mensagem "API Healthy" | Impl. (extra) | ``
| POST /auth/register | Autocadastro: restaurante + Owner (RF01) | Entrada: name, email, password (mín. 8; e-mail normalizado); 201 com { user, restaurant }; e-mail duplicado com erro genérico; rate limit 5/h por IP | [Implementado] fluxo B em transação (DV-15 resolvida) | ``
| POST /auth/login | Obter JWT | Entrada: email, password; 200 com token e usuário. Erro genérico 401 "E-mail ou senha inválidos" | Impl. | ````
| GET /public/tables/:code | Nome do restaurante e da mesa | 404 TABLE_NOT_FOUND se inexistente ou inativa | Plan. | ````
| POST /public/tables/:code/token | Entrar no atendimento ativo ou abrir; devolve token do aparelho | Token em texto uma única vez | Plan. (módulos: /public/tables/:code/join) |   

### 8.2.2 Da mesa (token de aparelho)  
| Método e caminho | Finalidade | Entrada e saída | Estado |
|---|---|---|---|  ````````````
| POST /public/calls | Chamar garçom ou pedir conta | Entrada: type WAITER ou BILL. 201: id, type, status OPEN, table. Erros: 401 TOKEN_REVOKED, 429 TOO_MANY_CALLS | Plan. (módulos: POST /me/calls; também GET /me/calls e DELETE /me/calls/:id) |   

### 8.2.3 Admin (JWT; papéis SUPER_ADMIN e OWNER) [Implementado, 12/11/2026]
SUPER_ADMIN: POST/GET /admin/restaurants; PATCH /admin/restaurants/:restaurantId (active); GET/POST /admin/restaurants/:restaurantId/users; PATCH/DELETE /admin/restaurants/:restaurantId/users/:id. OWNER: GET/POST /staff; PATCH/DELETE /staff/:id (só STAFF; restaurantId do token). Último OWNER ativo protegido (409). Login: 10/15 min por IP+e-mail (429).
Rotas de mesas [Implementado em 14/11/2026]: GET /tables (STAFF ou OWNER); POST /tables, PATCH /tables/:id, GET /tables/:id/qrcode (SVG; reativa mesa inativa) e DELETE /tables/:id (204; 404 de outro restaurante; 409 se já teve sessão), todas só OWNER. list/create/update devolvem `public_url`. As linhas da tabela abaixo marcadas "Plan." sobre /tables estão superadas; /deactivate, /activate e /regenerate-code continuam [Planejado].  
| Método e caminho | Finalidade | Estado |
|---|---|---|  ````
| GET, POST /tables | Listar e criar mesas (gera public_code) | Plan. (service é esqueleto; controller e schemas vazios) | ````````
| PATCH /tables/:id | Renomear, ativar ou desativar (módulos: rotas separadas /deactivate, /activate e /regenerate-code) | Plan. | ````
| GET /tables/:id/qrcode | QR Code em SVG ou PNG, a partir de PUBLIC_WEB_URL/m/código | Plan. (sem biblioteca de QR) | ````````
| POST /staff | Criar o acesso do balcão (RF03) | Plan. (módulos: POST /users, GET /users, DELETE /users/:id) |   

Desativar uma mesa com atendimento ativo deve falhar com 409 ("Feche a mesa antes de desativá-la"); mesas são desativadas, não excluídas, porque sessões e chamados têm chave estrangeira para elas. 

### 8.2.4 Balcão (JWT, papel STAFF)  
| Método e caminho | Finalidade | Estado |
|---|---|---|  ``
| GET /calls?status=OPEN | Cards em ordem de chegada | Plan. | ````
| PATCH /calls/:id/done | Finalizar chamado (módulos: /attend) | Plan. | ``
| GET /sessions?status=ACTIVE | Mesas em atendimento, com aparelhos | Plan. | ``````
| PATCH /sessions/:id | Corpo com keepOpen verdadeiro ou falso (módulos: /keep-open) | Plan. | ``````
| POST /sessions/:id/close | Encerrar; 200 com status, revokedTokens e cancelledCalls | Plan. |   

Sessões [Implementado em 14/11/2026; as linhas "Plan." acima sobre /sessions e o scan estão superadas; todas sob /api/v1]: `POST /public/tables/:code/scan` (público; 30/15 min por IP+mesa; abre ou reaproveita o atendimento; devolve `{token, expires_at, table, restaurant}`; mesa/restaurante inativo = 404; substitui o `/token` planejado); `GET /sessions` (ativos); `POST /tables/:id/session` (balcão; 409 SESSION_ALREADY_ACTIVE); `POST /sessions/:id/close` (409 SESSION_CLOSED se já encerrado); `POST /sessions/:id/extend` (+`TABLE_SESSION_TTL`, padrão 4 h). `PATCH /sessions/:id` (keepOpen) segue [Planejado]; `POST /public/calls` e o middleware do token de mesa dependem do módulo calls.

O documento de módulos previa `GET /sessions` e `POST /tables/:id/sessions` (garçom abre a mesa), fora do desenho da v0.3 (DV-37); agora implementados (DEC-01). Rotas da v0.2 (setores, equipe, cardápio, comandas, KDS, avaliações, relatórios, `/auth/me`) não fazem parte do MVP e são futuras. 

## 8.3 Eventos Socket.IO 

**[Especificado]** Eventos do servidor para as telas (v0.3):  
| Evento | Sala | Destinatário | Conteúdo |
|---|---|---|---|  ````
| call.created | balcao:{restaurantId} | Tela do balcão (novo card) | id, type, table, createdAt | ````
| call.done | balcao:{restaurantId} | Balcão (remove card) | id | ````
| session.updated | balcao:{restaurantId} | Balcão (lista de mesas) | id, table, devices, keepOpen | ``````
| session.closed | balcao e session:{id} | Balcão e aparelhos da mesa | id, reason |   

_Figura: **Figura 8.1** – Salas e eventos do Socket.IO (planejados). (Ver seção 8.3)_ 
 
- As salas fazem o isolamento por restaurante no tempo real; a conexão do balcão é autenticada com o mesmo JWT (`verifyToken`, que já existe e é reutilizável); a do aparelho da mesa, opcionalmente, com o token da mesa. 
- Emissão apenas após o commit da transação. 
- Nomenclatura divergente: o documento de módulos e o guia usam `call:created`, `call:done`, `call:cancelled`, `session:opened`, `session:closed` e salas `restaurant:<id>`/`session:<id>` (DV-38). Adotados os nomes da v0.3. 
- Eventos da v0.2 (`order.created`, `tab.updated`, `call.accepted` etc.) são do produto ampliado e não fazem parte do MVP. 
- Futuro: módulo "integrations" consumindo eventos internos do service de chamados; adapter Redis só com mais de uma instância da API. 
- **[Não implementado]** Nada disso: sem dependência `socket.io`, sem servidor HTTP compartilhado (o `server.ts` chama `listen` diretamente no app) e com `shared/realtime` vazio.  

## 8.4 Autenticação, autorização, papéis e tenant 

### 8.4.1 Autenticação 
 
- **Usuários (Admin e balcão):** JWT assinado com `JWT_SECRET`, contendo `sub`, `restaurantId` e `role`; validade por `JWT_EXPIRES_IN` (padrão 1 dia; variável não documentada na v0.3). **[Implementado]**. Senha com scrypt (salt aleatório de 16 bytes, chave de 64 bytes, formato `salt:hash`) e comparação em tempo constante; a documentação cita argon2 ou bcrypt (RNF05; DV-22). 
- **Mensagens anti-enumeração:** o login devolve a mesma mensagem para e-mail inexistente e senha errada. [Implementado, 12/11/2026] Compara contra `DUMMY_PASSWORD_HASH` quando o usuário não existe (tempo uniforme); usuário ou restaurante inativo é bloqueado. JWT HS256 fixo.
- **CORS e rate limit [Implementado]:** CORS por `FRONTEND_URL` (lista separada por vírgula; sem ela nenhuma origem de navegador). Rate limit em memória: login 10/15 min por IP+e-mail, register 5/h por IP, desligado com NODE_ENV=test, sem `trust proxy` (atrás de proxy o IP pode ser o do proxy). Resposta 429.
- **Aparelho da mesa:** token opaco por aparelho, hash SHA-256 no banco (seção 7.4). **[Planejado]** 
- [Implementado, 12/11/2026; DV-17 resolvida] `ensureAuthenticated` valida o Bearer, consulta o banco (`findForAuth`) com cache em memória (TTL 30 s, `AUTH_CACHE_TTL_SECONDS`, invalidação ao alterar/remover usuário e ao ativar/desativar restaurante) e preenche `req.user {id, restaurantId, role}` a partir do banco. Existem `ensureRole`, `tenantOf` e `validateUuidParams`. Está aplicado às rotas /admin e /staff.  

### 8.4.2 Papéis (autorização)  
| Papel | Descrição | Pode |
|---|---|---|  
| Cliente (sem login) | Token de aparelho | Ver a tela da mesa, chamar garçom, pedir a conta | 
| STAFF | Acesso do balcão | Ver e finalizar chamados, listar mesas, encerrar, manter aberto | 
| SUPER_ADMIN [Implementado: gestão de restaurantes e usuários; dashboard global Planejado] | Dono da plataforma (DV-48), sem restaurante | Criar/ativar/desativar restaurantes e gerir usuários de qualquer restaurante |
| OWNER [Implementado] | Dono que fez o autocadastro (fluxo B) | Gerir a equipe STAFF (/staff); mesas e QR [Planejado] |   

A v0.2 falava em ADMIN, WAITER e KITCHEN; o código usa SUPER_ADMIN, OWNER e STAFF (ADMIN deixou de existir em 12/11/2026; DV-13). `ensureRole` agora [Implementado]; o "último admin" virou proteção do último OWNER ativo (409); o JWT de usuário removido/inativo é barrado pela consulta ao banco (cache de até 30 s). Códigos de resposta: 401 (não sei quem é), 403 (sei quem é, mas não pode), 404 (não existe para você, caso de outro restaurante). Menor privilégio: rota nova nasce restrita a ADMIN; a role do funcionário é fixada pelo service. O middleware `ensureRole` (fábrica de middleware que recebe as roles permitidas) está **[Planejado/Não implementado]**. Lacunas conhecidas que a role não cobre: usuário removido continua com JWT válido até expirar; mudança de role não vale para tokens antigos; regra do último admin. 

### 8.4.3 Tenant (isolamento por restaurante) 

RN01 e RNF01: cada restaurante só acessa seus dados; tenant por coluna `restaurant_id` (decisão arquitetural, "Proposto" no documento). Regras: o `restaurantId` vem sempre do JWT (ou do atendimento, na rota da mesa), nunca do corpo; o repositório recebe o tenant como primeiro parâmetro e filtra por ele; recurso de outro restaurante parece inexistente (404). **[Implementado parcialmente]** nos repositórios de usuários, mesas, sessões e chamados. Exceções legítimas sem tenant: login (`findByEmail`, e-mail único global), rota pública da mesa (`findByPublicCode` descobre o restaurante pela mesa) e job de expiração (`findExpired`). Pontos de atenção: `SessionTokenRepository.findById`, `update` e `delete` operam só por id; o `users.restaurant_id` opcional permite um ADMIN sem restaurante com `restaurantId` nulo no JWT, o que quebraria o isolamento se usado (DV-16). O middleware de tenant não existe. 

## 8.5 Formato de erros, códigos HTTP e tabela de erros 

### 8.5.1 Formato 

**[Implementado]** O tratador global responde com os campos `error` (nome da classe do erro, por exemplo `NotFoundError`), `message` (texto legível) e, quando houver, `details` (lista de objetos com campo e mensagem, na validação). A documentação (v0.2 e v0.3) mostra um objeto `error` contendo `code` (por exemplo `TOKEN_REVOKED`) (DV-34). **Decisão:** o comportamento atual do código prevalece; a adoção de códigos de erro estáveis legíveis por máquina (`code`) é uma pendência de design. **Requer validação.** 

### 8.5.2 Hierarquia de erros 

Classe base `AppError` (mensagem, status, detalhes opcionais) e subclasses: `BadRequestError` 400 (padrão "Requisição inválida"), `ValidationError` 400 ("Dados inválidos" com details), `UnauthorizedError` 401 ("Não autenticado"), `ForbiddenError` 403 ("Acesso negado"), `NotFoundError` 404 ("Recurso não encontrado"), `ConflictError` 409 ("Registro já existe"). Os controllers não usam `try/catch`: o Express 5 propaga erros assíncronos ao tratador final, que deve ser o último middleware registrado. 

### 8.5.3 Tabela de erros  
| HTTP | Código/nome | Quando | Estado |
|---|---|---|---|  ``
| 400 | ValidationError | Corpo não passa no esquema Zod | Impl. | ``
| 401 | UnauthorizedError | Login inválido; token de usuário ausente, mal formatado, inválido ou expirado | Impl. | ``
| 401 | TOKEN_REVOKED | Token de aparelho revogado ou expirado, ou atendimento encerrado | Plan. | ``
| 403 | ForbiddenError | Papel sem permissão; usuário sem restaurante vinculado | Classe impl.; uso plan. | ``
| 404 | TABLE_NOT_FOUND | Mesa inexistente ou inativa | Plan. | ``
| 404 | NotFoundError | Recurso ausente ou de outro tenant; Prisma P2025 | Impl. (tratador) | ``
| 409 | ConflictError | E-mail já cadastrado; unicidade violada (P2002); violação de chave estrangeira (P2003, error.middleware, 14/11); mesa com sessão ao excluir; chamado já finalizado; sessão já fechada; mesa com atendimento ativo ao desativar | Parcial | ``
| 429 | TOO_MANY_CALLS | Limite de chamados por token/mesa; limitação de taxa nas rotas públicas | Plan. (proposto) | ``
| 500 | InternalServerError | Erro não previsto; é registrado em log e a resposta não vaza detalhes | Impl. |   

## 8.6 Configuração e variáveis de ambiente  
| Variável | Serviço | Finalidade | Estado no código |
|---|---|---|---|  ````
| DATABASE_URL | api | String de conexão PostgreSQL (também lida por prisma.config.ts) | Usada | ``
| JWT_SECRET | api | Segredo do JWT; ausência provoca erro "JWT_SECRET não definido no .env" | Usada | ``
| JWT_EXPIRES_IN | api | Validade do JWT; padrão 1d; não consta na documentação v0.3 | Usada | ``
| FRONTEND_URL (substitui CORS_ORIGIN) | api | Origem(ns) do front, separadas por vírgula; alimenta o CORS | Usada | ``
| AUTH_CACHE_TTL_SECONDS | api | TTL do cache de autenticação; padrão 30 | Usada | ``
| SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD | seed | Dados do primeiro SUPER_ADMIN (senha 12+ caracteres) | Usada (prisma/seed-super-admin.ts) | ``
| TABLE_SESSION_TTL | api | Validade do atendimento em segundos (14400, 4 h) | Não usada | ````
| PUBLIC_APP_URL (era PUBLIC_WEB_URL) | api | Base da URL pública da mesa e do QR Code (/m/código); obrigatória na subida (main.ts); padrão `http://localhost:3000` no .env.example e no compose (DV-43 resolvida) | Usada (14/11/2026) | ``
| NEXT_PUBLIC_API_URL | web | URL da API vista pelo navegador (http://localhost:4000) | Sem front | ``
| API_INTERNAL_URL | web | URL da API para renderização no servidor (http://api:4000) | Sem front | ``````
| DB_USER, DB_PASSWORD | db | Credenciais do PostgreSQL; banco fixo garcom | Sem compose |   

**[Especificado]** Infraestrutura: três contêineres na rede `app-net` (web Next.js na porta 3000, api Express na 4000, db PostgreSQL 16 sem porta exposta, volume `pgdata`, verificação `pg_isready` antes de subir a api). Subida: copiar o arquivo de exemplo de variáveis de ambiente para o arquivo de configuração local, subir os contêineres reconstruindo as imagens e aplicar as migrations dentro do contêiner da API. **[Não implementado]** no repositório: Docker Compose, Dockerfiles e `.env.example`; existe apenas um `.env` local (não lido). Configuração do Prisma: `prisma.config.ts` (schema, migrations, `DATABASE_URL`), cliente gerado em `generated/prisma`. 

## 8.7 Segurança  
| Tema | Medida especificada | Estado |
|---|---|---|  
| Isolamento entre restaurantes (RNF01, RN01) | Filtro por restaurante em toda consulta; 404 para recurso de outro tenant | Parcial (repositórios); sem middleware de tenant | 
| Senha (RNF05) | Hash com salt, comparação em tempo constante | Impl. (scrypt); sem política de tamanho mínimo no schema | 
| Token do aparelho (RNF05) | Aleatório, só hash no banco, revogável | Schema impl.; emissão/validação plan. | ``
| Abuso (RNF06) | Limite de chamados; limitação de taxa por IP nas rotas públicas e no login; trust proxy atrás de proxy | Plan. | 
| Código público da mesa | Aleatório (6 a 9 bytes em base64url), nunca sequencial | Plan.; coluna única impl. | 
| Concorrência | Índice único parcial de sessão ativa; atualização condicional em chamados; transação ao encerrar | Índice de sessão impl.; demais plan. | 
| CORS, cookies | Origens explícitas (nunca curinga com credenciais); cookie httpOnly/SameSite se esse for o meio escolhido | Plan.; sem biblioteca | 
| Etiqueta NFC | Gravar a URL, testar e só então travar a tag (irreversível); mesmo caminho do QR | Operacional | 
| LGPD (RNF08) | Cliente anônimo; nenhum dado pessoal coletado | Consistente com o modelo (sem dados do cliente) | ````
| Validação de entrada | Zod no corpo | Impl. só para body; o resultado validado não substitui req.body, então campos extras permanecem (DV-23) | 
| Vazamento de erros | 500 genérico sem detalhes | Impl. |
