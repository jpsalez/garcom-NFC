// @ts-check
import { h } from '../lib/dom.js';

/**
 * Diálogo modal acessível: foco preso, Esc fecha, clique fora fecha e o foco volta para quem estava antes.
 * @param {{ label: string, cls?: string }} o
 * @returns {{ box: HTMLElement, close: () => void }}
 */
export function openModal({ label, cls = '' }) {
  const back = h('div', 'nm-back'), box = h('div', 'nm-box ' + cls);
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', label);
  back.append(box); document.body.append(back);
  const before = /** @type {HTMLElement | null} */ (document.activeElement);
  /** @param {KeyboardEvent} e */
  const key = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = /** @type {HTMLElement[]} */ ([...box.querySelectorAll('button, input, [tabindex="0"], a[href]')].filter(x => !(/** @type {HTMLButtonElement} */ (x)).disabled));
    if (!f.length) { e.preventDefault(); return; }
    const i = f.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
  };
  document.addEventListener('keydown', key, true);
  back.onmousedown = e => { if (e.target === back) close(); };
  let closed = false;
  function close() { if (closed) return; closed = true; document.removeEventListener('keydown', key, true); back.remove(); before?.focus?.(); }
  return { box, close };
}

/** Há algum diálogo aberto? (os atalhos globais se calam enquanto isso) */
export const modalOpen = () => !!document.querySelector('.nm-back');
