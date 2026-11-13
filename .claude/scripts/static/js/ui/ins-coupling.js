// @ts-check
import { h } from '../lib/dom.js';
import { emptyState } from './empty-state.js';
import { table } from './table.js';

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
  box.append(h('div', 'small muted', `${data.commits} commit(s) analisados nos últimos ${data.days} dias` + (data.skipped_big ? ` · ${data.skipped_big} ignorado(s) por mexer em mais de 40 arquivos` : '') + ` · lockfiles, migrations e arquivos gerados não entram · ${data.total_pairs} par(es) com ao menos ${data.min} vez(es) juntos`));
  if (!data.pairs.length) { box.append(emptyState('Sem pares acoplados ainda', data.commits < 5 ? 'Histórico curto: poucos commits para medir o que muda junto. Volte quando houver mais.' : 'Nenhum par mudou junto o mínimo de vezes. Baixe o mínimo para ver mais.')); return box; }
  const link = (/** @type {string} */ path) => { const b = h('button', 'ctx-link', path); b.title = path; b.onclick = () => onOpen(path); return b; };
  box.append(table({
    columns: [
      { key: 'pair', label: 'Arquivos', sortable: true, value: p => p.a + ' ' + p.b, render: p => { const c = h('div'); c.append(link(p.a), link(p.b)); return c; } },
      { key: 'together', label: 'Juntos', align: 'r', sortable: true },
      { key: 'a_commits', label: 'A', align: 'r', sortable: true },
      { key: 'b_commits', label: 'B', align: 'r', sortable: true },
      { key: 'confidence', label: 'Confiança', align: 'r', sortable: true, render: p => { const c = h('span'), bar = h('span', 'cbar'), fill = h('i'); fill.style.width = p.confidence * 100 + '%'; bar.append(fill); c.append(bar, document.createTextNode(p.confidence.toFixed(2).replace('.', ','))); return c; } },
    ],
    rows: data.pairs, sort: { key: 'together', dir: -1 },
  }));
  return box;
}
