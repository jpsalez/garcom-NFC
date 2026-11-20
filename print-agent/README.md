# Garçom Print Agent

Serviço local de impressão de comandas da cozinha e emulador ESC/POS (48 colunas, PC850).

## Requisitos e verificação de tipos

Na pasta `print-agent/`, com `tsx` e `typescript` instalados (ou apontando para o `node_modules` local):

```bash
npm run typecheck
```

## 1. Parear o agente

Gere um código de pareamento no painel (ou via API `POST /api/v1/printing/kitchen/pairing`) e execute:

```bash
npm run pair -- <codigo> --api http://127.0.0.1:4000 --transport emulator
```

Opções úteis:
- `--config <caminho>` (ou `PRINT_AGENT_CONFIG`): arquivo de configuração salvo com permissão `600` (padrão: `~/.config/garcom-print-agent.json`).
- `--emulator-out <arquivo>` (ou `PRINT_EMULATOR_OUTPUT`): arquivo onde o emulador grava as comandas (padrão: `~/.local/share/garcom-print-agent/emulator-output.txt`).
- `--transport lp --printer <fila>`: configura envio futuro via `lp -d <fila>`.

## 2. Impressão de teste local (sem API)

```bash
npm run test-print
```

Simulando falhas no emulador:
- Falta de papel (`FAILED_BEFORE_SEND`): `--no-paper` ou `PRINT_EMULATOR_NO_PAPER=1`
- Perda de confirmação (`UNCERTAIN`): `--lose-confirmation` ou `PRINT_EMULATOR_LOSE_CONFIRMATION=1`

## 3. Rodar o loop de impressão

Ative a impressão automática da cozinha no sistema e inicie o agente:

```bash
npm run run-agent
```

O agente consulta `POST /api/v1/print-jobs/claim`, valida `expires_at`, renderiza ESC/POS com acentuação CP850, envia ao transporte configurado e registra o resultado (`SENT`, `FAILED_BEFORE_SEND` ou `UNCERTAIN`).

## 4. Teste ponta a ponta (API + PostgreSQL reais)

Crie/migre o banco isolado `garcom_kds_agent_test` na porta `5433` e execute:

```bash
DATABASE_URL="postgresql://garcom:garcom@127.0.0.1:5433/garcom_kds_agent_test?schema=public" npm run test:e2e
```
