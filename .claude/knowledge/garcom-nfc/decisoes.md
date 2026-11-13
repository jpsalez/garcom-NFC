# Registro de decisões de produto

Preencha quando decidir. Os agentes leem este arquivo e deixam de perguntar o que já foi decidido. Formato: decisão, data, motivo.

Backlog: tela Tarefas do painel (`.claude/painel/tasks.json`). Aqui ficam só as DECISÕES; cada tarefa bloqueada aponta a sua em `bloqueada_por_decisao`.

## Pendentes
Formato: `- [ ] DEC-NN · título`; as linhas indentadas são detalhes. A tela Decisões e a tela Tarefas leem este bloco.

- [ ] DEC-01 · Quem abre o atendimento da mesa
  - Opções e contexto: Opções: garçom no balcão / primeiro scan do QR (token) / primeiro chamado. Define o fluxo público inteiro.
  - Nota sua: o garçom no balcão abre a mesa como fecha ela também.
  - Atenção: a nota acima parece uma decisão. Confirme marcando a caixa para destravar as tarefas.
  - Fase: MVP-2 · Prioridade: P0 · Refs: RF04, RN
  - Bloqueia: SES-01, SES-02b
- [ ] DEC-02 · Duração do atendimento: 3 h ou 4 h
  - Opções e contexto: v0.3 diz 4 h (configurável por TABLE_SESSION_TTL); módulos/guia usam 3 h.
  - Fase: MVP-3 · Prioridade: P1 · Refs: RF12
  - Bloqueia: SES-02b
- [ ] DEC-03 · Chamados repetidos
  - Opções e contexto: Um card por chamado (RN08) / agrupar / bloquear por tipo (409, índice parcial calls_one_open_per_type).
  - Fase: MVP-2 · Prioridade: P0 · Refs: RN08, RN12
  - Bloqueia: CAL-01, DB-03
- [ ] DEC-05 · Domínio e formato da URL pública
  - Opções e contexto: Gravar NFC é irreversível: definir domínio e formato (ex.: /m/<code>) antes de gravar qualquer tag.
  - Fase: MVP-1 · Prioridade: P1 · Refs: RF13
  - Bloqueia: FE-03b, NFC-02, OPS-03, TAB-04
- [ ] DEC-06 · Registrar qual garçom finalizou o chamado
  - Opções e contexto: Balcão compartilhado (acesso único) ou login individual. Afeta done_by e o painel do balcão.
  - Fase: MVP-2 · Prioridade: P1 · Refs: 9.4.3
  - Bloqueia: CAL-04
- [ ] DEC-07 · Após encerrar, um novo scan abre atendimento na hora?
  - Opções e contexto: Ligado a DEC-01. Define o comportamento da tela da mesa depois do encerramento.
  - Fase: MVP-3 · Prioridade: P1 · Refs: 9.4.3
- [ ] DEC-08 · O cliente vê o chamado como finalizado ou só a confirmação de envio?
  - Opções e contexto: Define eventos para o aparelho do cliente (RF07) e se o cliente precisa de canal em tempo real.
  - Fase: MVP-2 · Prioridade: P2 · Refs: RF07
  - Bloqueia: CAL-06
- [ ] DEC-09 · "Manter aberto": só no balcão ou também pelo cliente
  - Opções e contexto: Afeta rotas públicas e o abuso (sessão eterna).
  - Fase: MVP-3 · Prioridade: P2 · Refs: RF11
  - Bloqueia: SES-06
- [ ] DEC-10 · Alerta sonoro no balcão e nome/cobrança do produto
  - Opções e contexto: Pontos a validar da v0.3. Nome definitivo do produto e modelo de planos.
  - Fase: Pós-MVP · Prioridade: P3 · Refs: 9.4.3
  - Bloqueia: FE-05c
- [ ] DEC-11 · Prefixo /api/v1 e porta 4000 da v0.3
  - Opções e contexto: Código usa porta 3000 e sem prefixo. Decidir antes do front consumir a API.
  - A porta já foi resolvida (back-end 4000, front-end 3000). Resta só o prefixo /api/v1.
  - Fase: MVP-1 · Prioridade: P2 · Refs: cap-09
  - Bloqueia: INF-08
- [ ] DEC-12 · Código de erro estável (error.code) no formato de erro
  - Opções e contexto: Hoje a resposta é { error, message, details }. O front pode precisar de códigos.
  - Fase: MVP-2 · Prioridade: P3
- [ ] DEC-13 · Criar usuário em restaurante desativado: pode?
  - Opções e contexto: Hoje o service permite. Apontado pelo revisor; é regra de produto.
  - Fase: Agora · Prioridade: P3

(A lista anterior, sem ids, está em `../_arquivo/decisoes-lista-antiga.md`.)

## Resolvidas que estavam na lista de tarefas
- [x] DEC-04 · Tamanho do public_code: 8 ou 12 — 12 caracteres (12/11/2026).
- [x] DEC-14 · Fluxo do register (A x B) — B escolhido: register cria OWNER + restaurante em transação.
- [x] DEC-15 · Primeiro SUPER_ADMIN, remover STAFF e MANAGER x job_title — Seed por variáveis de ambiente; excluir (rota DELETE) além de desativar; MANAGER é categoria do STAFF.

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
