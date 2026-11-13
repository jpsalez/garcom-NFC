// @ts-check
import { h } from '../lib/dom.js';
import { button } from './button.js';

/** Estado vazio: uma frase e, se houver, uma ação. @param {string} text @param {string | { label: string, onClick: () => void }} [actionOrHint] */
export function emptyState(text, actionOrHint) {
  const el = h('div', 'empty'); el.append(h('div', 't', text));
  if (typeof actionOrHint === 'string') el.append(h('div', 'small', actionOrHint));
  else if (actionOrHint) el.append(button(actionOrHint.label, { onClick: actionOrHint.onClick }));
  return el;
}
