// @ts-check
import { h } from '../lib/dom.js';
import { button } from './button.js';

/** Erro: mensagem e "Tentar de novo". Sessão do painel expirada tem instrução própria. @param {unknown} err @param {(() => void) | undefined} [retry] */
export function errorState(err, retry) {
  const msg = err instanceof Error ? err.message : String(err);
  const box = h('div', 'errstate'); box.setAttribute('role', 'alert');
  box.append(h('b', '', 'Não deu para carregar esta tela'), h('div', 'small muted', msg));
  if (msg.includes('autorizado')) box.append(h('div', 'small muted', 'O painel foi reiniciado: recarregue a página (F5).'));
  if (retry) box.append(button('Tentar de novo', { onClick: retry }));
  return box;
}
