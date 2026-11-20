import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentLoop, processNextJob } from "../src/agent.ts";
import { PrintApiClient } from "../src/api.ts";
import { loadConfig } from "../src/config.ts";
import { createTransport } from "../src/transport.ts";
import { CredentialRevokedError } from "../src/types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(AGENT_ROOT, "..");
const TSX_BIN = path.join(REPO_ROOT, "back-end", "node_modules", ".bin", "tsx");

const API_PORT = Number(process.env.E2E_API_PORT || 4013);
const API_URL = `http://127.0.0.1:${API_PORT}`;
const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://garcom:garcom@127.0.0.1:5433/garcom_kds_agent_test?schema=public";

function assertIsolatedTestDb(dbUrl: string) {
  const parsed = new URL(dbUrl);
  const dbName = parsed.pathname.replace(/^\//, "");
  if (dbName !== "garcom_kds_agent_test") {
    throw new Error(`Banco inesperado '${dbName}'. Use exatamente garcom_kds_agent_test.`);
  }
}

function resetIsolatedDb(dbUrl: string) {
  assertIsolatedTestDb(dbUrl);
  const cleanUrl = dbUrl.split("?")[0] ?? dbUrl;
  execFileSync(
    "psql",
    [
      cleanUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      'TRUNCATE TABLE "calls","session_tokens","table_sessions","tables","users","restaurants" RESTART IDENTITY CASCADE;',
    ],
    { stdio: "pipe" },
  );
}

async function waitForHealth(apiUrl: string, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${apiUrl}/api/v1/health`);
      if (res.ok) return;
    } catch {
      // API ainda subindo
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`API não respondeu em ${apiUrl} dentro de ${timeoutMs}ms`);
}

function startApiServer(): ChildProcess {
  const child = spawn(TSX_BIN, ["src/main.ts"], {
    cwd: path.join(REPO_ROOT, "back-end"),
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(API_PORT),
      DATABASE_URL: DB_URL,
      JWT_SECRET: "segredo-de-teste-nao-usar-em-producao-0123456789abcdef",
      JWT_EXPIRES_IN: "1h",
      PUBLIC_APP_URL: "https://app.teste.com",
      TABLE_SESSION_TTL: "14400",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return child;
}

function runCli(args: string[], extraEnv: Record<string, string> = {}) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(TSX_BIN, ["src/cli.ts", ...args], {
      cwd: AGENT_ROOT,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function apiJson<T>(
  route: string,
  options: { method?: string; cookie?: string; tableToken?: string; body?: unknown } = {},
): Promise<{ status: number; body: T; setCookie?: string[] }> {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.Cookie = `access_token=${options.cookie}`;
  if (options.tableToken) headers["X-Table-Token"] = options.tableToken;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_URL}/api/v1${route}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  const body = (text ? JSON.parse(text) : null) as T;
  return { status: res.status, body, setCookie: res.headers.getSetCookie() };
}

function extractAccessToken(cookies: string[] = []): string {
  const line = cookies.find((c) => c.startsWith("access_token="));
  const value = line?.split(";")[0]?.slice("access_token=".length);
  if (!value) throw new Error("Cookie access_token ausente no login");
  return value;
}

async function setupRestaurantAndMenu() {
  const email = `kds-${randomUUID()}@teste.com`;
  const password = "senha-forte-123";
  const reg = await apiJson("/auth/register", {
    method: "POST",
    body: { name: "Dono Teste", email, password, restaurantName: "Cozinha Teste" },
  });
  assert.equal(reg.status, 201);

  const login = await apiJson("/auth/login", { method: "POST", body: { email, password } });
  assert.equal(login.status, 200);
  const token = extractAccessToken(login.setCookie);

  type DraftResponse = {
    draft_version: number;
    categories: {
      id: string;
      products: {
        id: string;
        variants: { id: string }[];
        option_groups: { id: string; options: { id: string }[] }[];
      }[];
    }[];
  };

  const cat = await apiJson<DraftResponse>("/menu/categories", {
    method: "POST",
    cookie: token,
    body: { name: "Lanches", expected_draft_version: 1 },
  });
  assert.equal(cat.status, 201);
  const categoryId = cat.body.categories[0]!.id;

  const prod = await apiJson<DraftResponse>("/menu/products", {
    method: "POST",
    cookie: token,
    body: {
      category_id: categoryId,
      name: "Hambúrguer da casa",
      initial_variant: { name: "Duplo", price_cents: 3200 },
      expected_draft_version: cat.body.draft_version,
    },
  });
  assert.equal(prod.status, 201);
  const product = prod.body.categories[0]!.products[0]!;
  const productId = product.id;
  const variantId = product.variants[0]!.id;

  const group = await apiJson<DraftResponse>(`/menu/products/${productId}/option-groups`, {
    method: "POST",
    cookie: token,
    body: {
      name: "Adicionais",
      min_selections: 0,
      max_selections: 2,
      expected_draft_version: prod.body.draft_version,
    },
  });
  assert.equal(group.status, 201);
  const groupId = group.body.categories[0]!.products[0]!.option_groups[0]!.id;

  const option = await apiJson<DraftResponse>(`/menu/option-groups/${groupId}/options`, {
    method: "POST",
    cookie: token,
    body: {
      name: "Queijo extra",
      price_delta_cents: 500,
      max_quantity: 2,
      expected_draft_version: group.body.draft_version,
    },
  });
  assert.equal(option.status, 201);
  const optionId = option.body.categories[0]!.products[0]!.option_groups[0]!.options[0]!.id;

  const link = await apiJson<DraftResponse>(`/menu/variants/${variantId}/option-groups`, {
    method: "PUT",
    cookie: token,
    body: {
      group_ids: [groupId],
      expected_draft_version: option.body.draft_version,
    },
  });
  assert.equal(link.status, 200);

  const pub = await apiJson<{ publication_id: string }>("/menu/publications", {
    method: "POST",
    cookie: token,
    body: { expected_draft_version: link.body.draft_version },
  });
  assert.ok([200, 201].includes(pub.status));

  const ordering = await apiJson("/ordering-settings", {
    method: "PATCH",
    cookie: token,
    body: { expected_version: 1, customer_ordering_enabled: true },
  });
  assert.equal(ordering.status, 200);

  const table = await apiJson<{ id: string; public_code: string }>("/tables", {
    method: "POST",
    cookie: token,
    body: { label: "Mesa 07" },
  });
  assert.equal(table.status, 201);

  const scan = await apiJson<{ token: string }>(`/public/tables/${table.body.public_code}/scan`, {
    method: "POST",
  });
  assert.equal(scan.status, 201);

  return {
    token,
    publicationId: pub.body.publication_id,
    productId,
    variantId,
    optionId,
    tableToken: scan.body.token,
  };
}

async function submitOrder(
  fixture: Awaited<ReturnType<typeof setupRestaurantAndMenu>>,
  notes?: string,
): Promise<{ id: string }> {
  const res = await apiJson<{ order: { id: string } }>("/public/orders", {
    method: "POST",
    tableToken: fixture.tableToken,
    body: {
      submission_key: randomUUID(),
      publication_id: fixture.publicationId,
      items: [
        {
          product_id: fixture.productId,
          variant_id: fixture.variantId,
          quantity: 2,
          notes,
          selections: [{ option_id: fixture.optionId, quantity: 1 }],
        },
      ],
    },
  });
  assert.equal(res.status, 201);
  return res.body.order;
}

async function listJobsByOrder(token: string, orderId: string) {
  const res = await apiJson<{
    jobs: {
      id: string;
      order_id: string;
      status: string;
      attempts: number;
      next_attempt_at: string | null;
      original_job_id: string | null;
    }[];
  }>(`/print-jobs?order_id=${orderId}`, { cookie: token });
  assert.equal(res.status, 200);
  return res.body.jobs;
}

function countTicketsInFile(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, "utf8");
  return (content.match(/=== COMANDA /g) ?? []).length;
}

async function waitUntil(fn: () => Promise<boolean>, timeoutMs = 10000, label = "condição") {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timeout aguardando ${label}`);
}

