// @ts-check
import { api, isAbort } from '../api.js';
import { h } from '../lib/dom.js';
import { go } from '../router.js';
import { couplingView } from './ins-coupling.js';
import { depsView } from './ins-deps.js';
import { treemapView } from './ins-treemap.js';
import { trendView } from './ins-trend.js';
import { emptyState } from './empty-state.js';
import { errorState } from './error-state.js';
import { skeleton } from './skeleton.js';

/** Abre o arquivo na tela Arquivos. @param {string} path */
const open = path => go('arquivos', '', 'path=' + encodeURIComponent(path).replace(/%2F/g, '/'));

/**
 * Cartão com título, dica e controles; o conteúdo carrega sozinho (esqueleto → resultado ou erro com "tentar de novo").
 * @template T @param {{ title: string, hint?: string, load: () => Promise<T>, render: (d: T) => HTMLElement, controls?: HTMLElement[] }} o
 */
function section({ title, hint, load, render, controls = [] }) {
  const card = h('div', 'card ins-sec'), head = h('div', 'row'); head.append(h('h3', 'grow', title), ...controls);
  const slot = h('div'); card.append(head); if (hint) card.append(h('div', 'hint', hint)); card.append(slot);
  const run = () => { slot.replaceChildren(skeleton(5)); load().then(d => slot.replaceChildren(render(d))).catch(e => { if (!isAbort(e)) slot.replaceChildren(errorState(e, run)); }); };
  run();
  return { card, run };
}

/** @param {[string, string][]} opts @param {string} value @param {string} label @param {(v: string) => void} on */
function select(opts, value, label, on) {
  const s = h('select'); s.setAttribute('aria-label', label); opts.forEach(([v, l]) => s.append(new Option(l, v))); s.value = value; s.onchange = () => on(s.value); return s;
}

/** Aba "Mapa": treemap de hotspots e evolução da complexidade. @param {HTMLElement} body */
export function mapaTab(body) {
  let days = '90';
  const tm = section({
    title: 'Mapa de hotspots', hint: 'Cada retângulo é um arquivo: o tamanho é o de linhas lógicas e a cor é quantos commits mexeram nele. Grande e vermelho = código volumoso que muda muito. Clique para abrir; Tab e Enter também funcionam.',
    load: () => api('insights/treemap?days=' + days),
    render: d => {
      if (!d.files.length) return emptyState('Nenhum arquivo de código encontrado', 'O mapa cobre back-end/src e front-end.');
      const wrap = h('div'); if (!d.max_commits) wrap.append(h('div', 'hint short', `Nenhum commit nos últimos ${d.days} dias: o mapa mostra só o tamanho. Aumente o período.`));
      wrap.append(treemapView(d, { onOpen: open })); return wrap;
    },
    controls: [select([['30', '30 dias'], ['90', '90 dias'], ['180', '180 dias'], ['365', '1 ano']], days, 'Período do mapa', v => { days = v; tm.run(); })],
  });
  const tr = section({
    title: 'Evolução da complexidade', hint: 'Complexidade máxima (CC) dos 10 arquivos mais complexos ao longo dos últimos commits que mexeram em cada um. Passe o mouse na legenda para destacar um arquivo.',
    load: () => api('insights/complexity?top=10&points=12'), render: d => trendView(d, { onOpen: open }),
  });
  body.append(tm.card, tr.card);
}

/** Aba "Arquitetura": dependências entre módulos e acoplamento de mudanças. @param {HTMLElement} body */
export function arqTab(body) {
  const mod = section({
    title: 'Dependências entre módulos', hint: 'Cada círculo é um módulo de back-end/src (shared e app incluídos); o tamanho é o de linhas. A seta A → B significa que A importa B.',
    load: () => api('insights/modules'), render: d => depsView(d, { onOpen: open }),
  });
  let days = '180', min = '2';
  const co = section({
    title: 'Arquivos que mudam juntos', hint: 'Pares com acoplamento por mudança: se um muda, o outro costuma mudar. Pode indicar uma dependência escondida ou um módulo que devia ser um só.',
    load: () => api(`insights/coupling?days=${days}&min=${min}`), render: d => couplingView(d, { onOpen: open }),
    controls: [select([['90', '90 dias'], ['180', '180 dias'], ['365', '1 ano']], days, 'Período do acoplamento', v => { days = v; co.run(); }), select([['1', 'mín. 1×'], ['2', 'mín. 2×'], ['3', 'mín. 3×'], ['5', 'mín. 5×']], min, 'Mínimo de vezes juntos', v => { min = v; co.run(); })],
  });
  body.append(mod.card, co.card);
}
