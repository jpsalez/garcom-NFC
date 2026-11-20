import { parseArgs } from "node:util";
import { runAgentLoop } from "./agent.ts";
import { PrintApiClient } from "./api.ts";
import {
  defaultConfigPath,
  defaultEmulatorOutputPath,
  loadConfig,
  saveConfig,
  tryLoadConfig,
} from "./config.ts";
import { renderOrderTicket, sampleTestPayload } from "./escpos.ts";
import { createTransport } from "./transport.ts";
import type { TransportKind } from "./types.ts";

function usage(): string {
  return [
    "Uso:",
    "  tsx src/cli.ts pair <codigo> [--api <url>] [--transport emulator|lp] [--printer <fila>] [--emulator-out <arquivo>] [--config <arquivo>]",
    "  tsx src/cli.ts run [--config <arquivo>] [--poll-ms <ms>] [--emulator-out <arquivo>] [--no-paper] [--lose-confirmation]",
    "  tsx src/cli.ts test-print [--config <arquivo>] [--transport emulator|lp] [--printer <fila>] [--emulator-out <arquivo>] [--no-paper] [--lose-confirmation]",
  ].join("\n");
}

function parseTransport(value: string | undefined): TransportKind {
  if (!value || value === "emulator") return "emulator";
  if (value === "lp") return "lp";
  throw new Error(`Transporte inválido: ${value}. Use 'emulator' ou 'lp'.`);
}

async function handlePair(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      api: { type: "string" },
      transport: { type: "string" },
      printer: { type: "string" },
      "emulator-out": { type: "string" },
      config: { type: "string" },
    },
  });

  const code = positionals[0];
  if (!code) throw new Error(`Código de pareamento obrigatório.\n${usage()}`);

  const apiUrl = values.api || process.env.PRINT_AGENT_API_URL || "http://127.0.0.1:4000";
  const transport = parseTransport(values.transport);
  if (transport === "lp" && !values.printer) {
    throw new Error("Informe --printer <fila> ao selecionar o transporte 'lp'.");
  }

  const client = new PrintApiClient(apiUrl);
  const paired = await client.pair(code);
  const savedPath = saveConfig(
    {
      apiUrl,
      destination: paired.destination,
      credential: paired.credential,
      transport,
      printer: values.printer,
      emulatorOutputPath: values["emulator-out"],
    },
    values.config || defaultConfigPath(),
  );
  console.log(
    `[print-agent] Pareado para ${paired.destination} com transporte '${transport}'. Configuração salva em ${savedPath} (modo 600).`,
  );
}

async function handleRun(args: string[]) {
  const { values } = parseArgs({
    args,
    allowPositionals: false,
    options: {
      config: { type: "string" },
      "poll-ms": { type: "string" },
      "emulator-out": { type: "string" },
      "no-paper": { type: "boolean" },
      "lose-confirmation": { type: "boolean" },
    },
  });

  const config = loadConfig(values.config || defaultConfigPath());
  const client = new PrintApiClient(config.apiUrl, config.credential);
  const transport = createTransport(config, {
    outputPath: values["emulator-out"],
    noPaper: values["no-paper"],
    loseConfirmation: values["lose-confirmation"],
  });

  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  const pollMs = values["poll-ms"] ? Number(values["poll-ms"]) : undefined;
  console.log(`[print-agent] Iniciando loop (${config.destination}, transporte=${config.transport}).`);
  try {
    await runAgentLoop(client, transport, { pollMs, signal: controller.signal });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

async function handleTestPrint(args: string[]) {
  const { values } = parseArgs({
    args,
    allowPositionals: false,
    options: {
      config: { type: "string" },
      transport: { type: "string" },
      printer: { type: "string" },
      "emulator-out": { type: "string" },
      "no-paper": { type: "boolean" },
      "lose-confirmation": { type: "boolean" },
    },
  });

  const existing = tryLoadConfig(values.config || defaultConfigPath());
  const transportKind = values.transport ? parseTransport(values.transport) : (existing?.transport ?? "emulator");
  const printer = values.printer ?? existing?.printer;
  const outputPath = values["emulator-out"] ?? existing?.emulatorOutputPath ?? defaultEmulatorOutputPath();

  const transport = createTransport(
    { transport: transportKind, printer, emulatorOutputPath: outputPath },
    {
      outputPath,
      noPaper: values["no-paper"],
      loseConfirmation: values["lose-confirmation"],
    },
  );
  await transport.send(renderOrderTicket(sampleTestPayload()));
  if (transportKind === "emulator") {
    console.log(`[print-agent] Impressão de teste gravada no emulador: ${outputPath}`);
  } else {
    console.log(`[print-agent] Impressão de teste enviada para fila '${printer ?? "padrão"}'.`);
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }
  if (command === "pair") await handlePair(rest);
  else if (command === "run") await handleRun(rest);
  else if (command === "test-print") await handleTestPrint(rest);
  else throw new Error(`Comando desconhecido: ${command}\n${usage()}`);
}

main().catch((err) => {
  console.error(`[print-agent] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
