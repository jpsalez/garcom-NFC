// @ts-check
const T = document.querySelector('meta[name="panel-token"]')?.getAttribute('content') ?? ''; // o servidor preenche ao entregar a página

/** GET preso à tela atual: ao trocar de tela, o que ainda estiver em voo é cancelado. */
let screen = new AbortController();
export function newScreen() { screen.abort(); screen = new AbortController(); }

export class ApiError extends Error {
  /** @param {string} message @param {number} status 0 = sem resposta (timeout/rede) */
  constructor(message, status) { super(message); this.name = 'ApiError'; this.status = status; }
}
/** Cancelamento por troca de tela não é erro para o usuário. */
export const isAbort = (/** @type {any} */ e) => !!e && e.name === 'AbortError';

/**
 * @param {string} path caminho depois de /api/
 * @param {string} [method]
 * @param {any} [body]
 * @param {{ timeout?: number, global?: boolean }} [opts] global: não cancelar ao trocar de tela
 */
export async function api(path, method = 'GET', body, opts = {}) {
  const timeout = opts.timeout ?? (method === 'GET' ? 30_000 : 200_000);
  const signals = [AbortSignal.timeout(timeout)];
  if (method === 'GET' && !opts.global) signals.push(screen.signal);
  let r;
  try {
    r = await fetch('/api/' + path, {
      method, signal: AbortSignal.any(signals),
      headers: { 'X-Panel-Token': T, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new ApiError(`tempo esgotado em ${path} (${Math.round(timeout / 1000)} s)`, 0);
    if (e instanceof TypeError) throw new ApiError('sem resposta do painel (ele foi reiniciado?)', 0);
    throw e;
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.error || 'erro ' + r.status, r.status);
  return j;
}