async function main() {
  resetIsolatedDb(DB_URL);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "garcom-print-agent-e2e-"));
  const configPath = path.join(tempDir, "agent-config.json");
  const emulatorOut = path.join(tempDir, "emulator-output.txt");
  const apiServer = startApiServer();
  let apiLogs = "";
  apiServer.stdout?.on("data", (d: Buffer) => {
    apiLogs += d.toString("utf8");
  });
  apiServer.stderr?.on("data", (d: Buffer) => {
    apiLogs += d.toString("utf8");
  });

  try {
    await waitForHealth(API_URL);

    // 0. test-print local sem API
    const testOut = path.join(tempDir, "test-print.txt");
    const testPrintRes = await runCli(["test-print", "--transport", "emulator", "--emulator-out", testOut]);
    assert.equal(testPrintRes.code, 0, testPrintRes.stderr);
    const testPrintText = fs.readFileSync(testOut, "utf8");
    assert.match(testPrintText, /COMANDA DE PRODUÇÃO/);
    assert.match(testPrintText, /Hambúrguer da casa/);
    console.log("OK | test-print local gravou comanda com acentos sem API.");

    // Setup restaurante, cardápio e mesa
    const f = await setupRestaurantAndMenu();

    // 1. Pareamento via CLI + pedido impresso sem navegador
    const pairingRes = await apiJson<{ code: string }>("/printing/kitchen/pairing", {
      method: "POST",
      cookie: f.token,
    });
    assert.equal(pairingRes.status, 201);

    const pairRes = await runCli([
      "pair",
      pairingRes.body.code,
      "--api",
      API_URL,
      "--transport",
      "emulator",
      "--emulator-out",
      emulatorOut,
      "--config",
      configPath,
    ]);
    assert.equal(pairRes.code, 0, pairRes.stderr);
    const mode = fs.statSync(configPath).mode & 0o777;
    assert.equal(mode, 0o600, `Permissão esperada 600, obtida ${mode.toString(8)}`);

    const enabledRes = await apiJson("/printing/kitchen", {
      method: "PATCH",
      cookie: f.token,
      body: { enabled: true },
    });
    assert.equal(enabledRes.status, 200);

    const order1 = await submitOrder(f, "Sem cebola. Pão bem tostado.");
    const cfg = loadConfig(configPath);
    const client = new PrintApiClient(cfg.apiUrl, cfg.credential);
    let noPaper = false;
    let loseConfirmation = false;
    const transport = createTransport(cfg, {
      noPaper: () => noPaper,
      loseConfirmation: () => loseConfirmation,
    });

    assert.equal(await processNextJob(client, transport), "processed");
    assert.equal(await processNextJob(client, transport), "idle");

    const jobs1 = await listJobsByOrder(f.token, order1.id);
    assert.equal(jobs1.length, 1);
    assert.equal(jobs1[0]?.status, "SENT");
    assert.equal(countTicketsInFile(emulatorOut), 1);
    const paper1 = fs.readFileSync(emulatorOut, "utf8");
    assert.match(paper1, /Mesa 07/);
    assert.ok(paper1.includes(`Pedido ${order1.id}`), "ID completo do pedido igual ao KDS");
    assert.match(paper1, /2x Hambúrguer da casa \(Duplo\)/);
    assert.match(paper1, /\+ 1x Adicionais: Queijo extra/);
    assert.match(paper1, /Obs\.: Sem cebola\. Pão bem tostado\./);
    assert.doesNotMatch(paper1, /SEGUNDA VIA/);
    console.log("OK | 1. Pareamento (600) e pedido impresso sem navegador com acentos e ID do KDS.");

    // 2. Falta de papel seguida de retomada
    noPaper = true;
    const order2 = await submitOrder(f, "Sem picles.");
    assert.equal(await processNextJob(client, transport), "processed");
    assert.equal(countTicketsInFile(emulatorOut), 1);

    const jobs2Before = await listJobsByOrder(f.token, order2.id);
    assert.equal(jobs2Before[0]?.status, "PENDING");
    assert.equal(jobs2Before[0]?.attempts, 1);
    assert.ok(jobs2Before[0]?.next_attempt_at);

    noPaper = false;
    const ac2 = new AbortController();
    const loop2 = runAgentLoop(client, transport, { pollMs: 400, signal: ac2.signal });
    await waitUntil(async () => (await listJobsByOrder(f.token, order2.id))[0]?.status === "SENT", 10000, "retomada");
    ac2.abort();
    await loop2;

    assert.equal(countTicketsInFile(emulatorOut), 2);
    const jobs2After = await listJobsByOrder(f.token, order2.id);
    assert.equal(jobs2After[0]?.attempts, 2);
    console.log("OK | 2. Falta de papel não imprimiu e retomou após backoff.");

    // 3. Reinício do agente (novo processo CLI lendo config do disco)
    const order3 = await submitOrder(f, "Bem passado.");
    const restarted = spawn(
      TSX_BIN,
      ["src/cli.ts", "run", "--config", configPath, "--poll-ms", "200"],
      {
        cwd: AGENT_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    try {
      await waitUntil(
        async () => (await listJobsByOrder(f.token, order3.id))[0]?.status === "SENT",
        8000,
        "reinício do agente",
      );
    } finally {
      restarted.kill("SIGTERM");
      await new Promise((r) => restarted.once("close", r));
    }
    assert.equal(countTicketsInFile(emulatorOut), 3);
    assert.equal(await processNextJob(new PrintApiClient(cfg.apiUrl, loadConfig(configPath).credential), transport), "idle");
    console.log("OK | 3. Reinício do agente retomou fila persistida sem duplicar.");

    // 4. Perda de confirmação virando incerto
    loseConfirmation = true;
    const order4 = await submitOrder(f, "Molho à parte.");
    assert.equal(await processNextJob(client, transport), "processed");
    assert.equal(countTicketsInFile(emulatorOut), 4);
    const jobs4 = await listJobsByOrder(f.token, order4.id);
    assert.equal(jobs4[0]?.status, "UNCERTAIN");

    loseConfirmation = false;
    assert.equal(await processNextJob(client, transport), "idle");
    assert.equal(countTicketsInFile(emulatorOut), 4);
    console.log("OK | 4. Perda de confirmação virou UNCERTAIN sem reimpressão automática.");

    // 5. Segunda via identificada no papel
    const reprintRes = await apiJson<{ id: string; original_job_id: string }>(`/orders/${order4.id}/reprints`, {
      method: "POST",
      cookie: f.token,
      body: { idempotency_key: randomUUID(), reason: "Confirmação perdida na bancada" },
    });
    assert.equal(reprintRes.status, 201);
    assert.equal(await processNextJob(client, transport), "processed");
    assert.equal(countTicketsInFile(emulatorOut), 5);

    const allPaper = fs.readFileSync(emulatorOut, "utf8");
    const lastTicket = allPaper.split("=== COMANDA ").at(-1) ?? "";
    assert.match(lastTicket, /SEGUNDA VIA/);
    assert.ok(lastTicket.includes(`Pedido ${order4.id}`));
    const jobs4After = await listJobsByOrder(f.token, order4.id);
    assert.equal(jobs4After.length, 2);
    assert.ok(jobs4After.some((j) => j.id === reprintRes.body.id && j.status === "SENT"));
    console.log("OK | 5. Segunda via impressa com marca SEGUNDA VIA.");

    // 6. Credencial revogada
    const revokeRes = await apiJson("/printing/kitchen/pairing", { method: "DELETE", cookie: f.token });
    assert.equal(revokeRes.status, 204);
    await assert.rejects(() => runAgentLoop(client, transport, { pollMs: 100 }), CredentialRevokedError);
    const revokedCli = await runCli(["run", "--config", configPath, "--poll-ms", "100"]);
    assert.notEqual(revokedCli.code, 0);
    assert.match(revokedCli.stderr, /revogada|inválida/i);
    console.log("OK | 6. Credencial revogada interrompeu o agente com erro 401.");
  } catch (err) {
    console.error("Logs da API:\n" + apiLogs);
    throw err;
  } finally {
    apiServer.kill("SIGTERM");
    await new Promise((r) => apiServer.once("close", r));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
