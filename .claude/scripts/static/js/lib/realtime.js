// @ts-check
import { io } from '../../vendor/socketio/socket.io.esm.min.js';

/**
 * Tempo real por Socket.IO (cliente oficial em vendor/). O servidor só manda `changed` com os assuntos que mudaram
 * (runs, pipelines, live, git, tasks, decisions); cada tela assina o que lhe interessa e refaz só essa consulta.
 * Sem socket (servidor antigo, rede bloqueada) cada assinatura volta a consultar de tempos em tempos, só enquanto cair.
 */
const token = document.querySelector('meta[name="panel-token"]')?.getAttribute('content') ?? '';
/** @type {any} */ let socket = null;
let connected = false;
/** @type {Map<string, Set<() => any>>} */ const subs = new Map();
/** @type {Set<{ fn: () => any, ms: number, timer: number }>} */ const fallbacks = new Set();
/** @type {Map<string, number>} */ const queued = new Map();
/** @type {Set<string>} */ const dirty = new Set();

export const isConnected = () => connected;

/** Chama os assinantes do assunto, no máximo uma vez a cada 200 ms; com a aba oculta, deixa para quando ela voltar. @param {string} topic */
function fire(topic) {
  if (document.hidden) { dirty.add(topic); return; }
  if (queued.has(topic)) return;
  queued.set(topic, window.setTimeout(() => {
    queued.delete(topic);
    (subs.get(topic) || []).forEach(fn => { try { Promise.resolve(fn()).catch(() => { }); } catch (e) { /* uma tela com erro não derruba as outras */ } });
  }, 200));
}

const startFallback = (/** @type {{ fn: () => any, ms: number, timer: number }} */ f) => { if (!f.timer) f.timer = window.setInterval(() => { if (!document.hidden) Promise.resolve(f.fn()).catch(() => { }); }, f.ms); };
const stopFallback = (/** @type {{ timer: number }} */ f) => { clearInterval(f.timer); f.timer = 0; };

/** @param {boolean} on */
function setConnected(on) {
  if (on === connected) return;
  connected = on; document.body.dataset.rt = on ? 'on' : 'off';
  fallbacks.forEach(f => (on ? stopFallback(f) : startFallback(f)));
  document.dispatchEvent(new CustomEvent('painel:rt', { detail: on }));
}

/** Conecta (uma vez). Ao (re)conectar, todos os assinantes atualizam uma vez, porque podem ter perdido avisos. */
export function startRealtime() {
  if (socket) return;
  socket = io({ path: '/socket.io/', transports: ['websocket'], auth: { token }, reconnectionDelay: 1000, reconnectionDelayMax: 10_000 });
  socket.on('connect', () => { setConnected(true); subs.forEach((_, t) => fire(t)); });
  socket.on('disconnect', () => setConnected(false));
  socket.on('connect_error', () => setConnected(false));
  socket.on('changed', (/** @type {{ topics?: string[] }} */ m) => (m && m.topics ? m.topics : []).forEach(fire));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { [...dirty].forEach(fire); dirty.clear(); } });
}

/**
 * Chama `fn` quando algum dos assuntos mudar. `fallbackMs`: intervalo da consulta de reserva, usada só se o socket estiver fora.
 * Devolve algo que `clearTimers` (S.timers) sabe remover.
 * @param {string | string[]} topics @param {() => any} fn @param {number} [fallbackMs]
 */
export function watch(topics, fn, fallbackMs = 6000) {
  const list = ([]).concat(/** @type {any} */ (topics));
  list.forEach(t => { if (!subs.has(t)) subs.set(t, new Set()); /** @type {Set<() => any>} */ (subs.get(t)).add(fn); });
  const fb = { fn, ms: fallbackMs, timer: 0 }; fallbacks.add(fb);
  if (!connected) startFallback(fb);
  return { remove() { list.forEach(t => subs.get(t)?.delete(fn)); stopFallback(fb); fallbacks.delete(fb); } };
}
