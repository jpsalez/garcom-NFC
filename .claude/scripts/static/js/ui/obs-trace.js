// @ts-check
import { h } from '../lib/dom.js';
import { fmtDur } from '../lib/format.js';
import { S } from '../store.js';
import { md } from './markdown.js';

/** @param {number | string | undefined} a @param {number | string | undefined} b */
const dur = (a, b) => (a && b ? fmtDur(+new Date(b) - +new Date(a)) : '');

/**
 * Eventos do agente viram uma lista de itens: mensagens, ferramentas e subagentes (com os itens de dentro).
 * @param {any[]} events @param {string} runStatus
 */
export function buildModel(events, runStatus) {
  /** @type {any[]} */ const items = [];
  /** @type {Record<string, any>} */ const by = {};
  for (const e of events) {
    if (e.k === 'user') items.push({ type: 'user', e });
    else if (e.k === 'sys') items.push({ type: 'sys', e });
    else if (e.k === 'err') items.push({ type: 'err', e });
    else if (e.k === 'final') items.push({ type: 'final', e });
    else if (e.k === 'text') { if (e.parent && by[e.parent]) by[e.parent].nested.push({ type: 'text', e }); else items.push({ type: 'text', e }); }
    else if (e.k === 'tool') {
      const ag = e.tool === 'Agent' || e.tool === 'Task';
      const it = { type: ag ? 'agent' : 'tool', e, nested: [], status: 'rodando', t0: e.t }; by[e.id] = it;
      if (e.parent && by[e.parent]) by[e.parent].nested.push(it); else items.push(it);
    } else if (e.k === 'toolres') { const it = by[e.id]; if (it) { it.status = e.err ? 'erro' : 'ok'; it.t1 = e.t; it.res = e.text; } }
  }
  const dead = runStatus !== 'rodando' && runStatus !== 'pausado';
  /** @param {any[]} a */
  const fix = a => a.forEach(it => { if (it.status === 'rodando' && dead) it.status = 'interrompido'; if (it.nested) fix(it.nested); });
  fix(items); return items;
}

/** Marca de status de uma ferramenta ou agente: giro enquanto roda, ✓ ✕ – depois. @param {string} st */
export function statusMark(st) {
  const s = h('span', 'mark');
  if (st === 'rodando') s.append(h('span', 'spin')); else { s.textContent = st === 'ok' ? '✓' : st === 'erro' ? '✕' : '–'; s.classList.add(st === 'ok' ? 'ok' : st === 'erro' ? 'err' : 'idle'); }
  return s;
}

/** Linha de uma ferramenta: marca, nome, alvo e duração. @param {any} it */
export function toolRow(it) {
  const r = h('div', 'tline'); r.append(statusMark(it.status), h('b', '', it.e.tool), h('span', 'tgt ellipsis', it.e.target || ''));
  const d = dur(it.t0, it.t1); if (d) r.append(h('span', 'dur', d));
  return r;
}

/** Subagente: uma linha que abre (teclado e mouse) e mostra o que ele fez por dentro. @param {any} it */
export function agentCard(it) {
  const open = S.open.has(it.e.id);
  const c = h('div', 'sub' + (it.status === 'rodando' ? ' running' : '') + (open ? ' open' : ''));
  const hd = h('button', 'sub-h'); hd.type = 'button'; hd.setAttribute('aria-expanded', String(open));
  const tools = it.nested.filter((/** @type {any} */ x) => x.type !== 'text');
  const meta = dur(it.t0, it.t1) || (it.status === 'rodando' ? tools.length + ' chamadas' : '');
  hd.append(h('span', 'chev', '▸'), statusMark(it.status), h('b', '', it.e.stype || 'agente'), h('span', 'ds ellipsis', it.e.desc || it.e.target || ''), h('span', 'dur', meta));
  hd.onclick = () => { S.open.has(it.e.id) ? S.open.delete(it.e.id) : S.open.add(it.e.id); c.classList.toggle('open'); hd.setAttribute('aria-expanded', String(c.classList.contains('open'))); };
  c.append(hd);
  const last = tools[tools.length - 1]; if (it.status === 'rodando' && last) c.append(h('div', 'sub-last ellipsis', last.e.tool + ' ' + (last.e.target || '')));
  const body = h('div', 'sub-b');
  it.nested.forEach((/** @type {any} */ n) => { if (n.type === 'text') { const t = h('div', 'res'); t.append(md(n.e.text)); body.append(t); } else body.append(n.type === 'agent' ? agentCard(n) : toolRow(n)); });
  if (it.res) { const r = h('div', 'res'); r.append(h('div', 'faint small', 'resposta do subagente'), document.createTextNode(it.res)); body.append(r); }
  if (!it.nested.length && !it.res) body.append(h('div', 'muted small', 'sem atividade registrada'));
  c.append(body); return c;
}

/** Desenha o fluxo da conversa dentro de `box`. @param {any[]} items @param {HTMLElement} box */
export function renderItems(items, box) {
  items.forEach(it => {
    if (it.type === 'user') { const m = h('div', 'msg user', it.e.text); if (it.e.attach && it.e.attach.length) m.append(h('div', 'faint small', 'anexos: ' + it.e.attach.join(', '))); box.append(m); }
    else if (it.type === 'text') { const m = h('div', 'msg bot'); m.append(md(it.e.text)); box.append(m); }
    else if (it.type === 'tool') box.append(toolRow(it));
    else if (it.type === 'agent') box.append(agentCard(it));
    else if (it.type === 'final') box.append(h('div', 'cnote', (it.e.ok ? 'concluído' : 'terminou com problema') + ' · US$ ' + Number(it.e.cost || 0).toFixed(4) + ' · ' + (it.e.turns || 0) + ' turno(s)'));
    else if (it.type === 'sys') box.append(h('div', 'cnote', it.e.text));
    else if (it.type === 'err') box.append(h('div', 'errline', 'erro: ' + it.e.text));
  });
}
