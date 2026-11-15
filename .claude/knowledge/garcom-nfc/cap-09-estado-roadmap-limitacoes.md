# 9. Estado de implementação, roadmap e limitações 

Conferido com o código em 14/11/2026 (branch `dev`). O MVP do chamado está completo no back-end e integrado ao front; restam as pendências listadas em 9.5, nenhuma bloqueante.

## 9.1 Estado por módulo 

Legenda: Completo, Parcial, Ausente. Fonte: conferência com o código (`back-end/` e `front-end/`).  
| Módulo / área | Estado | O que existe | O que falta |
|---|---|---|---|
| Infraestrutura da API (main.ts, server.ts, routes.ts) | Completo | Express 5, prefixo `/api/v1`, 27 rotas, servidor HTTP próprio com Socket.IO, CORS por `FRONTEND_URL`, rate limits, `trust proxy` por `TRUST_PROXY`, `/docs` fora de produção, exigência de `JWT_SECRET` forte em produção, injeção de dependência, tratador de erros | Testar o deploy (o `TRUST_PROXY=1` já está no compose de produção) |
| auth | Completo | Register fluxo B (OWNER + restaurante em transação, slug automático), login com hash falso e bloqueio de inativos, JWT HS256 de 15 min, refresh token de uso único com rotação, logout, `/auth/me`, recuperação de senha por e-mail, troca de senha logado, limites de tentativa | Tela de cadastro de restaurante |
| users + administration | Completo | SUPER_ADMIN: `/admin/restaurants` e usuários de qualquer restaurante. OWNER: `/staff`. Último OWNER ativo protegido; DEC-13 (restaurante desativado) | |
| restaurants | Completo | Repository, slug automático | Sem exclusão por desenho (desativa-se) |
| shared (container, Prisma, erros, validação, jwt, password, cache, utils) | Completo | Container, `DbClient` e `runInTransaction`, erros com `code`, validadores de corpo, query e UUID, `AuthCache`, utilitários de token e de URL pública | Redis só para multi-instância |
| Middlewares | Completo | `ensureAuthenticated` (banco + cache), `ensureRole`, `tenantOf`, `userOf`, `ensureTableToken`, limiters | |
| tables | Completo | CRUD, `public_url`, QR Code em SVG, exclusão, encerramento do atendimento ao desativar | Rotas `/deactivate`, `/activate` e `/regenerate-code` (não feitas; desativar é um PATCH) |
| sessions | Completo | Scan público, abrir pelo balcão, listar, encerrar (transação), estender, token por aparelho (SHA-256), expiração no uso | `keep_open` nunca é escrito (virou estender, DEC-09) |
| calls | Completo | Criar com trava de sessão, repetir devolve o aberto (DEC-03), listar (`status`, `since`, `serverTime`), finalizar condicional, índice `calls_one_open_per_type`, limite 10/5 min por token | `/me/calls` (fora do MVP, DEC-08) |
| Tempo real (shared/realtime) | Completo (instância única) | `INotifier`/`SocketNotifier`, JWT no handshake, sala `restaurant:<id>`, eventos `call:created`, `call:done`, `session:opened`, `session:extended`, `session:closed`, `disconnectUser` e `disconnectRestaurant` | Adapter Redis e lock do job para várias instâncias |
| Jobs | Completo (instância única) | `shared/jobs/session-expiry.job.ts` (60 s, motivo TIMEOUT) e `token-cleanup.job.ts` (de hora em hora, apaga refresh tokens e links de redefinição vencidos) | |
| Banco (Prisma) | Completo | 8 tabelas (6 do domínio, `refresh_tokens` e `password_resets`), enums, 9 migrations, CHECKs, índices parciais `table_sessions_one_active` e `calls_one_open_per_type`, índices de consulta, seeds (OWNER demo e SUPER_ADMIN) | Data de cancelamento dos chamados |
| Front-end Next.js 16 | Completo para o MVP | `/login`, `/cadastro` (autocadastro do restaurante e do OWNER), `/admin/waiter` (balcão em tempo real), `/admin/mesas` (CRUD e QR), `/admin/equipe`, `/admin/restaurantes` (SUPER_ADMIN: restaurantes e seus usuários), `/admin/senha` (trocar a senha), `/esqueci-senha` e `/redefinir-senha`, `/m/[code]` (cliente), cliente da API com `ApiError`, `code` e renovação do token, sessão no `localStorage` | Dashboard e métricas (pós-MVP); decisão sobre cookie httpOnly |
| Docker Compose, .env.example, CI | Parcial | `docker-compose.yml` na raiz (db, api, web, painel, banco de teste), `.env.example`, GitHub Actions (typecheck, lint, testes) | Testar `docker-compose.prod.yml` num servidor real (os arquivos existem, mas ainda não foram executados) |
| Testes | Completo para o MVP | vitest + supertest contra PostgreSQL real, cerca de 100 testes: auth, staff, tables, sessions, calls, realtime, session-expiry, tenant-isolation, hardening, api-v1, índices | Mais testes de concorrência e de ponta a ponta no front |

