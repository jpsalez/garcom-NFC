// @ts-check
import { h } from '../lib/dom.js';

/** @type {HTMLElement | null} */ let tip = null;

/** Dica flutuante junto ao cursor. @param {MouseEvent} e @param {string[]} lines */
export function showTip(e, lines) {
  tip ??= document.body.appendChild(h('div', 'tip'));
  tip.replaceChildren(...lines.map((t, i) => h('div', i ? 'hint' : '', t)));
  tip.style.display = 'block';
  tip.style.left = Math.min(e.clientX + 14, innerWidth - 360) + 'px';
  tip.style.top = Math.min(e.clientY + 16, innerHeight - 90) + 'px';
}
export const hideTip = () => { if (tip) tip.style.display = 'none'; };
