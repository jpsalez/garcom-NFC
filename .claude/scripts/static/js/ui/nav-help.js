// @ts-check
import { h } from '../lib/dom.js';
import { SHORTCUTS } from './nav-keys.js';
import { openModal } from './nav-modal.js';

/** Lista de atalhos agrupada, montada a partir da tabela única. */
export function showHelp() {
  const { box, close } = openModal({ label: 'Atalhos de teclado', cls: 'nm-help' });
  const head = h('div', 'nm-head'); const x = h('button', 'btn sm', 'Fechar'); x.onclick = close; head.append(h('h3', '', 'Atalhos de teclado'), x); box.append(head);
  const body = h('div', 'nm-body'); box.append(body);
  /** @type {Map<string, typeof SHORTCUTS>} */ const groups = new Map();
  SHORTCUTS.forEach(s => { if (!groups.has(s.group)) groups.set(s.group, []); /** @type {typeof SHORTCUTS} */ (groups.get(s.group)).push(s); });
  groups.forEach((items, name) => {
    const sec = h('section', 'nm-sec'); sec.append(h('h4', '', name));
    const list = h('div', name === 'Ir para' ? 'nm-grid' : '');
    items.forEach(s => { const r = h('div', 'nm-row'); const k = h('span', 'nm-keys'); s.keys.forEach((c, i) => { if (i) k.append(document.createTextNode(' ')); k.append(h('kbd', '', c)); }); r.append(k, h('span', '', s.label)); list.append(r); });
    sec.append(list); body.append(sec);
  });
  x.focus();
}
