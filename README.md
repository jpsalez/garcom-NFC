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

## Produção

`docker-compose.prod.yml` sobe PostgreSQL (sem porta exposta), API, front e Caddy (TLS automático nas portas 80 e 443). Copie `.env.prod.example` para `.env.prod`, preencha `DOMAIN`, `POSTGRES_PASSWORD` e `JWT_SECRET` (`openssl rand -hex 32`) e rode:

```
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

O Caddy é o único proxy à frente da API, então o compose já define `TRUST_PROXY=1`. O DNS do domínio precisa apontar para o servidor. `NEXT_PUBLIC_API_URL` é gravada no build do front: mudou o domínio, rode o comando de novo.

Detalhes do back-end em [`back-end/README.md`](back-end/README.md).

## Impressão da cozinha

O Psiu oferece dois modos de impressão automática em **Configurações → Impressão da cozinha**.

- **Navegador da cozinha**. Use uma impressora instalada como padrão no Windows e o Edge 144 ou posterior com a política [SilentPrintingEnabled](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/silentprintingenabled). Defina também o papel de 58 ou 80 mm nas preferências da impressora. Vincule o navegador nesse computador, abra a estação, envie uma via de teste e confirme que saiu sem abrir a janela de impressão. Mantenha a estação aberta e o computador ligado. A estação recebe avisos pelo Socket.IO e consulta a fila a cada 30 segundos como segurança. A fila registra o envio pelo navegador, e a equipe confere o papel quando o resultado fica incerto.
- **Star CloudPRNT**. A impressora consulta a API via HTTPS. O modelo de referência é a Star mC-Print3 de 80 mm com CloudPRNT HTTP e firmware 3.2 ou posterior. Gere as credenciais, configure-as na impressora e envie uma via de teste antes de ativar.

A compatibilidade física de cada combinação de impressora e modo precisa ser testada.
