// @ts-check
import { button } from './button.js';
import { badge } from './badge.js';
import { h } from '../lib/dom.js';
import { ago } from '../lib/format.js';

const STATES = {
  success: ['✓', 'ok', 'sucesso'], failure: ['✗', 'bad', 'falhou'], pending: ['●', 'run', 'em andamento'],
  cancelled: ['⊘', 'none', 'cancelado'], none: ['–', 'none', 'sem checks'],
};

/** Selo de CI (✓ ✗ ● –) com texto para leitor de tela. @param {string} state success | failure | pending | cancelled | none */
export function ciBadge(state) {
  const [glyph, cls, label] = /** @type {Record<string, string[]>} */ (STATES)[state] || STATES.none;
  const b = h('span', 'ghs ' + cls, glyph); b.title = 'CI: ' + label; b.setAttribute('role', 'img'); b.setAttribute('aria-label', 'CI: ' + label);
  return b;
}

/** Estado de uma execução do Actions → success | failure | pending | cancelled. @param {{ status: string | null, conclusion: string | null }} r */
export function runState(r) {
  if (r.status && r.status !== 'completed') return 'pending';
  const c = r.conclusion || '';
  return c === 'success' ? 'success' : ['failure', 'timed_out', 'startup_failure', 'action_required'].includes(c) ? 'failure' : c ? 'cancelled' : 'pending';
}

/** Só abre links do próprio GitHub. @param {string} url */
const safeUrl = url => (/^https:\/\/github\.com\//.test(url || '') ? url : '#');

/** Link para o GitHub em nova aba. @param {string} url @param {string} label @param {string} [cls] */
export function ghLink(url, label, cls = 'btn sm ghost') {
  const a = h('a', cls, label); a.href = safeUrl(url); a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
}

/** Relativo a partir de uma data ISO. @param {string} iso */
export const since = iso => (iso ? ago(Date.parse(iso) / 1000) : '');

/** Chips de rótulos. @param {string[]} labels */
export function labelChips(labels) {
  const box = h('span', 'gh-labels'); labels.slice(0, 3).forEach(l => box.append(badge(l, 'info'))); return box;
}

/**
 * Cartão para quando o gh não pode atender (não instalado, sem login, sem remoto ou erro), com o passo a passo.
 * @param {{ message?: string, help?: string[], reason?: string }} r @param {() => void} retry
 */
export function unavailableCard(r, retry) {
  const box = h('div', 'gh-setup');
  box.append(h('h3', '', r.reason === 'error' ? 'O GitHub não respondeu' : 'Conectar ao GitHub'), h('p', 'small muted', r.message || 'GitHub indisponível.'));
  if (r.help && r.help.length) { const ol = h('ol'); r.help.forEach(x => ol.append(h('li', '', x))); box.append(ol); }
  box.append(h('p', 'small muted', 'O resto do painel funciona normalmente sem o GitHub.'), button('Verificar de novo', { variant: 'primary', onClick: retry }));
  return box;
}
