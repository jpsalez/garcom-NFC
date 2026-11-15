Título: Commit 4d688fa (main) versionou node_modules e conflita com a dev; ajustar antes de mesclar

O commit 4d688fa ("Listagem restaurantes ok / login e register ok...") foi direto na `main`, a partir de uma base anterior à `dev`.

## Problemas

1. **node_modules versionado (crítico).** O commit adiciona 21.407 arquivos de `node_modules/` na raiz do repositório (+4,2 milhões de linhas). Isso incha o repositório para sempre no histórico. Precisa sair do histórico (reescrever o commit antes de qualquer merge) e ganhar `node_modules/` no `.gitignore` da raiz.
2. **Conflito com a `dev`.** Em 8 arquivos do front: `globals.css`, `layout.tsx`, `header.tsx`, `loginPage.tsx` (apagado aqui e alterado na dev), `mesaPage.tsx`, `package.json`, `package-lock.json` e `services/auth.ts`.
3. **Rotas da API desatualizadas.** As rotas `app/api/**` chamam `${API_URL}/auth/login` etc. sem o prefixo `/api/v1` (DEC-11) e com `NEXT_PUBLIC_API_URL` sem `/api/v1`. Na `dev` todas as rotas estão sob `/api/v1`, então login, cadastro e admin retornam 404.
4. **`proxy.ts` bloqueia a tela do cliente.** `publicPrefixes` libera `/mesa/`, mas a tela da mesa na `dev` é `/m/[code]` (DEC-05, URL do QR/NFC). Quem escaneia o QR sem login seria redirecionado para `/login`. As rotas do balcão (`/admin/waiter`) e `/admin/mesas` e `/admin/equipe` também dependem do token no `localStorage`, não do cookie.
5. **Cookie `token` com 24 h e sem renovação.** Na `dev` o JWT dura 15 min e há `POST /auth/refresh` (refresh token de uso único). O cookie httpOnly é uma boa direção (resolve o risco de XSS do `localStorage`), mas precisa guardar também o refresh token e renovar.
6. **Erros perdem o `code`.** As rotas devolvem só `{ message }`; o front da dev trata erros pelo `code` (DEC-12).
7. **Config de dev alterada.** `docker-compose.yml` passa o front para `--webpack` e remove a regra do turbopack em `next.config.ts` (os estilos do projeto dependem dela). Se foi para contornar um problema, vale registrar o motivo.

## O que está bom e vale aproveitar
- Telas do SUPER_ADMIN (listar restaurantes, editar status, cadastro): é um item pendente do MVP.
- Cookie httpOnly via rotas do Next (BFF), alinhado ao ponto "token no localStorage" da revisão geral.
- `/esqueci-senha` já previsto como rota pública (a API de recuperação de senha está sendo feita).

## Proposta
1. Refazer o commit sem `node_modules` e com `node_modules/` no `.gitignore`.
2. Rebasear na `dev` (não na `main`) e abrir PR para a `dev`.
3. Apontar as rotas para `/api/v1`, repassar o `code` do erro e liberar `/m/` no `proxy.ts`.
4. Combinar com o João a estratégia de sessão (cookie httpOnly + refresh) antes de trocar o login.
