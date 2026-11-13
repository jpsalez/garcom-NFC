# Registro de decisões de produto

Preencha quando decidir. Os agentes leem este arquivo e deixam de perguntar o que já foi decidido. Formato: decisão, data, motivo.

Backlog restante: tela Tarefas do painel (`.claude/painel/tasks.json`, 121 tarefas). Atualizado em 12/11/2026 com o código: itens de papéis, register, gestão de STAFF e primeiro SUPER_ADMIN estão resolvidos e implementados (ver "Decididas"); o texto antigo abaixo é histórico.

## Pendentes (opções em `apendice-a-divergencias.md`)
- [ ] Domínio/URL do NFC; prefixo /api/v1 e porta; criar usuário em restaurante inativo
- [ ] Quem abre o atendimento: garçom / primeiro scan (token) / primeiro chamado
- [ ] Duração do atendimento: 3 h / 4 h (configurável)
- [ ] Chamados repetidos: um card por chamado / agrupar / bloquear por tipo (409)
- [x] RESOLVIDO: fluxo B do register (OWNER + restaurante em transação)
- [x] RESOLVIDO: primeiro SUPER_ADMIN por seed (`prisma/seed-super-admin.ts`)
- [x] RESOLVIDO: remover STAFF = existem desativar e excluir
- [x] RESOLVIDO: `public_code` com 12 caracteres (ver Decididas, módulo tables)
- [ ] Código de erro estável no formato de erro (`error.code`)?

## Sugestões para destravar o modo IA (NÃO decididas: confirme ou altere)
| Decisão | Sugestão | Por quê |
|---|---|---|
| Quem abre o atendimento | Primeiro scan do QR (token por aparelho), como na v0.3 | Cliente não depende do garçom; o garçom ainda pode encerrar |
| Duração | 4 h, lida de `TABLE_SESSION_TTL` | v0.3 e configurável |
| Chamados repetidos | Um card por chamado (RN08) com limite por sessão | Mais simples; evita decidir o agrupamento agora |
| `users.restaurant_id` | Obrigatório; `register` cria restaurante e admin na mesma transação | Fecha o furo de tenant no cadastro |
| `public_code` | 12 caracteres aleatórios | Menos colisão e adivinhação |
| Código de erro estável | Adiar para depois do MVP | Não bloqueia nada |

## Decididas
- **Módulo tables (12/11/2026) [Especificado, NÃO implementado]**: (1) `public_code` com 12 caracteres aleatórios (alfabeto sem caracteres ambíguos, gerado com `crypto.randomInt`; o cliente nunca escolhe o código); (2) nomes de mesa repetidos no mesmo restaurante são permitidos (sem `@@unique([restaurant_id, label])`); (3) permissões: OWNER cria, lista e edita mesas; STAFF só lista; SUPER_ADMIN não usa as rotas `/tables` (não tem restaurante). Escopo inicial: criar, listar e editar (nome, ativa/desativa); excluir mesa fica para TAB-06.
- **Implementado e resolvido (12/11/2026) [Implementado]**: register fluxo B (OWNER + restaurante em transação `runInTransaction`, slug automático com sufixo, `{ user, restaurant }`, erro genérico de e-mail duplicado); primeiro SUPER_ADMIN por seed (`SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`, 12+ caracteres); STAFF: desativar (PATCH) e excluir (DELETE, closed_by/done_by viram NULL); MANAGER é categoria (`users.category`, `job_title` removido); auth com cache em memória (TTL 30 s; Redis só para multi-instância). Os itens abaixo marcados "NÃO implementado" estão implementados, exceto `POST /restaurant` (substituído pelo fluxo B) e painel/insights.
- **Categoria do STAFF (12/11/2026) [Especificado, NÃO implementado]**: enum `staff_category` (WAITER, MANAGER, CLEANING, KITCHEN, OTHER) e coluna `users.category` anulável; CHECK: só preenchida quando `role = 'STAFF'`. MANAGER é categoria (não papel). Começa só como rótulo; filtrar chamados por categoria fica para quando o fluxo de chamados existir. `job_title` sai (substituído por `category`). Resolve a pendência MANAGER x `job_title` (DV-48). Código hoje: schema ainda tem `job_title`; migration só a `init` (enum ADMIN/STAFF).
- **Papéis redefinidos (12/11/2026) [Especificado, NÃO implementado]**: enum passa a SUPER_ADMIN / OWNER / STAFF. SUPER_ADMIN = dono da plataforma: vê insights e dashboard de todo o sistema, cria restaurantes e gerencia usuários de qualquer restaurante; restaurantId nulo. OWNER substitui o antigo ADMIN: dono de um restaurante, vê todas as métricas do SEU restaurante, acessa o painel do restaurante. STAFF: funcionário, acessa o painel do restaurante. Motivo: separar a operação da plataforma da do restaurante. Hoje o código tem ADMIN/STAFF e `POST /auth/register` cria ADMIN sem restaurante; `modules/administration` existe com arquivos vazios.
- **Gestão de equipe, register e restaurante (12/11/2026) [Especificado, NÃO implementado; código: enum ADMIN/STAFF, register cria ADMIN sem restaurante]**:
  1. OWNER cria, edita e remove (gerencia) os STAFF do próprio restaurante (resolve "OWNER cria/remove STAFF").
  2. `POST /auth/register` vira auto-cadastro de OWNER (resolve o destino do register). Rota pública: exige rate limit e mensagem genérica de e-mail duplicado [Planejado].
  3. O OWNER cria o PRÓPRIO restaurante (`POST /restaurant`). Um OWNER = um restaurante por vez. Vários restaurantes por OWNER = melhoria FUTURA (exigiria tabela de vínculo e restaurante ativo no JWT).
  4. STAFF (garçom ou gerente) e OWNER acessam o painel de chamados do restaurante (monitoramento).
  5. "restaurant_id obrigatório para OWNER" deixa de valer se o OWNER puder existir sem restaurante; fluxo A/B pendente (ver Pendentes).
- **Plano de implementação [Planejado]** (etapas): (1) migration (enum SUPER_ADMIN/OWNER/STAFF, `active`, CHECK de restaurant_id); (2) `req.user` + `ensureRole`; (3) repositories globais (SUPER_ADMIN, sem restaurantId); (4) login bloqueia usuário inativo; (5) módulo `administration`; (6) gestão de STAFF pelo OWNER; (7) register como auto-cadastro de OWNER (rate limit, erro genérico); (8) bootstrap do SUPER_ADMIN (depende da decisão pendente).
  - Pendentes derivadas (histórico, parte resolvida acima): (a) quem cria o primeiro SUPER_ADMIN (seed, script, variável de ambiente?); (b) OWNER cria/remove STAFF?; (c) `restaurant_id` obrigatório para OWNER e STAFF (e nulo só para SUPER_ADMIN)?; também em aberto: o destino de `POST /auth/register` (autocadastro público ainda existe ou só o SUPER_ADMIN cria restaurantes?), que afeta RF01.
