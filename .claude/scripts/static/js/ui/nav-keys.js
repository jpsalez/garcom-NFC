// @ts-check
import { $ } from '../lib/dom.js';
import { go, ROUTES } from '../router.js';
import { modalOpen } from './nav-modal.js';

/** Tabela única de atalhos: a ajuda (?) e os próprios atalhos leem daqui. `g` + letra troca de tela. */
export const GOTO = /** @type {const} */ ({
  v: 'visao-geral', c: 'conversa', o: 'orquestrar', i: 'ao-vivo', n: 'analise', l: 'linha-do-tempo', t: 'tarefas',
  m: 'commits', h: 'github', s: 'saude-do-codigo', a: 'arquivos', r: 'verificar', d: 'decisoes', k: 'dicionario',
});

/** @type {{ group: string, keys: string[], label: string }[]} */
export const SHORTCUTS = [
  { group: 'Geral', keys: ['Ctrl', 'K'], label: 'Abrir a paleta de comandos (telas, arquivos, commits, tarefas…)' },
  { group: 'Geral', keys: ['?'], label: 'Mostrar esta lista de atalhos' },
  { group: 'Geral', keys: ['Esc'], label: 'Fechar paleta ou diálogo' },
  ...Object.entries(GOTO).map(([k, hash]) => ({ group: 'Ir para', keys: ['g', k], label: ROUTES.find(r => r.hash === hash)?.label || hash })),
  { group: 'Commits', keys: ['↑', '↓'], label: 'Commit anterior / seguinte' },
  { group: 'Diff', keys: ['j', 'k'], label: 'Arquivo seguinte / anterior' },
  { group: 'Diff', keys: ['n', 'p'], label: 'Trecho alterado seguinte / anterior' },
  { group: 'Arquivos', keys: ['↑', '↓', '→', '←'], label: 'Navegar na árvore (Enter abre)' },
];

const typing = (/** @type {EventTarget | null} */ t) => { const e = /** @type {HTMLElement | null} */ (t); return !!e && (/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName) || e.isContentEditable); };

/**
 * Liga Ctrl/Cmd+K, `?` e a sequência `g` + letra. Os atalhos de letra ficam quietos dentro de campos e com diálogo aberto.
 * @param {{ palette: () => void, help: () => void }} o
 */
export function installKeys({ palette, help }) {
  let gAt = 0;
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!modalOpen()) palette(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || modalOpen()) return;
    if (gAt && Date.now() - gAt < 1500) {
      gAt = 0; const hash = /** @type {Record<string, string>} */ (GOTO)[e.key.toLowerCase()];
      if (hash) { e.preventDefault(); e.stopPropagation(); $('#nav-pending')?.remove(); go(hash); return; }
    }
    if (e.key === '?') { e.preventDefault(); help(); return; }
    if (e.key === 'g') { gAt = Date.now(); setTimeout(() => { if (Date.now() - gAt >= 1500) gAt = 0; }, 1600); }
  }, true);
}
