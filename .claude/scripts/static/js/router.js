// @ts-check
import { $, h, ico } from './lib/dom.js';
import { clearTimers } from './poll.js';
import { isAbort, newScreen } from './api.js';
import { S } from './store.js';
import { labelFields } from './ui/a11y.js';
import { errorState } from './ui/error-state.js';
import { skeleton } from './ui/skeleton.js';
import { renderAnalise } from './views/analise.js';
import { renderVivo } from './views/ao-vivo.js';
import { renderProjeto } from './views/arquivos.js';
import { renderCommits } from './views/commits.js';
import { renderChat } from './views/conversa.js';
import { renderDecisoes } from './views/decisoes.js';
import { renderDicionario } from './views/dicionario.js';
import { renderGeral } from './views/geral.js';
import { renderGithub } from './views/github.js';
import { renderTempo } from './views/linha-do-tempo.js';
import { renderOrquestrar } from './views/orquestrar.js';
import { renderSaude } from './views/saude.js';
import { renderTarefas } from './views/tarefas.js';
import { renderVerificar } from './views/verificar.js';

/**
 * Tabela única de telas: o endereço é o nome (#arquivos, #ao-vivo...). `badge` é o id do selo de contagem no menu.
 * @type {{ hash: string, label: string, sub: string, icon: string, group: string, view: () => Promise<any>, badge?: string }[]}
 */
export const ROUTES = [
  { hash: 'visao-geral', label: 'Visão geral', sub: 'o estado do projeto e dos agentes', icon: 'home', group: 'Controle', view: renderGeral },
  { hash: 'conversa', label: 'Conversa', sub: 'fale com o orquestrador e acompanhe cada subagente', icon: 'chat', group: 'Controle', view: renderChat, badge: 'b-run' },
  { hash: 'orquestrar', label: 'Orquestrar', sub: 'receitas que encadeiam agentes', icon: 'flow', group: 'Controle', view: renderOrquestrar, badge: 'b-pipe' },
  { hash: 'ao-vivo', label: 'Ao vivo', sub: 'sua sessão interativa, em tempo real', icon: 'pulse', group: 'Observar', view: renderVivo, badge: 'b-live' },
  { hash: 'analise', label: 'Análise', sub: 'sessões, custo e qualidade da orquestração', icon: 'chart', group: 'Observar', view: renderAnalise },
  { hash: 'linha-do-tempo', label: 'Linha do tempo', sub: 'sessões, agentes, commits e verificações no mesmo eixo', icon: 'clock', group: 'Observar', view: renderTempo },
  { hash: 'tarefas', label: 'Tarefas', sub: 'o que fazer agora, o que está bloqueado e por quê', icon: 'check', group: 'Projeto', view: renderTarefas },
  { hash: 'commits', label: 'Commits', sub: 'histórico, alterações não commitadas e diff', icon: 'git', group: 'Projeto', view: renderCommits },
  { hash: 'github', label: 'GitHub', sub: 'pull requests, Actions e issues', icon: 'github', group: 'Projeto', view: renderGithub },
  { hash: 'saude-do-codigo', label: 'Saúde do código', sub: 'candidatos a refatorar, churn e histórico de verificações', icon: 'heart', group: 'Projeto', view: renderSaude },
  { hash: 'arquivos', label: 'Arquivos', sub: 'estrutura do projeto e contexto', icon: 'folder', group: 'Projeto', view: renderProjeto },
  { hash: 'verificar', label: 'Verificar', sub: 'checagens e git', icon: 'shield', group: 'Projeto', view: renderVerificar },
  { hash: 'decisoes', label: 'Decisões', sub: 'o que já foi decidido', icon: 'scale', group: 'Projeto', view: renderDecisoes },
  { hash: 'dicionario', label: 'Dicionário', sub: 'o que cada termo do painel e do projeto significa', icon: 'book', group: 'Ajuda', view: renderDicionario },
];

/** Endereços antigos continuam valendo (favoritos e chamadas das telas). */
const LEGACY = { geral: 'visao-geral', chat: 'conversa', projeto: 'arquivos', vivo: 'ao-vivo', tempo: 'linha-do-tempo', saude: 'saude-do-codigo' };
/** @param {string} key */
const canonical = key => /** @type {Record<string, string>} */ (LEGACY)[key] || key;
const find = (/** @type {string} */ key) => ROUTES.find(r => r.hash === canonical(key)) || ROUTES[0];

export function buildNav(/** @type {Element} */ box) {
  let group = '';
  ROUTES.forEach(r => {
    if (r.group !== group) { group = r.group; box.append(h('div', 'grp', group)); }
    const b = h('button'); b.dataset.tab = r.hash; b.title = r.label;
    b.append(ico(r.icon), h('span', 'lbl', r.label));
    if (r.badge) { const c = h('span', 'cnt'); c.id = r.badge; c.hidden = true; b.append(c); }
    b.onclick = () => go(r.hash);
    box.append(b);
  });
}

let seq = 0;
async function show(/** @type {typeof ROUTES[number]} */ route, /** @type {string} */ sub = '') {
  const mine = ++seq;
  clearTimers(); newScreen(); S.tab = route.hash; S.view = null;
  if (sub) { if (route.hash === 'dicionario') S.dictQ = decodeURIComponent(sub); else if (route.hash === 'conversa') S.sel = sub; }
  $('#title').textContent = route.label; $('#sub').textContent = route.sub; document.title = route.label + ' · Painel garcom-NFC';
  document.querySelectorAll('nav button[data-tab]').forEach(b => { const on = /** @type {HTMLElement} */ (b).dataset.tab === route.hash; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  const main = $('#main'); main.className = ''; main.replaceChildren(skeleton());
  try { await route.view(); labelFields(main); } catch (e) {
    if (isAbort(e) || mine !== seq) return;
    main.className = ''; main.replaceChildren(errorState(e, () => show(route, sub)));
  }
}

/** Endereço = #tela[/sub][?param=valor]. */
const addr = (/** @type {string} */ hash, /** @type {string} */ sub, /** @type {string} */ query) => '#' + hash + (sub ? '/' + sub : '') + (query ? '?' + query : '');

/** Parâmetros do endereço atual (ex.: path e L na tela Arquivos). */
export const hashParams = () => new URLSearchParams(location.hash.split('?')[1] || '');

/** Atualiza os parâmetros do endereço sem recarregar a tela nem empilhar histórico. Valor vazio remove o parâmetro. */
export function setHashParams(/** @type {Record<string, string>} */ obj) {
  const [head] = location.hash.split('?'), q = hashParams();
  Object.entries(obj).forEach(([k, v]) => { if (v) q.set(k, v); else q.delete(k); });
  const qs = q.toString().replace(/%2F/gi, '/');
  history.replaceState(null, '', head + (qs ? '?' + qs : ''));
}

/** Navega para uma tela (aceita os endereços antigos). */
export function go(/** @type {string} */ key, /** @type {string} */ sub = '', /** @type {string} */ query = '') {
  const route = find(key), want = addr(route.hash, sub, query);
  if (location.hash !== want) history.pushState(null, '', want);
  return show(route, sub);
}

/** Abre a tela do endereço atual (início e botão voltar), sem empilhar histórico. */
export function openFromHash() {
  const [pathPart, query = ''] = location.hash.slice(1).split('?'), [key, sub] = pathPart.split('/');
  const route = find(key || ''), want = addr(route.hash, sub, query);
  if (location.hash !== want) history.replaceState(null, '', want);
  return show(route, sub);
}
