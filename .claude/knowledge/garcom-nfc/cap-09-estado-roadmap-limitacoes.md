# 9. Estado de implementação, roadmap e limitações 

## 9.1 Estado por módulo 

Legenda: Completo, Parcial, Esqueleto, Vazio, Ausente. Fonte: conferência com o código do back-end (`/home/jpsalez/Projects/garcom-NFC/back-end`); o front-end não existe no repositório e não foi verificado.  
| Módulo / área | Estado | O que existe | O que falta |
|---|---|---|---|  ``````````
| Infraestrutura da API (main.ts, server.ts, routes.ts) [atualizado 12/11/2026] | Parcial | Express 5, JSON, CORS por FRONTEND_URL (pacote cors), rate limit (login 10/15 min por IP+e-mail; register 5/h por IP; desligado com NODE_ENV=test; sem trust proxy), injeção de dependência, /health, tratador de erros; porta 3000; app separado em server.ts, listen no main.ts | Prefixo /api/v1, porta 4000, servidor HTTP para Socket.IO, trust proxy (decisões pendentes) |
| auth [Implementado] | Completo para o escopo atual | Register fluxo B (OWNER + restaurante em runInTransaction, slug automático com sufixo, resposta { user, restaurant }, erro genérico de e-mail duplicado), login com hash falso (DUMMY_PASSWORD_HASH) e bloqueio de usuário/restaurante inativo, JWT HS256 fixo, e-mail normalizado, senha mínima 8 | /auth/me, refresh |
| users + administration [Implementado] | Completo para o escopo atual | SUPER_ADMIN: POST/GET /admin/restaurants, PATCH /admin/restaurants/:restaurantId (active), GET/POST /admin/restaurants/:restaurantId/users, PATCH/DELETE .../users/:id. OWNER: GET/POST /staff, PATCH/DELETE /staff/:id (só STAFF, restaurantId do token). Último OWNER ativo protegido (409) | Criar usuário em restaurante inativo (pendente) |
| shared (container, Prisma, erros, validação, jwt, password, cache) | Completo para o escopo atual | Container, DbClient, hierarquia de erros, validateSchema (grava req.body = dados do schema), validateUuidParams, utilitários, auth-cache | Registrar novos services; notifier; Redis só para multi-instância |
| Middlewares de segurança [Implementado] | Parcial | ensureAuthenticated consulta o banco (findForAuth) com cache em memória (shared/cache/auth-cache.ts, TTL 30 s, AUTH_CACHE_TTL_SECONDS; invalidação em UsersService.update/remove e AdministrationService.setRestaurantActive; contador de versão contra corrida); req.user {id, restaurantId, role} vem do banco; ensureRole; tenantOf | Token da mesa, middleware da mesa |
| tables | Esqueleto | Repositório completo; service com método vazio (tablesService, sem injeção); controller e schemas vazios | Geração de código público, CRUD, ativar/desativar, QR Code, rotas | ````
| sessions | Parcial (só dados) | Repositórios de sessão e token, índice parcial na migration | Service, controller, schemas, middleware da mesa, encerramento transacional, job de expiração, renomear pasta | ````
| calls | Parcial (só dados) | Repositório e cancelOpenBySession | Service, controller, rotas, atualização condicional de finalização, índice parcial por tipo, limite | ``
| Tempo real (shared/realtime) | Vazio | Pasta vazia | Socket.IO, salas, autenticação, eventos | 
| Banco (Prisma) | Completo para o MVP | 6 tabelas, enums (role SUPER_ADMIN/OWNER/STAFF, staff_category), 4 migrations (init + roles_and_staff_category + staff_category_and_checks + users_restaurant_by_role), CHECKs users_category_only_staff e users_restaurant_by_role, active em users e restaurants, índice table_sessions_one_active preservado, índices únicos e índice (restaurante, status) em chamados | Timestamps de sessão, índice parcial de chamados, campos citados em divergências | ``````````
| Front-end Next.js (/m/[code], /balcao, /admin, /login, /cadastro) | Ausente | Nada no repositório | Todas as áreas | ``
| Docker Compose, .env.example, CI [Implementado] | Parcial | back-end/docker-compose.yml, .env.example, .env.test, .github/workflows/ci.yml; seeds prisma/seed.ts (OWNER demo) e prisma/seed-super-admin.ts (SUPER_ADMIN por SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD, 12+ caracteres) | Conferir Dockerfile e fluxo completo (RNF07) |
| Testes | Ausente | vitest.config.ts existe, mas não há pasta tests | Testes de isolamento, permissão, concorrência, transições |   

