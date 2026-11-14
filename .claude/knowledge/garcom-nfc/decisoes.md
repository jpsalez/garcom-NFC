# Registro de decisões de produto

Preencha quando decidir. Os agentes leem este arquivo e deixam de perguntar o que já foi decidido. Formato: decisão, data, motivo.

Backlog: tela Tarefas do painel (`.claude/painel/tasks.json`). Aqui ficam só as DECISÕES; cada tarefa bloqueada aponta a sua em `bloqueada_por_decisao`.

## Pendentes
Formato: `- [ ] DEC-NN · título`; as linhas indentadas são detalhes. A tela Decisões e a tela Tarefas leem este bloco.

Nenhuma no momento.

(A lista anterior, sem ids, está em `../_arquivo/decisoes-lista-antiga.md`.)

## Resolvidas que estavam na lista de tarefas
- [x] DEC-03 · Chamados repetidos — um chamado aberto por tipo (garçom/conta) por sessão; tocar de novo devolve o chamado já aberto (200), sem card novo. O balcão mostra há quanto tempo o chamado está aberto, contado de `created_at`, que não é reiniciado pelo toque repetido. O cronômetro roda no front; a API só envia `created_at` e `serverTime` (para corrigir o relógio do balcão) e o Socket.IO só avisa chamado novo/finalizado. Contador de toques repetidos fica para depois do MVP (14/11/2026).
- [x] DEC-01 · Quem abre o atendimento da mesa — o primeiro scan do QR abre; o garçom (OWNER/STAFF) também pode abrir e encerrar pelo balcão (13/11/2026).
- [x] DEC-02 · Duração do atendimento — 4 h (`TABLE_SESSION_TTL`); 15 min antes de expirar, o balcão recebe um aviso; estender acrescenta mais 4 h (14/11/2026).
- [x] DEC-05 · Domínio e formato da URL pública — o domínio vem do `.env` (`PUBLIC_APP_URL`) e o sistema gera a URL `<PUBLIC_APP_URL>/m/<public_code>`; nunca digitada à mão (13/11/2026).
- [x] DEC-13 · Criar usuário em restaurante desativado — não pode (13/11/2026).
- [x] DEC-10 · Alerta sonoro no balcão — sim; o back-end só emite o evento de chamado novo e quem toca o som é o front-end. Nome e cobrança do produto ficam para depois do MVP (13/11/2026).
- [x] DEC-06 · Registrar qual garçom finalizou — login individual: cada STAFF entra com o próprio usuário e `done_by` recebe o id do token (13/11/2026, recomendação aceita por delegação).
- [x] DEC-07 · Novo scan após encerrar — abre um atendimento novo na hora, coerente com DEC-01; o abuso é contido por rate limit e limite de chamados (13/11/2026, por delegação).
- [x] DEC-08 · O que o cliente vê — só a confirmação de envio no MVP; o cliente não usa tempo real (13/11/2026, por delegação).
- [x] DEC-09 · "Manter aberto" — só no balcão; é a mesma ação de estender da DEC-02 (13/11/2026, por delegação).
- [x] DEC-11 · Prefixo da API — adotar `/api/v1` agora, antes de o front consumir a API (13/11/2026, por delegação).
- [x] DEC-12 · Código de erro estável — adotar `code` no formato de erro (`{ error, code, message, details }`), começando pelos erros novos (13/11/2026, por delegação).
- [x] DEC-04 · Tamanho do public_code: 8 ou 12 — 12 caracteres (12/11/2026).
- [x] DEC-14 · Fluxo do register (A x B) — B escolhido: register cria OWNER + restaurante em transação.
- [x] DEC-15 · Primeiro SUPER_ADMIN, remover STAFF e MANAGER x job_title — Seed por variáveis de ambiente; excluir (rota DELETE) além de desativar; MANAGER é categoria do STAFF.

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
