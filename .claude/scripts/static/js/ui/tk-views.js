// @ts-check
import { h } from '../lib/dom.js';
import { badge } from './badge.js';
import { emptyState } from './empty-state.js';
import { table } from './table.js';
import { STATUS } from './tk-model.js';

/**
 * @typedef {import('./tk-model.js').Task} Task
 * @typedef {ReturnType<typeof import('./tk-model.js').criarModelo>} Modelo
 * @typedef {{ abrir: (id: string) => void, avancar: (t: Task) => void, mudar: (t: Task, status: string) => void }} Acoes
 */

/** Marcador de prioridade: só P0 e P1 chamam atenção. @param {string} p */
const marcaPrioridade = p => badge(p, p === 'P0' ? 'err' : p === 'P1' ? 'warn' : 'neutral', 'prioridade');

/** Bolinha de status: um clique avança (a-fazer → fazendo → feita). @param {Task} t @param {Acoes} acoes */
function bolinha(t, acoes) {
  const b = h('button', 'tk-dot st-' + t.status); b.type = 'button';
  b.title = `${STATUS[/** @type {keyof typeof STATUS} */ (t.status)]}: clique para avançar (tecla s)`;
  b.setAttribute('aria-label', `Status de ${t.id}: ${STATUS[/** @type {keyof typeof STATUS} */ (t.status)]}. Avançar`);
  b.onclick = e => { e.stopPropagation(); acoes.avancar(t); };
  return b;
}

/** Linha da lista: bolinha, id, título, até 2 marcadores e, embaixo em cinza, o motivo do bloqueio. @param {Task} t @param {Modelo} m @param {Acoes} acoes */
export function linha(t, m, acoes) {
  const fechada = !m.aberta(t);
  const el = h('div', 'tk-row' + (fechada ? ' off' : '')); el.tabIndex = 0; el.dataset.id = t.id; el.setAttribute('role', 'button');
  const principal = h('div', 'tk-main'), topo = h('div', 'tk-line');
  topo.append(h('span', 'tk-id num', t.id), h('span', 'tk-title ellipsis', t.titulo));
  principal.append(topo);
  const motivo = m.motivoBloqueio(t);
  if (motivo) principal.append(h('div', 'tk-why small faint ellipsis', motivo));
  const marcas = h('div', 'tk-tags'); marcas.append(marcaPrioridade(t.prioridade), badge(t.fase));
  const n = m.aberta(t) ? m.destrava(t.id) : 0;
  el.append(bolinha(t, acoes), principal, n >= 2 ? h('span', 'tk-unl tiny faint', `destrava ${n}`) : h('span'), marcas);
  el.onclick = () => acoes.abrir(t.id);
  el.onkeydown = e => { if (e.key === 'Enter' && e.target === el) acoes.abrir(t.id); };
  return el;
}

/** Lista simples de linhas (ou o vazio). @param {Task[]} lista @param {Modelo} m @param {Acoes} acoes @param {string} vazio */
export function lista(lista, m, acoes, vazio) {
  if (!lista.length) return emptyState(vazio);
  const el = h('div', 'tk-list'); lista.forEach(t => el.append(linha(t, m, acoes))); return el;
}

const COLUNAS = [['a-fazer', 'A fazer'], ['fazendo', 'Fazendo'], ['bloqueada', 'Bloqueada'], ['feita', 'Feita (7 dias)']];

/** Quadro: 4 colunas; arrastar um cartão para outra coluna muda o status. @param {Task[]} tarefas @param {Modelo} m @param {Acoes} acoes */
export function quadro(tarefas, m, acoes) {
  const limite = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const el = h('div', 'tk-board');
  COLUNAS.forEach(([status, titulo]) => {
    const itens = tarefas.filter(t => t.status === status && (status !== 'feita' || (t.atualizada_em || '') >= limite)).sort(m.porTrabalho);
    const col = h('section', 'tk-col'); col.dataset.status = status; col.setAttribute('aria-label', titulo);
    const cab = h('header', 'tk-colhead'); cab.append(h('b', '', titulo), h('span', 'faint num', String(itens.length)));
    const corpo = h('div', 'tk-colbody');
    itens.forEach(t => corpo.append(cartao(t, m, acoes)));
    if (!itens.length) corpo.append(h('div', 'tk-vazio tiny faint', 'Solte um cartão aqui'));
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', e => { if (!col.contains(/** @type {Node} */ (e.relatedTarget))) col.classList.remove('over'); });
    col.addEventListener('drop', e => {
      e.preventDefault(); col.classList.remove('over');
      const id = e.dataTransfer?.getData('text/plain'), t = id ? m.porId.get(id) : null;
      if (t && t.status !== status) acoes.mudar(t, status);
    });
    col.append(cab, corpo); el.append(col);
  });
  return el;
}

/** @param {Task} t @param {Modelo} m @param {Acoes} acoes */
function cartao(t, m, acoes) {
  const el = h('div', 'tk-card'); el.draggable = true; el.tabIndex = 0; el.dataset.id = t.id; el.setAttribute('role', 'button');
  el.append(h('div', 'tk-line', ''), h('div', 'tk-why small faint', m.motivoBloqueio(t)));
  const topo = /** @type {HTMLElement} */ (el.firstChild); topo.append(h('span', 'tk-id num', t.id), h('span', 'tk-title', t.titulo));
  if (!m.motivoBloqueio(t)) /** @type {HTMLElement} */ (el.lastChild).remove();
  const marcas = h('div', 'tk-tags'); marcas.append(marcaPrioridade(t.prioridade), badge(t.fase)); el.append(marcas);
  el.addEventListener('dragstart', e => { e.dataTransfer?.setData('text/plain', t.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; el.classList.add('drag'); });
  el.addEventListener('dragend', () => el.classList.remove('drag'));
  el.onclick = () => acoes.abrir(t.id);
  el.onkeydown = e => { if (e.key === 'Enter' && e.target === el) acoes.abrir(t.id); };
  return el;
}

/** Tabela ordenável com todas as colunas. @param {Task[]} tarefas @param {Modelo} m @param {Acoes} acoes */
export function tabela(tarefas, m, acoes) {
  const ordemStatus = Object.keys(STATUS);
  return table({
    rows: tarefas, empty: 'Nenhuma tarefa com esses filtros.', sort: { key: 'prioridade', dir: 1 }, onRow: t => acoes.abrir(t.id),
    columns: [
      { key: 'id', label: 'Id', sortable: true, render: t => h('span', 'num faint', t.id) },
      { key: 'titulo', label: 'Tarefa', sortable: true, render: t => { const d = h('div'); d.append(h('div', '', t.titulo)); const w = m.motivoBloqueio(t); if (w) d.append(h('div', 'small faint', w)); return d; } },
      { key: 'status', label: 'Status', sortable: true, value: t => ordemStatus.indexOf(t.status), render: t => { const s = h('span', 'tk-st'); s.append(h('span', 'tk-dot st-' + t.status), document.createTextNode(STATUS[/** @type {keyof typeof STATUS} */ (t.status)])); return s; } },
      { key: 'fase', label: 'Fase', sortable: true },
      { key: 'prioridade', label: 'Prior.', sortable: true },
      { key: 'destrava', label: 'Destrava', align: 'r', sortable: true, value: t => (m.aberta(t) ? m.destrava(t.id) : 0) },
      { key: 'atualizada_em', label: 'Atualizada', sortable: true, render: t => h('span', 'num faint', t.atualizada_em || '') },
    ],
  });
}
