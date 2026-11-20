import { type ClaimedJob, CredentialRevokedError, type PrintOutcome } from "./types.ts";

function baseUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, "");
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; code?: string };
    return body.message || body.code || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export class PrintApiClient {
  private readonly apiBase: string;
  private readonly credential?: string;

  constructor(apiUrl: string, credential?: string) {
    this.apiBase = `${baseUrl(apiUrl)}/api/v1`;
    this.credential = credential;
  }

  private authHeaders(): Record<string, string> {
    if (!this.credential) throw new Error("Credencial do agente ausente");
    return {
      Authorization: `Bearer ${this.credential}`,
      "Content-Type": "application/json",
    };
  }

  async pair(code: string): Promise<{ destination: "KITCHEN"; credential: string }> {
    const res = await fetch(`${this.apiBase}/print-agent/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      throw new Error(`Falha ao parear (${res.status}): ${await readErrorMessage(res)}`);
    }
    return (await res.json()) as { destination: "KITCHEN"; credential: string };
  }

  async contact(): Promise<void> {
    const res = await fetch(`${this.apiBase}/print-agent/contact`, {
      method: "POST",
      headers: this.authHeaders(),
    });
    if (res.status === 401) throw new CredentialRevokedError();
    if (!res.ok) throw new Error(`Falha no contato (${res.status}): ${await readErrorMessage(res)}`);
  }

  async claim(): Promise<ClaimedJob | null> {
    const res = await fetch(`${this.apiBase}/print-jobs/claim`, {
      method: "POST",
      headers: this.authHeaders(),
      body: "{}",
    });
    if (res.status === 204) return null;
    if (res.status === 401) throw new CredentialRevokedError();
    if (!res.ok) throw new Error(`Falha ao reservar comanda (${res.status}): ${await readErrorMessage(res)}`);
    return (await res.json()) as ClaimedJob;
  }

  async reportResult(
    jobId: string,
    reservationId: string,
    outcome: PrintOutcome,
  ): Promise<"accepted" | "conflict"> {
    const res = await fetch(`${this.apiBase}/print-jobs/${jobId}/result`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({ reservation_id: reservationId, outcome }),
    });
    if (res.status === 204) return "accepted";
    if (res.status === 409) return "conflict";
    if (res.status === 401) throw new CredentialRevokedError();
    throw new Error(`Falha ao registrar resultado (${res.status}): ${await readErrorMessage(res)}`);
  }
}
