# Modo IA (preparado, desligado)

Tudo aqui está **pronto, mas fora do seu código**. Nada em `back-end/` é alterado até você ligar.

## Conteúdo (`templates/`, espelha a estrutura de `back-end/`)
- `.env.test`, `.env.example`: variáveis (teste usa banco descartável na porta 5433, nome termina em `_test`).
- Banco de teste: serviço `db-test` (perfil `test`) do `back-end/docker-compose.yml`, em memória, porta 5433. Não é copiado: o compose já existe no projeto.
- `vitest.config.ts`, `tests/`: configuração, helpers (app sem porta, limpeza do banco, fábricas) e 5 arquivos de teste: saúde, auth, isolamento entre restaurantes, índice de sessão única por mesa.
- `biome.json`: lint + formatação (Biome, porque o `typescript-eslint` ainda não suporta TypeScript 7).
- `prisma/seed.ts`: restaurante demo, admin e 5 mesas.
- `.github/workflows/ci.yml`: typecheck, lint e testes a cada push.
- `package.additions.json`: scripts e dependências que o `ai_mode.py` aplica.

## Como usar
```
python3 .claude/scripts/ai_mode.py status           # o que falta
python3 .claude/scripts/ai_mode.py enable            # simulação
python3 .claude/scripts/ai_mode.py enable --apply    # copia arquivos e ajusta scripts (backup do package.json)
cd back-end && npm i -D vitest supertest @types/supertest @biomejs/biome
npm run test:db:up && npm test
python3 .claude/scripts/ai_mode.py disable --apply   # desfaz tudo que o enable fez
```
Requisitos: Docker acessível ao seu usuário (grupo `docker`).

## Observações
- `format:check` reprova o código atual (mistura de 2 e 4 espaços). Rode `npm run format` uma vez, quando quiser padronizar; o CI não o exige.
- `lint` mostra 4 avisos no código atual (imports que podem virar `import type`). São avisos, não falhas.
- Para a IA implementar sozinha: `/implementar <tarefa>`.
