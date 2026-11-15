# O que falta para fechar os módulos e o MVP

Atualizado em 14/11/2026, com a `dev` em `64d680c`. Todos os módulos de domínio do back-end estão implementados e o front cobre o fluxo principal. O que resta é **validar, fechar o front, publicar e limpar o repositório**. Nada abaixo exige novo módulo.

**O MVP está pronto quando:** os testes passam num banco real, o fluxo completo funciona no navegador e no celular, a `dev` está mesclada na `main` e o sistema roda num servidor com domínio e HTTPS.

---

## 1. Bloqueantes (faça nesta ordem)

### 1.1 Rodar os testes num banco real
Os ~100 testes nunca rodaram na máquina onde o código foi escrito (sem Docker). Além disso, 3 migrations novas nunca foram aplicadas: `sessions_created_at_closed_at`, `refresh_tokens` e `password_resets`.

```
cd back-end
npm run test:db:up      # sobe o banco de teste (porta 5433)
npm test
npm run test:db:down
```
- [ ] Todos passam. Se algum falhar, a causa mais provável é a migration escrita à mão ou um teste novo (`password-reset`, `auth` com refresh, `sessions` com paginação).
- [ ] `docker compose up` sobe API, front, banco e Mailpit sem erro (a API aplica as migrations ao subir).

### 1.2 Resolver o commit do Luan na `main`
O commit `4d688fa` (na `main`) **versionou o `node_modules`** (21 mil arquivos) e está baseado numa versão antiga. Ver o texto completo em [`issue-commit-luan-4d688fa.md`](issue-commit-luan-4d688fa.md).
- [ ] Abrir a issue no GitHub (o `gh` não está logado: `! gh auth login`, depois `gh issue create --title "..." --body-file docs/issue-commit-luan-4d688fa.md`).
- [ ] Combinar com o Luan: refazer o commit sem `node_modules`, rebasear na `dev` e abrir PR para a `dev`.
- [ ] Decidir como limpar a `main`: desfazer o commit (exige force push na `main`) ou reverter. **Faça antes de mesclar a `dev`**, senão o `node_modules` fica no histórico para sempre.
- [ ] Adicionar `node_modules/` ao `.gitignore` da raiz.

O layout dele já foi trazido para a `dev` (tema escuro, cabeçalho e login). O que **não** foi trazido e é dele: telas do SUPER_ADMIN, cookie httpOnly, `proxy.ts` e as rotas `app/api/**`.

### 1.3 Mesclar a `dev` na `main`
Só depois dos itens 1.1 e 1.2. A `dev` continua sendo a branch de desenvolvimento.
- [ ] `git switch main && git merge dev` (ou PR), e voltar para a `dev`.

### 1.4 Testar o fluxo completo no navegador e no celular
Ninguém rodou isso depois das mudanças de refresh token, tema escuro e recuperação de senha.
- [ ] Cadastro de restaurante (`POST /auth/register`) e login.
- [ ] Criar mesa, baixar o QR, abrir `/m/<código>` no celular.
- [ ] Chamar garçom e pedir a conta; o card aparece no balcão em tempo real e com som.
- [ ] Finalizar o chamado; estender e encerrar o atendimento; o cliente que toca de novo recebe um atendimento novo.
- [ ] Deixar o balcão aberto por mais de 15 minutos e confirmar que ele continua logado (renovação do token) e que o socket reconecta.
- [ ] Esqueci minha senha: `/esqueci-senha` → e-mail no Mailpit (`http://localhost:8025`) → `/redefinir-senha` → login com a senha nova.
- [ ] **Conferir as cores:** o tema escuro mudou o texto padrão para claro. Olhar balcão, mesas, equipe, modal do QR e modal de confirmação da conta, que têm fundo claro.

---

## 2. Front-end que falta

- [ ] **Tela de cadastro de restaurante** (`/cadastro`, RF01): a API existe, falta a tela. O Luan tem uma versão em `/admin/register` na `main`, mas como tela do SUPER_ADMIN.
- [ ] **Telas do SUPER_ADMIN**: listar restaurantes, ativar ou desativar, gerir usuários. O login dele hoje mostra "ainda não tem tela". Aproveitar o trabalho do Luan (ver 1.2), usando o cliente `api()` e o token da sessão.
- [ ] Decidir a sessão do navegador: hoje o token fica no `localStorage` (risco de XSS). A alternativa é cookie httpOnly, que o Luan começou. Se for trocar, é uma mudança que envolve front e back juntos.

---