## 9.2 Estado por requisito (v0.3)  
| Requisito | Status no documento | Estado no código |
|---|---|---|
| RF01 Autocadastro (restaurante + Owner) | Definido | Implementado (fluxo B) |
| RF02 Mesas e QR Code | Definido | Implementado (`/tables`, QR em SVG, tela `/admin/mesas`) |
| RF03 Acesso do balcão | Definido | Implementado (`/staff`, tela `/admin/equipe`; login individual, DEC-06) |
| RF04 Tela da mesa sem login | Definido | Implementado (`/m/[code]` e scan) |
| RF05, RF06 Chamar garçom, pedir conta | Definido | Implementado (`POST /public/calls`) |
| RF07 Confirmação de envio | Proposto | Implementado (201 ou 200 e mensagem na tela) |
| RF08 Cards em tempo real | Definido | Implementado (`GET /calls`, Socket.IO, tela `/admin/waiter`) |
| RF09 Finalizar chamado | Definido | Implementado (`PATCH /calls/:id/done`) |
| RF10 Encerrar atendimento e revogar tokens | Definido | Implementado (`POST /sessions/:id/close`, transação) |
| RF11 Manter aberto | Definido | Implementado como estender (`POST /sessions/:id/extend`, DEC-09) |
| RF12 Expiração em 4 h | Definido | Implementado (job de 60 s e expiração no uso) |
| RF13 NFC (mesma URL do QR) | Definido | Sem endpoint específico, conforme o desenho; depende só da gravação da tag |
| RF14 a RF19 (cardápio, comanda/KDS, avaliação, app do garçom, relatórios, integração) | Futuro | Fora do escopo; não há tabelas |
| RNF01 Isolamento por restaurante | Definido | Implementado (filtros, `tenantOf`, CHECK, teste de isolamento) |
| RNF02 Card em até 2 s | Proposto | Implementado; a meta de 2 s ainda não foi medida |
| RNF03 Balcão reconecta e recarrega | Definido | Implementado no front (recarga a cada `connect`) |
| RNF04 Mesa em um toque | Definido | Implementado (tela mobile sem login) |
| RNF05 Tokens revogáveis | Definido | Implementado (SHA-256, `revoked_at`) |
| RNF06 Limite de chamados | Proposto | Implementado (10 por 5 min por token) |
| RNF07 Docker Compose | Definido | Implementado para desenvolvimento; produção pendente |
| RNF08 Cliente anônimo | Definido | Implementado por desenho (sem dado pessoal do cliente) |

## 9.3 Roadmap por fase 

O back-end entregou a API de cada fase primeiro; o front ligou nos endpoints depois. Equipe: 1 back-end e 1 front-end. Dependências entre parênteses.  
| Fase | Itens de back-end | Itens de front-end | Marco | Estado |
|---|---|---|---|---|
| 1 Fundação | BE-01 Express, TypeScript, Prisma, Docker Compose; BE-02 autocadastro, login JWT, middlewares auth e tenant (BE-01); BE-03 mesas, QR Code, acesso do balcão (BE-02) | FE-01 setup Next.js e layouts das áreas; FE-02 login (BE-02); FE-03 mesas, QR Codes e equipe (BE-03) | Restaurante com mesas e QR Codes impressos | **Concluída (14/11/2026)** |
| 2 Chamado | BE-04 atendimento da mesa e token por aparelho (BE-03); BE-05 chamados e Socket.IO na sala do balcão, finalizar (BE-04) | FE-04 tela da mesa (BE-04, BE-05); FE-05 tela do balcão em tempo real e Finalizar (BE-05) | Cliente chama e o card aparece e some no balcão | **Concluída (14/11/2026)** |
| 3 Encerramento | BE-06 encerrar: revogar tokens e cancelar chamados (BE-05); BE-07 estender, job de 4 h, limite de chamados (BE-06) | FE-06 balcão: mesas em atendimento, Encerrar, Estender (BE-06, BE-07); FE-07 mesa: reconexão (BE-06) | MVP completo rodando via Docker, pronto para piloto | **Concluída (14/11/2026)** para desenvolvimento; produção depende de Dockerfile e `TRUST_PROXY` |
| Depois do MVP | KDS e comanda; avaliações; app do garçom e setores; relatórios; integração com gestão/PDV | Cardápio digital e telas correspondentes | Fora do escopo do MVP | Não iniciado |   

