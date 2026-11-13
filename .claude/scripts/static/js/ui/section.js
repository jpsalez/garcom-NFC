// @ts-check
import { h } from '../lib/dom.js';

/** Seção da página: título, meta à direita e conteúdo, separada das outras por divisória (sem caixa). @param {string} title @param {{ meta?: string | Node, actions?: Node[] }} [o] */
export function section(title, o = {}) {
  const el = h('section', 'section'), head = h('div', 'head'); head.append(h('h2', '', title));
  if (o.meta) { const m = h('span', 'meta'); m.append(o.meta instanceof Node ? o.meta : document.createTextNode(o.meta)); head.append(m); }
  (o.actions || []).forEach(a => head.append(a));
  const body = h('div', 'body'); el.append(head, body);
  return { el, body };
}

/** Até 4 números de destaque. @param {{ label: string, value: string | number, sub?: string, title?: string }[]} items */
export function stats(items) {
  const el = h('div', 'stats');
  items.slice(0, 4).forEach(i => { const s = h('div', 'stat'); if (i.title) s.title = i.title; s.append(h('div', 'v', String(i.value)), h('div', 'l', i.label)); if (i.sub) s.append(h('div', 's', i.sub)); el.append(s); });
  return el;
}