## 9.2 Estado por requisito (v0.3)  
| Requisito | Status no documento | Estado no código |
|---|---|---|  
| RF01 Autocadastro (restaurante + Owner) | Definido | [Implementado] fluxo B: OWNER + restaurante em transação | 
| RF02 Mesas e QR Code | Definido | Não implementado (repositório pronto) | 
| RF03 Acesso do balcão | Definido | Não implementado | 
| RF04 Tela da mesa sem login | Definido | Não implementado | 
| RF05, RF06 Chamar garçom, pedir conta | Definido | Não implementado (repositório de chamados) | 
| RF07 Confirmação de envio | Proposto | Não implementado | 
| RF08 Cards em tempo real | Definido | Não implementado | 
| RF09 Finalizar chamado | Definido | Não implementado | 
| RF10 Encerrar atendimento e revogar tokens | Definido | Só blocos de repositório | 
| RF11 Manter aberto | Definido | Só coluna e consulta | ``
| RF12 Expiração em 4 h | Definido | Só findExpired; sem job | 
| RF13 NFC (mesma URL do QR) | Definido | Sem endpoint específico, conforme o desenho; depende de RF02/RF04 | 
| RF14 a RF19 (cardápio, comanda/KDS, avaliação, app do garçom, relatórios, integração) | Futuro | Fora do escopo; não há tabelas | 
| RNF01 a RNF08 | Definidos/propostos | RNF01 e RNF05 parciais; RNF02 a RNF04, RNF06 e RNF07 ausentes; RNF08 compatível com o modelo |   

## 9.3 Roadmap por fase 

O backend entrega a API de cada fase primeiro; o frontend começa pelo layout e liga nos endpoints quando prontos. Equipe: 1 back-end e 1 front-end. Dependências entre parênteses.  
| Fase | Itens de back-end | Itens de front-end | Marco | Estado |
|---|---|---|---|---|  
| 1 Fundação | BE-01 Express, TypeScript, Prisma, Docker Compose; BE-02 autocadastro, login JWT, middlewares auth e tenant (BE-01); BE-03 mesas, QR Code, acesso do balcão (BE-02) | FE-01 setup Next.js e layouts das 3 áreas; FE-02 cadastro e login (BE-02); FE-03 Admin: mesas, QR Codes, acesso do balcão (BE-03) | Restaurante com mesas e QR Codes impressos | BE-01 implementado (Compose e CI existem; atualizado 12/11/2026); BE-02 implementado (register com restaurante, login, ensureAuthenticated/ensureRole/tenantOf, papéis, gestão de equipe); BE-03 não iniciado; FE não iniciado | 
| 2 Chamado | BE-04 atendimento da mesa e token por aparelho (BE-03); BE-05 chamados e Socket.IO na sala do balcão, finalizar (BE-04) | FE-04 tela da mesa (BE-04, BE-05); FE-05 tela do balcão em tempo real e Finalizar (BE-05) | Cliente chama e o card aparece e some no balcão | Só repositórios e schema | 
| 3 Encerramento | BE-06 encerrar: revogar tokens e cancelar chamados (BE-05); BE-07 manter aberto, job de 4 h, limite de chamados (BE-06) | FE-06 balcão: mesas em atendimento, Encerrar, Manter aberto (BE-06, BE-07); FE-07 mesa: estado encerrado, reconexão do balcão (BE-06) | MVP completo rodando via Docker, pronto para piloto | Não iniciado | 
| Depois do MVP | KDS e comanda; avaliações; app do garçom e setores; relatórios; integração com gestão/PDV | Cardápio digital e telas correspondentes | Fora do escopo do MVP | Não iniciado |   