O documento de módulos propunha uma ordem própria: (1) preparação; (2) tabelas; (3) sessões do lado do garçom; (4) sessões do lado do cliente; (5) chamados; (6) notificador e job; (7) Socket.IO. A ordem executada foi compatível com BE-02 a BE-07. A v0.2 trazia quatro fases (fundação, atendimento, comanda e cozinha, avaliação e relatórios) para o produto ampliado; foi substituída pelo roadmap da v0.3. 

## 9.4 Limitações e riscos 

### 9.4.1 Limitações do MVP (por decisão) 
 
- Sem cardápio, comanda, KDS, avaliações, relatórios, setores, app do garçom no celular nem integração com PDV. 
- O cliente não acompanha o chamado nem recebe eventos em tempo real (DEC-08); só a confirmação de envio. 
- Cada garçom entra com o próprio usuário (DEC-06), mas a tela do balcão é única num computador. 
- Sem pagamento, sem aviso de pedido pronto, sem estações de cozinha. 
- Uma única instância da API: com mais de uma é preciso um adapter Redis para o Socket.IO e coordenar o job de expiração. 

### 9.4.2 Riscos técnicos 
 
- **Vazamento entre restaurantes** [mitigado]: filtros nos repositories, `tenantOf`, CHECK `users_restaurant_by_role`, `req.user` vindo do banco, teste de isolamento e o script `check_tenant.py`; ainda depende de disciplina em cada consulta nova. 
- **Concorrência** [tratada]: índices `table_sessions_one_active` e `calls_one_open_per_type`, `closeIfActive` e `markDone` condicionais, trava `FOR SHARE` da sessão ao criar chamado e encerramento transacional. O `extend` é condicional e a regra do último OWNER roda sob trava do restaurante. 
- **Perda de evento entre o commit e a emissão** [aceito]: sem outbox; o balcão recarrega por REST a cada reconexão. 
- **Tempo real:** o JWT só é conferido na conexão (desativar ou excluir derruba o socket); a meta de 2 s não foi medida. 
- **Abuso da rota pública:** o primeiro scan abre atendimento, então quem tem a foto do QR pode abri-lo; defesas: limite de scan, limite de chamados, expiração em 4 h e revogação. Um valor errado de `TRUST_PROXY` enfraquece os limites por IP. 
- **Token no `localStorage`** (balcão e aparelho do cliente): risco de XSS; alternativa futura é cookie httpOnly. 
- **Timestamps:** a sessão tem `created_at` e `closed_at` desde 14/11/2026 (os antigos ficaram sem `closed_at`); o chamado cancelado ainda não tem data, o que dificulta auditoria e relatórios. 
- **Dependências:** `npm audit` do back-end limpo desde 14/11/2026: a `deepmerge-ts` (versão < 8, vulnerável a estouro de pilha em objetos recursivos) usada pelo CLI do Prisma é forçada para a ^8.0.2 por `overrides` no `package.json`. O Prisma 6.19.3 continua; a correção oficial só existe na linha 7 (mudança grande). Validado com `prisma validate`, `generate` e `migrate diff`; falta rodar `migrate deploy` e a suíte num banco real. 
- **NFC:** travar a etiqueta é irreversível; domínio e formato da URL (`PUBLIC_APP_URL`) devem estar definidos antes. 
- **E-mail duplicado:** o 409 diz só "Não foi possível criar o usuário" na criação por OWNER ou SUPER_ADMIN e no autocadastro; o próprio 409 (contra um 201) ainda indica que o e-mail já está em uso, o que é inevitável para quem cria contas. 
- **Operação:** o compose de produção existe (`docker-compose.prod.yml`, com `TRUST_PROXY=1` atrás do Caddy), mas ainda não foi testado num servidor; exige `DOMAIN`, `POSTGRES_PASSWORD` e `JWT_SECRET` próprios. 

### 9.4.3 Pontos a validar do MVP (v0.3) 

Todos decididos em 13–14/11/2026 (ver 2.7.1): alerta sonoro (sim, DEC-10), registrar o garçom (sim, DEC-06), um card por tipo e sessão (DEC-03), novo scan abre atendimento na hora (DEC-07), cliente vê só a confirmação de envio (DEC-08) e estender só no balcão (DEC-09). Em aberto: nome definitivo do produto e cobrança (planos). 

## 9.5 Pendências e próximos passos (não bloqueantes) 
 
- **Segurança de produção:** decisão sobre cookie httpOnly (o `TRUST_PROXY` já vem definido no compose de produção). 
- **Infra:** testar o compose de produção (`docker-compose.prod.yml`) num servidor; mesclar a `dev` na `main`. 
- **Back-end:** timestamps nos chamados cancelados. 
- **Front:** nada bloqueia o MVP; falta testar as telas no navegador. 
- **Qualidade:** rodar `docker compose up` e `npm test` no ambiente do desenvolvedor (a suíte foi validada com um PostgreSQL local); mais testes de concorrência. 
- **Documentação:** regerar o PDF consolidado quando o código mudar de forma relevante. 
