// @ts-check
import { h } from '../lib/dom.js';

/** Esqueleto de carregamento: `n` linhas cinza pulsando (a animação respeita prefers-reduced-motion). */
export function skeleton(n = 4) {
  const box = h('div', 'card'); box.setAttribute('aria-busy', 'true'); box.setAttribute('aria-label', 'carregando');
  for (let i = 0; i < n; i++) { const l = h('div', 'skel'); l.style.width = (92 - i * 14) + '%'; box.append(l); }
  return box;
}
