// @ts-check
import { h } from '../lib/dom.js';
import { emptyState } from './empty-state.js';

/**
 * @typedef {{ a: string, b: string, together: number, a_commits: number, b_commits: number, confidence: number }} Pair
 * @typedef {{ days: number, min: number, commits: number, skipped_big: number, total_pairs: number, pairs: Pair[] }} CData
 */

/**
 * Pares de arquivos que mudam juntos: tabela ordenável. Confiança = vezes juntos ÷ commits do arquivo que muda menos.
 * @param {CData} data @param {{ onOpen: (path: string) => void }} o
 */
export function couplingView(data, { onOpen }) {
  const box = h('div', 'coup');
  box.append(h('div', 'hint', `${data.commits} commit(s) analisados nos últimos ${data.days} dias` + (data.skipped_big ? ` · ${data.skipped_big} ignorado(s) por mexer em mais de 40 arquivos` : '') + ` · lockfiles, migrations e arquivos gerados não entram · ${data.total_pairs} par(es) com ao menos ${data.min} vez(es) juntos`));
  if (!data.pairs.length) { box.append(emptyState('Sem pares acoplados ainda', data.commits < 5 ? 'Histórico curto: poucos commits para medir o que muda junto. Volte quando houver mais.' : 'Nenhum par mudou junto o mínimo de vezes. Baixe o mínimo para ver mais.')); return box; }
  const cols = /** @type {[keyof Pair | 'pair', string, boolean, string][]} */ ([['pair', 'Arquivos', false, 'Os dois arquivos que mudam juntos'], ['together', 'Juntos', true, 'Commits em que os dois mudaram'], ['a_commits', 'A', true, 'Commits que tocaram o primeiro'], ['b_commits', 'B', true, 'Commits que tocaram o segundo'], ['confidence', 'Confiança', true, 'Juntos ÷ commits do arquivo que muda menos: 1,00 = sempre que um muda, o outro muda']]);
  let key = /** @type {keyof Pair | 'pair'} */ ('together'), dir = -1;
  const t = h('table', 'sortable'), tb = h('tbody');
  const val = (/** @type {Pair} */ p, /** @type {keyof Pair | 'pair'} */ k) => (k === 'pair' ? p.a + ' ' + p.b : p[k]);
  const link = (/** @type {string} */ path) => { const b = h('button', 'ctx-link', path); b.title = path; b.onclick = () => onOpen(path); return b; };
  function draw() {
    const hr = h('tr'); cols.forEach(([k, l, n, tip]) => { const th = h('th', n ? 'n' : '', l + (key === k ? (dir < 0 ? ' ↓' : ' ↑') : '')); th.title = tip; th.tabIndex = 0; th.setAttribute('role', 'button'); const go = () => { dir = key === k ? -dir : (n ? -1 : 1); key = k; draw(); }; th.onclick = go; th.onkeydown = e => { if (e.key === 'Enter') go(); }; hr.append(th); });
    t.replaceChildren(h('thead'), tb); /** @type {HTMLElement} */ (t.firstChild).append(hr); tb.replaceChildren();
    [...data.pairs].sort((p, q) => { const x = val(p, key), y = val(q, key); return (typeof x === 'string' ? x.localeCompare(/** @type {string} */ (y)) : /** @type {number} */ (x) - /** @type {number} */ (y)) * dir; }).forEach(p => {
      const r = h('tr', 'row2'), fa = h('td'), bar = h('div', 'cbar'), fill = h('i'); fill.style.width = p.confidence * 100 + '%';
      fa.append(link(p.a), link(p.b)); bar.append(fill);
      const conf = h('td', 'n'); conf.append(bar, h('span', 'mono', p.confidence.toFixed(2).replace('.', ',')));
      r.append(fa, h('td', 'n', String(p.together)), h('td', 'n dim', String(p.a_commits)), h('td', 'n dim', String(p.b_commits)), conf); tb.append(r);
    });
  }
  draw(); box.append(t);
  return box;
}
