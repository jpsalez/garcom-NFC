Título: Commit 4d688fa versionou o node_modules e não entrou na main; retomar o trabalho em cima da dev

O commit 4d688fa ("Listagem restaurantes ok / login e register ok...") foi feito direto na `main`, a partir de uma base anterior à `dev`.

## O que aconteceu

1. **`node_modules` versionado.** O commit adiciona 21.407 arquivos de `node_modules/` na raiz do repositório (+4,2 milhões de linhas). Isso continua no histórico da `main` (só sairia reescrevendo o histórico com force push). O `.gitignore` da raiz agora ignora `node_modules/`.
2. **Conflitos com a `dev`.** 8 arquivos do front: `globals.css`, `layout.tsx`, `header.tsx`, `loginPage.tsx`, `mesaPage.tsx`, `package.json`, `package-lock.json` e `services/auth.ts`.
3. **O resultado da mesclagem da `dev` na `main` ficou igual à `dev`** (commits 6722098, 79ddafa e 6bf012a). Do commit do Luan entrou **só o layout**, já adaptado na `dev` (64d680c, com ele como coautor): tema escuro, classes de formulário, cabeçalho e visual do login.

## O que NÃO entrou na árvore da main, e por quê

- `app/api/**` (login, cadastro e admin): chamam `${API_URL}/auth/login` etc. sem o prefixo `/api/v1` (DEC-11); com a API atual dariam 404. Também perdem o `code` do erro, que o front trata (DEC-12).
- `proxy.ts`: libera `/mesa/`, mas a tela do cliente é `/m/[code]` (URL do QR e do NFC, DEC-05). Quem escaneia o QR seria mandado para `/login`. Também exige o cookie `token`, e o balcão guarda a sessão no `localStorage`.
- Cookie `token` com 24 h e sem renovação: na `dev` o JWT dura 15 min e há `POST /auth/refresh` (refresh token de uso único).
- Telas do SUPER_ADMIN (`/admin`, `/admin/register`, `/admin/dashboard`, `components/admin/*`, `services/admin.ts`, `store/restaurantModal.ts`) e a dependência `zustand`.
- `next.config.ts` (rewrites, sem a regra do turbopack) e `--webpack` no `docker-compose.yml`: os estilos do projeto dependem da regra do turbopack. Se foi para contornar um problema, registrar o motivo.

O trabalho continua no histórico: `git show 4d688fa`.

## O que vale aproveitar

- As telas do SUPER_ADMIN (listar restaurantes, editar status, cadastrar) são um item pendente do MVP (`docs/PENDENCIAS-MVP.md`, seção 2).
- Cookie httpOnly via rotas do Next (BFF): resolveria o risco de XSS do `localStorage`, que está registrado para decisão.

## Proposta

1. Criar uma branch a partir da `dev` (não da `main`) e abrir PR para a `dev`.
2. Reaproveitar as telas do SUPER_ADMIN usando o cliente `api()` do front (`front-end/lib/api.ts`), que já usa `/api/v1`, renova o token e repassa o `code` do erro, e a sessão de `front-end/lib/session.ts`.
3. Se quiserem trocar a sessão para cookie httpOnly, combinar antes com o João: envolve front e back (guardar o refresh token no cookie e renovar).
4. Nunca versionar `node_modules` (rodar `git status` antes do `git add`).
