# garcom-NFC — resumo e mapa da base de conhecimento

Leia este arquivo PRIMEIRO. Ele é um instantâneo (12/11/2026). O código muda: sempre confirme no código real antes de afirmar algo como "implementado".

## O que é
SaaS multi-restaurante. O cliente escaneia um QR Code (ou toca uma plaquinha NFC que grava a mesma URL) e chama o garçom ou pede a conta. O pedido vira um card em tempo real na tela do balcão. NFC não é requisito da v1: o acesso é por link/QR.

## Stack (back-end, em /home/jpsalez/Projects/garcom-NFC/back-end)
Node + TypeScript executado com tsx (imports com extensão `.ts`), Express 5, Prisma (client gerado em `generated/prisma`) + PostgreSQL, Zod, tsyringe (tokens de texto, `reflect-metadata` primeiro), jsonwebtoken, scrypt para senha. Também cors e express-rate-limit. Também `qrcode` (QR em SVG) e vitest (suíte em `back-end/tests`, 19 testes, módulo tables; instantâneo 14/11/2026). Front-end (Next.js) e Socket.IO: ainda NÃO existem; Docker Compose e CI existem.

## Estrutura de `back-end/src`
- `main.ts`: bootstrap (registra dependências, monta rotas, errorHandler por último, depois `listen`; porta por `PORT`, padrão 3000). `server.ts`: só cria o app Express e `express.json()`. `routes.ts`: monta as rotas.
- `modules/auth`, `modules/users` (users + staff), `modules/administration`, `modules/restaurants` (repository, slug): implementados. `modules/tables`: implementado em 14/11/2026 (list/create/update com `public_url`, GET /tables/:id/qrcode, DELETE /tables/:id; `PUBLIC_APP_URL` obrigatória no main.ts; error.middleware trata P2003 como 409). `modules/sessions`, `modules/calls`: só repository + interface. Arquivos de apoio: `administration.controller.ts`/`administration.interfaces.ts` (rotas e tipos de /admin), `restaurants/slug.ts` (gera o slug do restaurante), `users/users.service.ts`/`users.schema.ts`/`users.interfaces.ts` (regra, Zod e tipos de usuário), `users/staff.controller.ts` (rotas /staff do OWNER), `users/public-user.ts` (remove password_hash da resposta).
- `shared/`: `container` (tsyringe), `errors`, `middlewares` (auth, error, validator, rate-limit), `cache/auth-cache.ts`, `providers/prisma.ts` (DbClient), `utils` (password scrypt, jwt), `realtime` (inexistente).

## Estado real (confirme no código)
[Implementado, atualizado 12/11/2026] Rotas: `GET /health`; `POST /auth/register` (fluxo B: OWNER + restaurante em transação, slug automático, resposta `{ user, restaurant }`, erro genérico de e-mail duplicado) e `POST /auth/login` (hash falso, bloqueia usuário/restaurante inativo; JWT HS256). SUPER_ADMIN: `POST/GET /admin/restaurants`, `PATCH /admin/restaurants/:restaurantId` (active), `GET/POST /admin/restaurants/:restaurantId/users`, `PATCH/DELETE /admin/restaurants/:restaurantId/users/:id`. OWNER: `GET/POST /staff`, `PATCH/DELETE /staff/:id` (só STAFF; restaurantId do token). Último OWNER ativo protegido (409); DELETE de usuário zera closed_by/done_by (SET NULL).
Middlewares: `ensureAuthenticated` consulta o banco (`findForAuth`) com cache em memória (`shared/cache/auth-cache.ts`, TTL 30 s, `AUTH_CACHE_TTL_SECONDS`, invalidação em UsersService.update/remove e AdministrationService.setRestaurantActive); `req.user {id, restaurantId, role}`; `ensureRole`, `tenantOf`, `validateUuidParams`; `validateSchema` grava `req.body` com os dados do schema. Ainda não há token de mesa. Services/controllers/rotas de sessions/calls não existem (só repositories); tables existe.
Infra: CORS por `FRONTEND_URL`; rate limit (login 10/15 min por IP+e-mail; register 5/h por IP; off com NODE_ENV=test; sem trust proxy); `docker-compose.yml`, `.env.example`, `.env.test`, `.github/workflows/ci.yml` existem; `vitest.config.ts` e a pasta `tests/` existem (19 testes); seeds `prisma/seed.ts` (OWNER demo) e `prisma/seed-super-admin.ts` (SUPER_ADMIN via `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`, 12+ caracteres). E-mail normalizado (trim+lowercase), senha mínima 8.
Backlog restante: tela Tarefas do painel (`.claude/painel/tasks.json`, 121 tarefas).

