// @ts-check
import { h } from '../lib/dom.js';
import { button } from './button.js';

/**
 * Painel lateral: abre sobre a tela, fecha com Esc ou no botão, e devolve o foco a quem o abriu.
 * @param {string} title @param {{ onClose?: () => void }} [o]
 */
export function sidePanel(title, o = {}) {
  const opener = /** @type {HTMLElement | null} */ (document.activeElement);
  const el = h('aside', 'side-panel'); el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title);
  const head = h('header'), t = h('h3', 'ellipsis', title), body = h('div', 'body');
  const x = button('', { variant: 'ghost', icon: 'x', title: 'Fechar (Esc)', onClick: () => close() });
  head.append(t, x); el.append(head, body);
  const key = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  function close() { document.removeEventListener('keydown', key, true); el.remove(); opener?.focus?.(); o.onClose?.(); }
  document.addEventListener('keydown', key, true);
  document.body.append(el); x.focus();
  return { el, body, close, setTitle: (/** @type {string} */ s) => { t.textContent = s; el.setAttribute('aria-label', s); } };
}