O documento de módulos propõe uma ordem de implementação própria: (1) preparação (~~renomear `seassions`~~ feito em 12/11/2026, `req.restaurantId` e `req.role`, `ensureRole`, register cria restaurante); (2) tabelas; (3) sessões do lado do garçom; (4) sessões do lado do cliente (token, entrar, middleware da mesa); (5) chamados; (6) notificador e job; (7) Socket.IO. A ordem é compatível com as fases BE-02 a BE-07 acima. A v0.2 trazia quatro fases (fundação, atendimento, comanda e cozinha, avaliação e relatórios) para o produto ampliado; foi substituída pelo roadmap da v0.3. 

## 9.4 Limitações e riscos 

### 9.4.1 Limitações do MVP (por decisão) 
 
- Sem cardápio, comanda, KDS, avaliações, relatórios, setores, app do garçom no celular nem integração com PDV. 
- O balcão é um acesso compartilhado em um computador; o registro do garçom individual que finalizou depende de decisão em aberto. 
- Sem pagamento, sem aviso de pedido pronto, sem estações de cozinha. 
- Uma única instância da API; com mais de uma é preciso um adapter Redis para o Socket.IO e coordenar o job de expiração.  

### 9.4.2 Riscos técnicos 
 
- **Vazamento entre restaurantes** [parcialmente mitigado em 12/11/2026]: CHECK users_restaurant_by_role (OWNER e STAFF sempre com restaurante) e req.user vindo do banco reduzem o risco; ainda depende de disciplina em cada consulta e faltam testes de isolamento. 
- **Concorrência:** abrir atendimento e finalizar chamado exigem garantia no banco; só o primeiro índice existe. 
- **Estado parcial no encerramento:** sem transação, é possível fechar a sessão sem revogar tokens. O encerramento deve ser sempre transacional. 
- **Expiração dependente de job:** mitigada pela verificação em cada requisição. 
- **Tempo real:** perda de eventos em quedas de rede; mitigada por recarga REST na reconexão; meta de 2 s não validada. 
- **Abuso da rota pública:** abrir atendimento no primeiro scan permite uso por quem tem apenas a foto do QR; limitação de taxa, limite de chamados, expiração e revogação são as defesas, todas planejadas. 
- **Falta de timestamps:** sessão sem criação/fechamento e chamado cancelado sem data dificultam auditoria e relatórios futuros. 
- **Servidor escuta ao importar** [resolvido]: hoje `server.ts` só cria o app; a escuta fica no `main.ts` após rotas e errorHandler. Ainda não há testes. 
- **NFC:** travar a etiqueta é irreversível; domínio e formato da URL devem estar definidos antes. 
- **Inconsistências de documentação:** as quatro fontes divergem em pontos importantes (Apêndice A), com risco de implementar o desenho errado. 
- **Operação:** sem Compose, sem testes e sem front, a verificação ponta a ponta ainda não é possível.  

### 9.4.3 Pontos a validar do MVP (v0.3) 
 
- Alerta sonoro no balcão ao chegar um card. 
- Registrar qual garçom finalizou, ou basta um acesso único. 
- Vários clientes chamando: um card por chamado ou por mesa e tipo. 
- Após encerrar, um novo scan abre atendimento imediatamente. 
- O cliente vê se o chamado foi finalizado ou só a confirmação de envio. 
- "Manter aberto" só no balcão ou também pelo cliente. 
- Nome definitivo do produto e cobrança (planos).
