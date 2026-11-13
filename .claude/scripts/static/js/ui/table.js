// @ts-check
import { h } from '../lib/dom.js';
import { emptyState } from './empty-state.js';

/**
 * Tabela única (linhas de 38 px, hover sutil). Colunas com `sortable` ordenam ao clicar no título.
 * @template T
 * @param {{ columns: { key: string, label: string, align?: 'r', sortable?: boolean, render?: (row: T) => Node | string, value?: (row: T) => string | number }[],
 *           rows: T[], onRow?: (row: T) => void, empty?: string, sort?: { key: string, dir: 1 | -1 } }} o
 */
export function table({ columns, rows, onRow, empty = 'Nada por aqui.', sort }) {
  if (!rows.length) return emptyState(empty);
  const t = h('table', 'table'), head = h('thead'), body = h('tbody'); t.append(head, body);
  let cur = sort || null;
  const val = (/** @type {T} */ r, /** @type {typeof columns[number]} */ c) => (c.value ? c.value(r) : /** @type {any} */ (r)[c.key]);
  function draw() {
    const c0 = cur && columns.find(c => c.key === cur?.key);
    const data = c0 && cur ? [...rows].sort((a, b) => { const x = val(a, c0), y = val(b, c0); return (x > y ? 1 : x < y ? -1 : 0) * cur.dir; }) : rows;
    head.replaceChildren(); const tr = h('tr');
    columns.forEach(c => {
      const th = h('th', c.align === 'r' ? 'r' : '', c.label);
      if (c.sortable) { th.setAttribute('aria-sort', cur?.key === c.key ? (cur.dir > 0 ? 'ascending' : 'descending') : 'none'); th.tabIndex = 0; if (cur?.key === c.key) th.textContent = c.label + (cur.dir > 0 ? ' ↑' : ' ↓'); const go = () => { cur = { key: c.key, dir: cur?.key === c.key ? /** @type {1 | -1} */ (-cur.dir) : 1 }; draw(); }; th.onclick = go; th.onkeydown = e => { if (e.key === 'Enter') go(); }; }
      tr.append(th);
    });
    head.append(tr); body.replaceChildren();
    data.forEach(r => {
      const row = h('tr', onRow ? 'clickable' : '');
      columns.forEach(c => { const td = h('td', c.align === 'r' ? 'r' : ''); const v = c.render ? c.render(r) : String(val(r, c) ?? ''); if (typeof v === 'string') td.textContent = v; else td.append(v); row.append(td); });
      if (onRow) { row.tabIndex = 0; row.onclick = () => onRow(r); row.onkeydown = e => { if (e.key === 'Enter') onRow(r); }; }
      body.append(row);
    });
  }
  draw(); return t;
}
