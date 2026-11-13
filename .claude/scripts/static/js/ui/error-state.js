// @ts-check
import { h } from '../lib/dom.js';

/** Estado de erro padrão, com "Tentar de novo". Sessão do painel expirada tem instrução própria. */
export function errorState(/** @type {unknown} */ err, /** @type {(() => void) | undefined} */ retry) {
  const msg = err instanceof Error ? err.message : String(err);
  const box = h('div', 'card errstate'); box.setAttribute('role', 'alert');
  box.append(h('b', '', 'Não deu para carregar esta tela'), h('div', 'hint', msg));
  if (msg.includes('autorizado')) box.append(h('div', 'hint', 'O painel foi reiniciado: recarregue a página (F5).'));
  if (retry) { const b = h('button', 'btn sm', 'Tentar de novo'); b.onclick = retry; box.append(b); }
  return box;
}
