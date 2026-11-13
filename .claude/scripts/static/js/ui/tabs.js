// @ts-check
import { h } from '../lib/dom.js';

/**
 * Abas com teclado (← → Home End) e aria. `onChange` recebe o id escolhido.
 * @param {{ id: string, label: string, count?: number | string }[]} items
 * @param {{ active: string, onChange: (id: string) => void, label?: string }} o
 */
export function tabs(items, { active, onChange, label = 'Abas' }) {
  const el = h('div', 'tabs'); el.setAttribute('role', 'tablist'); el.setAttribute('aria-label', label);
  const buttons = items.map(it => {
    const b = h('button', '', it.label); b.setAttribute('role', 'tab'); b.dataset.id = it.id;
    if (it.count !== undefined && it.count !== '') b.append(h('span', 'n', String(it.count)));
    b.onclick = () => select(it.id, true);
    el.append(b); return b;
  });
  /** @param {string} id @param {boolean} [notify] */
  function select(id, notify = false) {
    buttons.forEach(b => { const on = b.dataset.id === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    if (notify) onChange(id);
  }
  el.onkeydown = e => {
    const i = buttons.findIndex(b => b.getAttribute('aria-selected') === 'true');
    const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : -1;
    if (to < 0) return; e.preventDefault();
    const b = buttons[(to + buttons.length) % buttons.length]; b.focus(); select(/** @type {string} */ (b.dataset.id), true);
  };
  select(active);
  return { el, select: (/** @type {string} */ id) => select(id) };
}
