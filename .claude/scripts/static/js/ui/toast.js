// @ts-check
import { h } from '../lib/dom.js';
import { isAbort } from '../api.js';

/** @param {string} msg @param {boolean} [err] */
export function toast(msg, err) { const t = h('div', 'toast' + (err ? ' err' : ''), msg); t.setAttribute('role', err ? 'alert' : 'status'); document.body.append(t); setTimeout(() => t.remove(), 3800); }
/** Envolve um manipulador: erro vira aviso; cancelamento por troca de tela é ignorado. */
export const guard = (/** @type {(...a: any[]) => any} */ fn) => async (/** @type {any[]} */ ...a) => { try { return await fn(...a); } catch (e) { if (!isAbort(e)) toast(e instanceof Error ? e.message : String(e), true); } };