## Papéis [Implementado em 12/11/2026]
Enum role: SUPER_ADMIN (plataforma; sem restaurante), OWNER (substitui ADMIN; um restaurante), STAFF (funcionário; `users.category` enum staff_category WAITER/MANAGER/CLEANING/KITCHEN/OTHER, só para STAFF; MANAGER é categoria; `job_title` removido). `users.active` e `restaurants.active`. CHECKs `users_category_only_staff` e `users_restaurant_by_role`. Resolvidas: fluxo B do register; primeiro SUPER_ADMIN por seed; remover STAFF = existem desativar (PATCH active) e excluir (DELETE). Ainda [Planejado]: painel de chamados e métricas/insights (SUPER_ADMIN e OWNER). Pendente: criar usuário em restaurante inativo. Detalhes em `decisoes.md`.

## Banco (6 tabelas)
restaurants, users, tables, table_sessions, session_tokens, calls. Enums de papel SUPER_ADMIN/OWNER/STAFF e staff_category; 4 migrations; estados de chamado OPEN/DONE/CANCELLED; motivo de fechamento TIMEOUT/STAFF. Índice único parcial `table_sessions_one_active` (uma sessão ACTIVE por mesa) existe na migration; `calls_one_open_per_type` NÃO existe. Todo repository recebe `restaurantId` como primeiro parâmetro (multi-tenancy) e aceita `DbClient`/`tx` para transação.

## Decisões de produto PENDENTES (não decida pelo usuário)
1. Quem abre o atendimento: garçom (README/módulos) vs primeiro scan/token (v0.3) vs primeiro chamado.
2. Duração: 4 h (v0.3, configurável) vs 3 h (exemplos de módulos/guia).
3. Chamados repetidos: um card por chamado (RN08) vs agrupar/bloquear (RN12, índice parcial por tipo, 409).
4. Tamanho do public_code (8 vs 12). Código de erro estável no formato de erro. Domínio/URL do NFC, prefixo /api/v1 e porta. Criar usuário em restaurante inativo. (Fluxo A/B, primeiro SUPER_ADMIN, remover STAFF e MANAGER x job_title foram resolvidos em 12/11/2026.)
Lista completa: Apêndice A (DV-01 a DV-47) em `04-...md`.

## Precedência em conflito
Código (comportamento atual) > v0.3 > v0.2 > módulos/guia (propostas).

## Mapa dos arquivos
Veja `INDEX.md` (lista cada arquivo, tamanho e seções). Convenção: `cap-NN-*` = capítulos 1 a 9 do PDF consolidado; `apendice-a-divergencias` = DV-01 a DV-47; `apendice-b-glossario`; `apendice-c0..c5` = especificações complementares (modelo e endpoints da v0.2, desenho proposto dos services, propostas do guia).
- PDF consolidado: /home/jpsalez/Downloads/Documentacao-Tecnica-garcom-NFC.pdf. Originais em /home/jpsalez/backup-pdfs-originais-2026-11-12/.

## Regras de trabalho com o usuário
Responder em português (BR). Por padrão GUIAR: explicar, dar passo a passo e trechos para o usuário aplicar. Implementar apenas quando ele pedir explicitamente, e só o que ele domina e acha repetitivo (ex.: autenticação, hash, JWT). Partes novas do domínio (multi-tenant e papéis, sessões de mesa, fluxo cliente NFC/QR, realtime) são o aprendizado do usuário: guiar. Ele prefere código mostrado no chat quando pede "como seria", sem alterar arquivos.
