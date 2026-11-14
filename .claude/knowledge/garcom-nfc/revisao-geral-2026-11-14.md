# Revisão geral do back-end (14/11/2026)

Três revisões independentes (segurança e tenant; regras de negócio, concorrência e testes; qualidade e simplicidade) sobre a branch `dev` com todos os módulos prontos. Nenhum achado de gravidade alta no isolamento entre restaurantes. As correções estão na branch `ia/revisao-geral` (ver `decisoes.md`, seção "Revisão geral"). Decisões de produto tomadas sem o usuário estão marcadas para revisão.

## O que foi corrigido
| Achado | Gravidade | Correção |
| --- | --- | --- |
| Chamado podia nascer `OPEN` em sessão já encerrada (corrida entre validar o token e inserir) | Alta | transação com `SELECT ... FOR SHARE` na sessão (`lockActive`); teste no service |
| Balcão abria atendimento em mesa inativa | Alta | 409 `TABLE_INACTIVE` |
| Desativar mesa/restaurante deixava atendimentos e tokens ativos por até 4 h | Média | encerra os atendimentos ativos; reativar não reabre |
| Login: variar o e-mail escapava do limite (scrypt ilimitado, password spraying) | Média | limiter extra só por IP (30/15 min) |
| Sem `trust proxy` (IP do proxy valeria para todos) | Média | `TRUST_PROXY` (número de proxies; desligado por padrão) |
| Socket seguia aberto após desativar/excluir usuário ou desativar restaurante | Média | `disconnectUser` / `disconnectRestaurant` |
| JSON inválido e corpo grande viravam 500 | Média | 400 `BAD_REQUEST` e 413 `PAYLOAD_TOO_LARGE` |
| Log de erro do Prisma podia imprimir e-mail e hash | Baixa | log só com nome e código |
| Entradas sem teto (senha com 100 KB rodava scrypt) | Baixa | `.max()` em senha, nomes e slug |
| `/docs` público e `x-powered-by` | Baixa | `/docs` só fora de produção; cabeçalho desligado |
| `JWT_SECRET` padrão do compose valia em produção | Baixa | a API não sobe em produção com segredo curto ou padrão |
| Scan aceitava qualquer string e ia ao banco | Baixa | `isPublicCode` barra o formato antes |
| Índices faltando (FKs e listagens) | Média | migration `20261114130000_indexes_consultas_e_fks` |
| Sem testes: CRUD de staff, admin, último OWNER, usuário e restaurante inativos, register | Média | `tests/staff.test.ts`, `tests/hardening.test.ts` |
| Código morto (métodos de repository sem uso), `pnpm-*` sobrando, `tsconfig` sem `tests/` | Baixa | removidos; `tests/` passou a ser checado pelo `typecheck` |

## O que ficou de fora (decida quando quiser)
- `extend` não condicional; "último OWNER" não atômico; e-mail duplicado revela existência; sem `helmet`; `npm audit` (3 altas na cadeia do CLI do Prisma).
- `keep_open` nunca é escrito pelo código (DEC-09 virou só "estender"); a coluna segue no schema.
- Sem outbox: se o processo cair entre o commit e o evento, o balcão perde o evento (recarrega `GET /calls` e `GET /sessions` ao reconectar).
- Formatação: `routes.ts` usa 4 espaços e aspas simples (o `biome.json` define 2 espaços e aspas duplas); `npm run format` reformataria vários arquivos, então não rodei.
- Quem conhece o `public_code` abre atendimento sem estar na mesa (risco de desenho da v0.3).

## Roteiro de leitura manual (ordem sugerida, do que mais importa)
1. `back-end/prisma/schema.prisma` e as migrations (os dois índices parciais à mão).
2. `src/routes.ts` — todas as rotas e quem pode chamar cada uma.
3. `src/shared/middlewares/auth.middleware.ts`, `table-token.middleware.ts`, `rate-limit.middleware.ts`, `error.middleware.ts`.
4. `src/modules/sessions/sessions.service.ts` — o coração: scan, `finish` (transação), expiração, desativações.
5. `src/modules/calls/calls.service.ts` — criar com trava, repetir, finalizar condicional.
6. `src/shared/realtime/socket-notifier.ts`, `src/shared/jobs/session-expiry.job.ts`, `src/main.ts`.
7. `src/modules/tables`, `users`, `administration`, `auth` (mais diretos).
8. Testes: `tests/sessions.test.ts`, `calls.test.ts`, `realtime.test.ts`, `staff.test.ts`.
