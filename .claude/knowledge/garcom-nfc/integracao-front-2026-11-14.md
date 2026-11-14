# Integração do front com o back-end (14/11/2026)

Feita em modo autônomo (usuário ausente), em branches `ia/integracao-*` a partir da `dev`, validada com um navegador de verdade (Playwright) contra a API e um banco de desenvolvimento (`garcom_dev`). O front (Next.js 16, App Router, React 19, `cacheComponents` ligado) é de outro dev: o estilo e os componentes dele foram mantidos; só entrou lógica e dados reais. Antes de escrever código, a documentação da versão fica em `front-end/node_modules/next/dist/docs/` (pedido do `front-end/AGENTS.md`).

## Como rodar tudo
1. Banco e API: `docker compose up` na raiz (ou, sem Docker, um Postgres e `npm run dev` em `back-end/` com `DATABASE_URL`, `JWT_SECRET`, `PUBLIC_APP_URL=http://localhost:3000`, `FRONTEND_URL=http://localhost:3000`).
2. Dados de desenvolvimento: `cd back-end && npm run db:seed` (OWNER `admin@demo.com` / `admin123` e 5 mesas; o seed imprime o caminho `/m/<código>` de cada mesa).
3. Front: `cd front-end && NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1 npm run dev` (porta 3000).

## Arquitetura do front
- `lib/api.ts`: único ponto de `fetch` (base `NEXT_PUBLIC_API_URL`, padrão `http://localhost:4000/api/v1`). Erros viram `ApiError` com `status` e `code` (DEC-12); trate pelo `code`. Um 401 com token do balcão limpa a sessão.
- `lib/session.ts`: sessão do balcão (`{ token, user }`) no `localStorage` (chave `psiu.session`); `useSession()` usa `useSyncExternalStore` e reage ao login e ao logout na mesma aba e entre abas. `undefined` = carregando, `null` = sem login.
- `components/requireAuth.tsx`: protege telas do balcão por papel; sem sessão (ou papel errado) vai para `/login`.
- Dados do balcão só em Client Components, com o token da sessão: o `RequireAuth` esconde a tela no cliente, mas um Server Component filho entraria no HTML sem login. A autorização de verdade é da API.
- Páginas do Next são Server Components: não passe funções como filhos para componentes de cliente (quebra a renderização); quem precisa do token usa `useSession()`.

## Decisões tomadas sem o usuário (REVISAR)
- Token do balcão no `localStorage` (não cookie httpOnly): mais simples e sem proxy no Next; o risco é XSS, e o JWT expira (padrão 1 dia). Alternativa futura: cookie httpOnly com rota de login no próprio Next.
- SUPER_ADMIN, que não tem restaurante, ainda não tem tela: o login dele mostra um aviso.

## Passos
| Passo | Branch | Estado |
| --- | --- | --- |
| 1. Base: cliente da API, login real, guarda de rotas, logout, seed com códigos válidos | `ia/integracao-base` | em revisão |
| 2. Balcão: chamados e atendimentos reais, Socket.IO, finalizar, estender, encerrar, aviso de 15 min | `ia/integracao-balcao` | a fazer |
| 3. Mesa do cliente: `/m/[code]` com scan, token do aparelho e chamados | `ia/integracao-mesa` | a fazer |
| 4. Gestão do OWNER: mesas com QR Code e equipe | `ia/integracao-gestao` | a fazer |
