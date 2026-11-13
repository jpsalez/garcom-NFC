// @ts-check
import { h } from '../lib/dom.js';
import { badge } from './badge.js';

/** Tom do marcador por status (agentes, conversas, execuções). */
const TOM = /** @type {Record<string, 'accent' | 'ok' | 'warn' | 'err' | 'neutral'>} */ ({
  rodando: 'accent', concluido: 'ok', ok: 'ok', pausado: 'warn', aguardando: 'warn', erro: 'err', parado: 'err', interrompido: 'err',
});
const ROTULO = /** @type {Record<string, string>} */ ({ ok: 'concluído', concluido: 'concluído' });

/** Marcador de status com o texto em português. @param {string} st */
export const statusBadge = st => badge(ROTULO[st] || st, TOM[st] || 'neutral');

/** Bolinha de status para listas densas (o texto fica no title e no aria-label). @param {string} st */
export function statusDot(st) {
  const d = h('span', 'sdot ' + (TOM[st] || 'neutral')); d.title = ROTULO[st] || st; d.setAttribute('role', 'img'); d.setAttribute('aria-label', ROTULO[st] || st);
  return d;
}

/** Valor em dólar com 3 casas. @param {number | undefined} v */
export const money = v => 'US$ ' + Number(v || 0).toFixed(3);

/** Campo com rótulo visível: <label>texto <input></label>. @param {string} texto @param {HTMLElement} campo */
export function rotulado(texto, campo) {
  const l = h('label', 'field'); l.append(h('span', '', texto), campo); return l;
}
