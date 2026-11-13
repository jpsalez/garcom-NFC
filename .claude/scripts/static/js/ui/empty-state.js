// @ts-check
import { h } from '../lib/dom.js';

/** Estado vazio padrão: título curto e, se couber, uma dica do que fazer. */
export function emptyState(/** @type {string} */ title, /** @type {string} */ hint = '') {
  const box = h('div', 'card empty'); box.append(h('b', '', title)); if (hint) box.append(h('div', 'hint', hint));
  return box;
}
