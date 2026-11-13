// @ts-check
import { h, ico } from '../lib/dom.js';

/**
 * Botão único do painel. No máximo UM `primary` por tela; ícone só em botões de ação.
 * @param {string} label
 * @param {{ variant?: 'primary' | 'secondary' | 'ghost' | 'danger', icon?: string, title?: string, small?: boolean, on?: boolean, onClick?: (e: MouseEvent) => any, href?: string }} [o]
 */
export function button(label, o = {}) {
  const el = h(o.href ? 'a' : 'button', ['btn', o.variant && o.variant !== 'secondary' ? o.variant : '', o.small ? 'sm' : '', o.on ? 'on' : ''].filter(Boolean).join(' '));
  if (o.icon) el.append(ico(o.icon));
  if (label) el.append(document.createTextNode(label));
  if (o.title) { el.title = o.title; if (!label) el.setAttribute('aria-label', o.title); }
  if (o.href) { /** @type {HTMLAnchorElement} */ (el).href = o.href; } else { /** @type {HTMLButtonElement} */ (el).type = 'button'; }
  if (o.onClick) el.onclick = o.onClick;
  return el;
}
