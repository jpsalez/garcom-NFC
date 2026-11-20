import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { defaultEmulatorOutputPath } from "./config.ts";
import { decodeCp850 } from "./cp850.ts";
import { ESCPOS_CUT, ESCPOS_HEADER, TICKET_WIDTH } from "./escpos.ts";
import {
  type AgentConfig,
  BeforeSendError,
  type PrintTransport,
  UncertainPrintError,
} from "./types.ts";

export interface EmulatorOptions {
  outputPath?: string;
  noPaper?: boolean | (() => boolean);
  loseConfirmation?: boolean | (() => boolean);
}

function resolveFlag(value: boolean | (() => boolean) | undefined, envName: string): boolean {
  if (typeof value === "function") return value();
  if (typeof value === "boolean") return value;
  return process.env[envName] === "1" || process.env[envName] === "true";
}

export function parseEscPosTicket(data: Buffer): string {
  const startsWithHeader = data.subarray(0, ESCPOS_HEADER.length).equals(ESCPOS_HEADER);
  const endsWithCut = data.subarray(data.length - ESCPOS_CUT.length).equals(ESCPOS_CUT);
  if (!startsWithHeader || !endsWithCut) {
    throw new BeforeSendError("Payload ESC/POS inválido (cabeçalho ou corte ausente)");
  }
  const body = decodeCp850(data.subarray(ESCPOS_HEADER.length, data.length - ESCPOS_CUT.length)).trimEnd();
  for (const line of body.split("\n")) {
    if (line.length > TICKET_WIDTH) {
      throw new BeforeSendError(`Linha excede ${TICKET_WIDTH} colunas (${line.length})`);
    }
  }
  return body;
}

export class EmulatorTransport implements PrintTransport {
  private readonly outputPath: string;
  private readonly options: EmulatorOptions;

  constructor(options: EmulatorOptions = {}) {
    this.options = options;
    this.outputPath = path.resolve(options.outputPath || defaultEmulatorOutputPath());
  }

  getOutputPath(): string {
    return this.outputPath;
  }

  async send(data: Buffer): Promise<void> {
    if (resolveFlag(this.options.noPaper, "PRINT_EMULATOR_NO_PAPER")) {
      throw new BeforeSendError("Impressora sem papel (simulado)");
    }

    const body = parseEscPosTicket(data);
    fs.mkdirSync(path.dirname(this.outputPath), { recursive: true });
    const stamp = new Date().toISOString();
    const entry = `=== COMANDA ${stamp} ===\n${body}\n=== FIM ===\n\n`;
    fs.appendFileSync(this.outputPath, entry, "utf8");

    if (resolveFlag(this.options.loseConfirmation, "PRINT_EMULATOR_LOSE_CONFIRMATION")) {
      throw new UncertainPrintError("Perda de confirmação após o envio (simulado)");
    }
  }
}

export class LpTransport implements PrintTransport {
  private readonly queue?: string;

  constructor(queue?: string) {
    this.queue = queue;
  }

  send(data: Buffer): Promise<void> {
    const args = this.queue ? ["-d", this.queue] : [];
    return new Promise((resolve, reject) => {
      const child = spawn("lp", args, { stdio: ["pipe", "pipe", "pipe"] });
      let stderr = "";
      let stdinWritten = false;

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (err) => {
        reject(new BeforeSendError(`Falha ao iniciar lp: ${err.message}`));
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        const msg = stderr.trim() || `lp saiu com código ${code}`;
        // Se o lp falhou antes de aceitar os dados ou por fila indisponível, reporta antes do envio; se já escreveu tudo, é incerto.
        if (!stdinWritten) reject(new BeforeSendError(msg));
        else reject(new UncertainPrintError(`Retorno incerto do spooler lp: ${msg}`));
      });

      // EPIPE do lp não pode derrubar o agente antes de registrar o resultado.
      child.stdin.on("error", (err) => {
        if (!stdinWritten) reject(new BeforeSendError(`lp recusou os dados: ${err.message}`));
        else reject(new UncertainPrintError(`Escrita incerta no lp: ${err.message}`));
      });
      child.stdin.end(data, () => {
        stdinWritten = true;
      });
    });
  }
}

export function createTransport(
  config: Pick<AgentConfig, "transport" | "printer" | "emulatorOutputPath">,
  emulatorOverrides: EmulatorOptions = {},
): PrintTransport {
  if (config.transport === "lp") {
    return new LpTransport(config.printer);
  }
  return new EmulatorTransport({
    outputPath: emulatorOverrides.outputPath || config.emulatorOutputPath,
    noPaper: emulatorOverrides.noPaper,
    loseConfirmation: emulatorOverrides.loseConfirmation,
  });
}
