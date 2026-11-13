# Sessão de 12/11/2026: onde paramos

Leia este arquivo ao retomar. Depois leia `00-resumo-e-mapa.md`. O código manda sobre a documentação.

## Modo de trabalho
No fim da sessão o usuário pediu: "atue como desenvolvedor back-end". Ou seja, **implementar direto** em vez de só guiar. O `CLAUDE.md` ainda diz "guiar por padrão" e NÃO foi alterado: pergunte se ele quer atualizar. Decisões de produto continuam sendo dele (nunca decidir).

## Estado em um número
Painel > Tarefas: **20 de 122 tarefas feitas**. O backlog fica em `.claude/painel/tasks.json` (editável pela tela).

## O que a API faz hoje (17 rotas)
- Público: `GET /health`, `POST /auth/register` (fluxo B: OWNER + restaurante em transação), `POST /auth/login`.
- SUPER_ADMIN: `/admin/restaurants` (POST, GET, PATCH active), `/admin/restaurants/:restaurantId/users` (GET, POST) e `/:id` (PATCH, DELETE).
- OWNER: `/staff` (GET, POST) e `/staff/:id` (PATCH, DELETE), só STAFF do próprio restaurante.
- Mesas: `GET /tables` (OWNER e STAFF), `POST /tables` e `PATCH /tables/:id` (OWNER). `public_code` de 12 caracteres gerado pelo sistema.
- Segurança: JWT HS256; `ensureAuthenticated` consulta o banco com cache em memória (30 s, versão contra corrida, invalidado ao desativar/excluir); rate limit (login 10/15 min por IP+e-mail, register 5/h por IP); CORS por `FRONTEND_URL`; e-mail normalizado; UUID validado; proteção do último OWNER.
- Ainda NÃO existe: sessões de mesa, chamados, Socket.IO, job de expiração, QR Code, front-end, testes automatizados (pasta `tests/` não existe).

## Decisões tomadas nesta sessão (já em `decisoes.md`)
Papéis SUPER_ADMIN/OWNER/STAFF; categoria do STAFF (enum `staff_category`, MANAGER é categoria); register fluxo B; primeiro SUPER_ADMIN por seed (`npm run db:seed:super-admin`); remover STAFF = desativar e excluir; cache em memória (Redis só com várias instâncias); `public_code` 12 caracteres; nomes de mesa repetidos permitidos; STAFF só lista mesas.

## Decisões de produto AINDA PENDENTES (não decidir por ele)
DEC-01 quem abre o atendimento (a que mais trava); DEC-03 chamados repetidos; DEC-02 3 h x 4 h; DEC-05 domínio e formato da URL pública (NFC é irreversível); DEC-06 registrar qual garçom finalizou; DEC-07, 08, 09, 10, 11 (prefixo /api/v1 e porta), 12 (código de erro estável), 13 (criar usuário em restaurante desativado).

## Próximos passos sugeridos (nesta ordem)
1. **INF-01 + TST-01**: separar `app` da escuta (`main.ts`) e montar vitest + supertest + banco de teste (`db-test`, porta 5433). Transformar em testes os cenários feitos à mão (auth, equipe, mesas, isolamento entre restaurantes, desativação com cache, corrida do cache). Não depende de decisão.
2. **TAB-04 QR Code**: precisa de DEC-05.
3. **Sessões e chamados**: precisam de DEC-01 e DEC-03. Depois tempo real (RT-*) e job de expiração (JOB-01).
4. Pendências de segurança pequenas (tarefas no painel): INF-04 `trust proxy`, AUT-05, USR-04, AUT-08, AUT-07.
5. DOC-04: terminar a sincronização da documentação (cap-05 seções 5.2.4 e 5.3.2, Apêndice A, PDF consolidado).

## Como retomar o ambiente
```bash
cd back-end
docker compose up -d db                 # Postgres em localhost:5432 (usuário/senha/banco: garcom)
npx prisma migrate dev                  # 4 migrations (confira que table_sessions_one_active continua)
SUPER_ADMIN_EMAIL=... SUPER_ADMIN_PASSWORD=... npm run db:seed:super-admin   # senha com 12+ caracteres
npm run dev                             # API em :3000
cd .. && python3 .claude/scripts/painel.py    # painel em http://127.0.0.1:8765 (reinicie após mudar painel.py)
```
O `.env` não vai para o git: copie de `.env.example` (`JWT_SECRET`, `DATABASE_URL`, `FRONTEND_URL=http://localhost:3001`, opcional `AUTH_CACHE_TTL_SECONDS`). Verificações: `python3 .claude/scripts/verify.py` (typecheck passa; lint e test falham por já existirem avisos e por não haver testes) e `check_tenant.py` (restaurants.repository e sessions/calls aparecem por serem globais ou ainda sem service).
Banco de desenvolvimento: limpo (0 usuários), migrations aplicadas.

## ATENÇÃO: o que NÃO está no git
- O repositório git é só `back-end/` (branch `main`, remoto `github.com/jpsalez/garcom-NFC`). A raiz do projeto não é repositório e `.claude/` está no `.gitignore`.
- **42 alterações estão sem commit** (nada foi commitado nem enviado nesta sessão): schema, 3 migrations novas, auth, users, administration, restaurants, tables, cache, rate limit, seeds, docker-compose, `.env.example`, CI.
- `.claude/` (base de conhecimento, painel, `tasks.json`, scripts, agentes) e o PDF `~/Downloads/Cache-em-memoria-garcom-NFC.pdf` **não vão no push**. Para levar para casa: commitar e enviar o `back-end/` E copiar `.claude/` por outro meio (rsync, pendrive, nuvem).

## Arquivos importantes criados
`back-end/src/shared/cache/auth-cache.ts`, `shared/middlewares/{auth,rate-limit,validator}.middleware.ts`, `shared/utils/token.ts`, `shared/providers/prisma.ts` (`runInTransaction`), `modules/{users,administration,tables}/*`, `modules/restaurants/slug.ts`, `prisma/seed-super-admin.ts`, migrations `20261112193624`, `20261112193904`, `20261112200521`. Painel: aba Tarefas (`.claude/scripts/static/`, `painel.py`, `.claude/painel/tasks.json`).