## 3. Publicar (produção)

O compose de produção existe (`docker-compose.prod.yml`, Dockerfiles e Caddy) mas **nunca foi executado**.
- [ ] Servidor com Docker e um domínio apontando para ele (DNS).
- [ ] `cp .env.prod.example .env.prod` e preencher `DOMAIN`, `POSTGRES_PASSWORD` e `JWT_SECRET` (`openssl rand -hex 32`).
- [ ] `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`. Se o build falhar, os pontos prováveis são `prisma generate` e a ordem de subida da API e do banco.
- [ ] **E-mail:** contratar um SMTP (Resend, SES, Mailgun ou o do seu provedor) e preencher `SMTP_URL` e `MAIL_FROM` no `.env.prod`. Sem isso a recuperação de senha não envia nada.
- [ ] Criar o primeiro SUPER_ADMIN: `SUPER_ADMIN_EMAIL` e `SUPER_ADMIN_PASSWORD` (12+ caracteres) e `npm run db:seed:super-admin` na API; depois **apagar a senha** do ambiente.
- [ ] Conferir `TRUST_PROXY=1` funcionando: tentar logar errado várias vezes e ver o limite valer por cliente, não para todos.
- [ ] **Backup do banco** (não existe): agendar `pg_dump` do volume `pgdata_prod`.
- [ ] Definir o domínio definitivo (`PUBLIC_APP_URL`) **antes de gravar as tags NFC**: travar a tag é irreversível. Testar com tags de teste primeiro.

---

## 4. Back-end: melhorias que não bloqueiam

Pode fazer depois do piloto, nesta ordem de valor:
- [ ] `extend` não é condicional: um `close` simultâneo pode gerar `session:extended` depois de `session:closed`.
- [ ] "Último OWNER" não é atômico: dois OWNER se desativando ao mesmo tempo passam os dois.
- [ ] Criar usuário com e-mail repetido revela que a conta existe (o autocadastro já responde de forma genérica).
- [ ] Trocar a senha estando logado (`PATCH /auth/password`): a recuperação por e-mail já existe, falta esta.
- [ ] `npm audit`: 3 vulnerabilidades altas na cadeia do CLI do Prisma (a correção exige `--force`; avaliar antes de aplicar).
- [ ] Data de cancelamento do chamado e `created_at` em `session_tokens` (para relatórios).
- [ ] Mais de uma instância da API: adapter Redis do Socket.IO e lock do job de expiração.

---

## 5. Documentação e repositório

- [x] PDF regerado em 14/11/2026 (v1.2, com refresh token, recuperação de senha, helmet, paginação e timestamps). Falta guardar o gerador (Python mais Chromium), que está só na pasta temporária da sessão: vale colocá-lo em `.claude/scripts/` para regerar sem depender dela.
- [ ] Você tem alterações **não commitadas** de antes desta sessão (painel e scripts em `.claude/scripts/`, skill `monitor`, `agentes.py`, remoções em `.claude/painel` e `.claude/scripts`). Commitar ou descartar.
- [ ] Formatação: `routes.ts` e os controllers usam 4 espaços e aspas simples, e o `biome.json` define 2 espaços e aspas duplas. `npm run format` mexe em muitos arquivos; faça num commit só, depois dos testes.
- [ ] Rodar `python3 .claude/scripts/verify.py`, `check_tenant.py` e `doc_drift.py` antes de cada merge.

---

## 6. Fora do MVP (depois do lançamento)

Cardápio digital, comanda do garçom e KDS, avaliações, relatórios e métricas para OWNER e SUPER_ADMIN, app do garçom e setores, integração com PDV. Em aberto de produto: **nome definitivo e cobrança (planos)**.

---

## Estado dos módulos

| Módulo | Back-end | Front |
|---|---|---|
| auth (cadastro, login, refresh, logout, `/me`, recuperação de senha) | Completo | Login e recuperação feitos; falta o cadastro |
| users e administration | Completo | Equipe do OWNER feita; falta o SUPER_ADMIN |
| restaurants | Completo | Falta a tela do SUPER_ADMIN |
| tables (CRUD, QR, exclusão) | Completo | Feito (`/admin/mesas`) |
| sessions (scan, abrir, estender, encerrar, expiração, histórico paginado) | Completo | Feito (balcão) |
| calls (chamar, listar, finalizar) | Completo | Feito (mesa e balcão) |
| Socket.IO e job de expiração | Completo | Feito |
| Docker e CI | Dev e produção escritos | Produção não testada |
