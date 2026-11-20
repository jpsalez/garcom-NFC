import type { PrintApiClient } from "./api.ts";
import { renderOrderTicket } from "./escpos.ts";
import {
  BeforeSendError,
  CredentialRevokedError,
  type PrintOutcome,
  type PrintTransport,
} from "./types.ts";

export type StepResult = "idle" | "processed" | "expired";

export interface AgentLogger {
  info(message: string): void;
  error(message: string): void;
}

const defaultLogger: AgentLogger = {
  info: (msg) => console.log(`[print-agent] ${msg}`),
  error: (msg) => console.error(`[print-agent] ${msg}`),
};

export interface ProcessOptions {
  minReservationMs?: number;
  logger?: AgentLogger;
}

export async function processNextJob(
  client: PrintApiClient,
  transport: PrintTransport,
  options: ProcessOptions = {},
): Promise<StepResult> {
  const logger = options.logger ?? defaultLogger;
  const minReservationMs = options.minReservationMs ?? 250;

  const job = await client.claim();
  if (!job) return "idle";

  const remainingMs = Date.parse(job.expires_at) - Date.now();
  if (Number.isNaN(remainingMs) || remainingMs <= minReservationMs) {
    logger.error(`Reserva ${job.reservation_id} da comanda ${job.id} vencida antes do envio.`);
    return "expired";
  }

  let outcome: PrintOutcome;
  try {
    const bytes = renderOrderTicket(job.payload);
    await transport.send(bytes);
    outcome = "SENT";
  } catch (err) {
    if (err instanceof BeforeSendError) {
      logger.error(`Falha antes do envio (${job.id}): ${err.message}`);
      outcome = "FAILED_BEFORE_SEND";
    } else {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Resultado incerto no envio (${job.id}): ${msg}`);
      outcome = "UNCERTAIN";
    }
  }

  const status = await reportWithRetry(client, job.id, job.reservation_id, outcome, job.expires_at);
  if (status === "conflict") {
    logger.error(`Conflito ao registrar ${outcome} para comanda ${job.id} (reserva substituída ou expirada).`);
  } else {
    logger.info(`Comanda ${job.id} (pedido ${job.payload.order_id}) registrada como ${outcome}.`);
  }
  return "processed";
}

async function reportWithRetry(
  client: PrintApiClient,
  jobId: string,
  reservationId: string,
  outcome: PrintOutcome,
  expiresAt: string,
): Promise<"accepted" | "conflict"> {
  const deadline = Date.parse(expiresAt);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await client.reportResult(jobId, reservationId, outcome);
    } catch (err) {
      if (err instanceof CredentialRevokedError || Date.now() >= deadline || attempt === 2) {
        throw err;
      }
      await sleep(500 * (attempt + 1));
    }
  }
  return "conflict";
}

export interface RunLoopOptions extends ProcessOptions {
  pollMs?: number;
  signal?: AbortSignal;
}

export async function runAgentLoop(
  client: PrintApiClient,
  transport: PrintTransport,
  options: RunLoopOptions = {},
): Promise<void> {
  const logger = options.logger ?? defaultLogger;
  const pollMs = options.pollMs ?? Number(process.env.PRINT_AGENT_POLL_MS || 1500);

  while (!options.signal?.aborted) {
    try {
      const result = await processNextJob(client, transport, options);
      if (result === "processed") continue;
    } catch (err) {
      if (err instanceof CredentialRevokedError) {
        logger.error(err.message);
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Erro na consulta da fila: ${msg}`);
    }
    await sleep(pollMs, options.signal);
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
