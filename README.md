# Garçom NFC

SaaS multi-restaurante: o cliente escaneia QR/NFC e chama o garçom ou pede a conta.

- `back-end/`: API (Node, TypeScript, Express, Prisma, PostgreSQL)
- `front-end/`: Next.js

## Subir tudo

Precisa só do Docker. Na raiz do projeto:

```
docker compose up
```

Não precisa criar `.env`. No primeiro boot a API instala dependências e aplica as migrations (alguns minutos); depois sobe rápido.

| Serviço | Endereço |
|---|---|
| Front-end | http://localhost:3000 |
| API | http://localhost:4000 |
| Documentação da API (Swagger) | http://localhost:4000/docs |
| Painel de controle (git, tarefas, decisões, arquivos) | http://localhost:8765 |
| PostgreSQL (só nesta máquina) | localhost:5432 |

Criar o primeiro restaurante: `POST /auth/register` (pelo Swagger). Dados de exemplo: `docker compose exec api npm run db:seed`.

Para mudar portas ou o segredo do JWT, crie um `.env` na raiz (`JWT_SECRET`, `API_PORT`, `WEB_PORT`, `DB_PORT`). O segredo padrão do compose serve só para desenvolvimento.

`docker compose down` para tudo (mantém o banco); `docker compose down -v` apaga o banco.

Detalhes do back-end em [`back-end/README.md`](back-end/README.md).
