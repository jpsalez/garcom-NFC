// @ts-check
import { h } from '../lib/dom.js';

/** @param {string} title @param {string[]} items @param {(p: string) => void} open */
function fileList(title, items, open) {
  const box = h('div'); box.append(h('div', 'ctx-h', `${title} (${items.length})`));
  if (!items.length) { box.append(h('div', 'hint', 'nenhum')); return box; }
  items.forEach(p => { const b = h('button', 'ctx-link', p.replace(/^back-end\/src\//, '').replace(/^front-end\//, 'front/')); b.title = p; b.onclick = () => open(p); box.append(b); });
  return box;
}

/** @param {string} label @param {string | number} value @param {'' | 'warn' | 'bad'} [tone] */
const met = (label, value, tone = '') => { const m = h('div', 'met ' + tone); m.append(h('b', '', String(value)), h('span', '', label)); return m; };

/**
 * Painel de contexto do arquivo aberto: métricas da Saúde, quem importa / o que importa, tarefas e decisões.
 * @param {any} meta resposta de /api/file/meta
 * @param {{ open: (path: string) => void, goTasks: () => void }} o
 */
export function contextPanel(meta, { open, goTasks }) {
  const box = h('div', 'ctx'); box.append(h('h3', '', 'Contexto'));
  const r = meta.health;
  if (r) {
    const lvl = h('span', 'lv ' + ({ 'atenção': 'atencao' }[/** @type {'atenção'} */ (r.level)] || r.level), r.level);
    const top = h('div', 'row'); top.append(h('span', 'hint', 'saúde do arquivo'), lvl); box.append(top);
    const mets = h('div', 'mets');
    mets.append(met('linhas (lógicas)', r.loc, r.loc > 400 ? 'bad' : r.loc > 250 ? 'warn' : ''), met('complexidade máx.', r.cc_max, r.cc_max > 20 ? 'bad' : r.cc_max > 10 ? 'warn' : ''),
      met('hotspot', r.hotspot ?? r.churn.commits * r.cc_max), met('commits em 30 d', r.churn.commits), met('fan-in', meta.imported_by.length), met('fan-out', meta.imports.length));
    box.append(mets);
  } else {
    const mets = h('div', 'mets'); mets.append(met('importado por', meta.imported_by.length), met('importa', meta.imports.length)); box.append(mets);
  }
  box.append(fileList('Importa', meta.imports, open), fileList('Importado por', meta.imported_by, open));
  const t = h('div'); t.append(h('div', 'ctx-h', `Tarefas que citam (${meta.tasks.length})`));
  if (!meta.tasks.length) t.append(h('div', 'hint', 'nenhuma'));
  meta.tasks.forEach((/** @type {any} */ k) => { const b = h('button', 'ctx-link'); b.append(h('b', 'mono', k.id + ' '), document.createTextNode(k.title)); b.title = k.status; b.onclick = goTasks; t.append(b); });
  box.append(t);
  const d = h('div'); d.append(h('div', 'ctx-h', `Decisões que citam (${meta.decisions.length})`));
  if (!meta.decisions.length) d.append(h('div', 'hint', 'nenhuma'));
  meta.decisions.forEach((/** @type {string} */ x) => d.append(h('div', 'hint dec', x)));
  box.append(d);
  return box;
}
