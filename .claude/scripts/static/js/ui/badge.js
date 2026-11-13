// @ts-check
import { h } from '../lib/dom.js';

/** Marcador pequeno. Use no máximo 2 por linha. @param {string} text @param {'neutral' | 'ok' | 'warn' | 'err' | 'info' | 'accent'} [tone] @param {string} [title] */
export function badge(text, tone = 'neutral', title = '') {
  const el = h('span', 'badge' + (tone === 'neutral' ? '' : ' ' + tone), text);
  if (title) el.title = title;
  return el;
}
