// @ts-check
import { api } from './api.js';
import { $, h } from './lib/dom.js';
import { startRealtime, watch } from './lib/realtime.js';
import { S, agentCounts } from './store.js';

/** Aplica um estado novo (do Socket.IO ou da consulta de reserva) e avisa as telas que o escutam. @param {{ runs?: any[], live?: any, pipes?: any[], spend?: any }} d */
function apply(d) {
  if (d.runs) S.runs = d.runs;
  if (d.live) S.live = d.live;
  if (d.pipes) S.pipes = d.pipes;
  if (d.spend) S.spend = d.spend;
  S.statusAt = Date.now();
  renderChips();
  document.dispatchEvent(new CustomEvent('painel:status'));
}

const GLOBAL = { global: true };
/** Uma consulta por assunto: só o que mudou é buscado de novo. */
const LOADERS = {
  runs: async () => { const [runs, spend] = await Promise.all([api('runs', 'GET', undefined, GLOBAL), api('spend', 'GET', undefined, GLOBAL)]); apply({ runs, spend }); },
  live: async () => apply({ live: await api('live', 'GET', undefined, GLOBAL) }),
  pipelines: async () => apply({ pipes: await api('pipelines', 'GET', undefined, GLOBAL) }),
};

/** Liga o status global (menu, topo, Visão geral): cada assunto do Socket.IO refaz só a sua consulta; sem socket, consulta de 8 em 8 s. */
export function startStatus() {
  startRealtime();
  Object.entries(LOADERS).forEach(([topic, fn]) => watch(topic, fn, 8000));
}

/** Busca tudo de uma vez (início da página e telas que precisam do estado já). */
export async function refreshStatus() {
  const r = await Promise.allSettled(Object.values(LOADERS).map(fn => fn()));
  const falhas = r.filter(x => x.status === 'rejected');
  if (falhas.length === r.length) throw /** @type {PromiseRejectedResult} */ (falhas[0]).reason;
}

/** @param {string} id @param {number | null} n */
function badge(id, n) {
  const el = $('#' + id); if (!el) return;
  el.textContent = n == null ? '–' : String(n); el.classList.toggle('hot', !!n);
}

/** Pinta o topo e os selos do menu a partir do estado (sem rede). */
export function renderChips() {
  const known = S.statusAt > 0, c = agentCounts();
  badge('b-run', known ? c.panel : null); badge('b-pipe', known ? c.pipes : null); badge('b-live', known ? c.live : null);
  const box = $('#chips'); if (!box) return; box.replaceChildren();
  const a = h('span', 'chip' + (c.total ? ' live' : '')); a.title = `${c.panel} no painel · ${c.live} na sessão interativa`;
  if (c.total) a.append(h('span', 'dot'));
  a.append(document.createTextNode('agentes '), h('b', '', known ? c.total : '–')); box.append(a);
  if (S.spend) { const g = h('span', 'chip'); g.append(document.createTextNode('gasto hoje '), h('b', '', 'US$ ' + S.spend.hoje.toFixed(2)), h('span', 'dim', ' / ' + S.spend.limite.toFixed(0))); box.append(g); }
}
