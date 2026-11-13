// @ts-check
import { api } from '../api.js';
import { $, h } from '../lib/dom.js';
import { watch } from '../lib/realtime.js';
import { go, hashParams, setHashParams } from '../router.js';
import { S } from '../store.js';
import { button } from '../ui/button.js';
import { emptyState } from '../ui/empty-state.js';
import { tabs } from '../ui/tabs.js';
import { FASES, PRIORIDADES, STATUS, criarModelo, proximoStatus } from '../ui/tk-model.js';
import { abrirTarefa, novaTarefa } from '../ui/tk-panel.js';
import { lista, quadro, tabela } from '../ui/tk-views.js';
import { guard } from '../ui/toast.js';

/** @typedef {import('../ui/tk-model.js').Task} Task */
const ABAS = [{ id: 'agora', label: 'Agora' }, { id: 'quadro', label: 'Quadro' }, { id: 'todas', label: 'Todas' }];
const CHAVES = ['aba', 'q', 'fase', 'prioridade', 'status', 'quem', 'modulo', 'arquivadas'];

/** Filtros e aba vivem na URL (#tarefas?aba=quadro&fase=MVP-2&q=sessão), então dá para guardar e compartilhar a tela. */
const lerUrl = () => { const p = hashParams(); return Object.fromEntries(CHAVES.map(k => [k, p.get(k) || ''])); };

export async function renderTarefas() {
  const main = $('#main'); main.className = ''; main.replaceChildren();
  /** @type {Record<string, string>} */ let F = lerUrl(); if (!F.aba) F.aba = 'agora';
  /** @type {ReturnType<typeof criarModelo>} */ let m;
  const area = h('div'), cabeca = h('div');
  main.append(cabeca, area);
  let filtrosAbertos = false;

  async function carregar() {
    const [t, d] = await Promise.all([api('tasks'), api('decisoes')]);
    m = criarModelo(t.tasks, d);
  }
  const mudarUrl = (/** @type {Record<string, string>} */ o) => { Object.assign(F, o); setHashParams(Object.fromEntries(CHAVES.map(k => [k, F[k] && !(k === 'aba' && F[k] === 'agora') ? F[k] : '']))); desenhar(); };

  /** Aplica busca e filtros (arquivadas só aparecem com o filtro ligado ou escolhendo o status). @param {Task[]} tarefas */
  function filtrar(tarefas) {
    const q = F.q.trim().toLowerCase();
    return tarefas.filter(t => (F.arquivadas || F.status === 'arquivada' || t.status !== 'arquivada')
      && (!F.fase || t.fase === F.fase) && (!F.prioridade || t.prioridade === F.prioridade) && (!F.status || t.status === F.status)
      && (!F.quem || t.quem === F.quem) && (!F.modulo || t.modulo === F.modulo)
      && (!q || `${t.id} ${t.titulo} ${t.descricao || ''} ${t.modulo || ''}`.toLowerCase().includes(q)));
  }

  const acoes = {
    abrir: (/** @type {string} */ id) => { setHashParams({ abrir: id }); abrirTarefa(id, ctx); },
    avancar: guard(async (/** @type {Task} */ t) => { await api('tasks/' + t.id, 'PUT', { status: proximoStatus(t.status) }); await recarregar(); }),
    mudar: guard(async (/** @type {Task} */ t, /** @type {string} */ status) => { await api('tasks/' + t.id, 'PUT', { status }); await recarregar(); }),
  };
  const ctx = { recarregar: async () => { await recarregar(); }, abrir: acoes.abrir, modelo: () => m, fechou: () => setHashParams({ abrir: '' }) };
  async function recarregar() { await carregar(); desenhar(); }

  function chips() {
    const box = h('div', 'tk-chips');
    CHAVES.filter(k => !['aba', 'q'].includes(k) && F[k]).forEach(k => {
      const c = h('span', 'chipf', k === 'arquivadas' ? 'com arquivadas' : `${k}: ${F[k]}`); const x = h('button', '', '×'); x.type = 'button'; x.setAttribute('aria-label', 'remover filtro ' + k); x.onclick = () => mudarUrl({ [k]: '' }); c.append(x); box.append(c);
    });
    return box;
  }

  function filtros() {
    const box = h('div', 'tk-filters');
    /** @param {string} k @param {string} rotulo @param {string[]} valores */
    const sel = (k, rotulo, valores) => { const s = h('select'); s.setAttribute('aria-label', rotulo); s.append(new Option(rotulo, '')); valores.forEach(v => s.append(new Option(STATUS[/** @type {keyof typeof STATUS} */ (v)] || v, v))); s.value = F[k]; s.onchange = () => mudarUrl({ [k]: s.value }); return s; };
    const arq = h('label', 'check'); const cb = h('input'); cb.type = 'checkbox'; cb.checked = !!F.arquivadas; cb.onchange = () => mudarUrl({ arquivadas: cb.checked ? '1' : '' }); arq.append(cb, document.createTextNode('mostrar arquivadas'));
    box.append(sel('fase', 'Fase', [...FASES]), sel('prioridade', 'Prioridade', [...PRIORIDADES]), sel('status', 'Status', Object.keys(STATUS)), sel('quem', 'Quem faz', ['você', 'IA ok']), sel('modulo', 'Módulo', m.modulos()), arq);
    return box;
  }

  function desenhar() {
    const fase = m.faseAtual(), n = m.contagem(fase), p = m.progressoFase(fase), bd = m.bloqueioPorDecisao();
    cabeca.replaceChildren();
    // controles
    const topo = h('div', 'tk-top');
    const ab = tabs(ABAS, { active: F.aba, onChange: id => mudarUrl({ aba: id }), label: 'Visões das tarefas' });
    ab.el.style.margin = '0';
    const busca = h('input', 'search'); busca.type = 'search'; busca.placeholder = 'Buscar tarefa  ( / )'; busca.value = F.q; busca.id = 'tk-busca'; busca.setAttribute('aria-label', 'Buscar tarefa');
    let t0 = 0; busca.oninput = () => { clearTimeout(t0); t0 = window.setTimeout(() => { F.q = busca.value; setHashParams({ q: F.q }); desenharConteudo(); }, 150); };
    const fb = button('Filtros', { on: filtrosAbertos || CHAVES.some(k => !['aba', 'q'].includes(k) && F[k]), onClick: () => { filtrosAbertos = !filtrosAbertos; desenhar(); } });
    const nova = button('Nova tarefa', { variant: 'primary', onClick: () => novaTarefa(ctx, fase) }); nova.classList.add('push');
    topo.append(ab.el, busca, fb, nova);
    cabeca.append(topo);
    if (filtrosAbertos) cabeca.append(filtros());
    const ch = chips(); if (ch.children.length) cabeca.append(ch);
    // resumo: fase atual + 3 números
    const resumo = h('div', 'tk-phase');
    const head = h('div', 'head'); head.append(h('h2', '', `Fase atual: ${fase}`), h('span', 'meta', `${p.feitas} de ${p.total} feitas · ${n.fazendo} fazendo · ${n.prontas} prontas · ${n.bloqueadas} bloqueadas`));
    const pb = h('div', 'progress'); pb.append(Object.assign(h('i'), {})); /** @type {HTMLElement} */ (pb.firstChild).style.width = p.pct + '%';
    pb.setAttribute('role', 'progressbar'); pb.setAttribute('aria-valuenow', String(p.pct)); pb.setAttribute('aria-label', `Progresso da fase ${fase}`);
    resumo.append(head, pb);
    cabeca.append(resumo);
    if (bd.decisoes) {
      const b = h('div', 'banner'); b.append(document.createTextNode(`${bd.decisoes} decisão(ões) pendente(s) bloqueiam ${bd.tarefas} tarefa(s).`));
      const a = h('button', 'tk-banner-link', 'abrir Decisões'); a.type = 'button'; a.onclick = () => go('decisoes'); b.append(a); cabeca.append(b);
    }
    const mais = h('details', 'tk-more'); mais.append(h('summary', '', 'Progresso por fase'));
    FASES.forEach(f => { const pf = m.progressoFase(f); const bar = h('div', 'progress'); bar.append(h('i')); /** @type {HTMLElement} */ (bar.firstChild).style.width = pf.pct + '%'; const g = h('div', 'tk-phases'); g.append(h('span', '', f), bar, h('span', 'num faint', `${pf.feitas}/${pf.total}`)); mais.append(g); });
    cabeca.append(mais);
    desenharConteudo();
  }

  function desenharConteudo() {
    area.replaceChildren();
    const todas = m.tasks, fase = m.faseAtual(), vistas = filtrar(todas);
    if (F.aba === 'quadro') { area.append(quadro(vistas, m, acoes)); return; }
    if (F.aba === 'todas') { area.append(tabela(vistas, m, acoes)); return; }
    // Agora: a que está sendo feita + até 10 prontas da fase atual
    const fazendo = vistas.filter(t => t.status === 'fazendo').sort(m.porTrabalho);
    const prontas = vistas.filter(t => m.pronta(t) && (F.fase || t.fase === fase)).sort(m.porTrabalho).slice(0, 10);
    if (fazendo.length) { const s = h('div', 'tk-sec'); s.append(h('h3', '', 'Fazendo agora'), lista(fazendo, m, acoes, '')); area.append(s); }
    const s2 = h('div', 'tk-sec'); s2.append(h('h3', '', F.fase ? `Prontas para começar (${F.fase})` : `Prontas para começar na fase ${fase}`));
    if (prontas.length) s2.append(lista(prontas, m, acoes, ''));
    else {
      const aviso = emptyState('Nada pronto para começar agora.');
      const lst = m.bloqueioPorDecisao().lista.slice(0, 3);
      if (lst.length) { const ul = h('div', 'small muted'); ul.append(document.createTextNode('O que mais trava: ')); lst.forEach((d, i) => { if (i) ul.append(document.createTextNode(' · ')); ul.append(document.createTextNode(`${d.id} ${d.titulo} (destrava ${d.total})`)); }); aviso.append(ul, button('Abrir Decisões', { onClick: () => go('decisoes') })); }
      s2.append(aviso);
    }
    area.append(s2);
  }

  // ----- teclado: / busca · j k navega · s status · n nova · Enter abre (as linhas tratam) -----
  const foco = () => /** @type {HTMLElement | null} */ (document.activeElement?.closest('.tk-row, .tk-card') || null);
  const key = (/** @type {KeyboardEvent} */ e) => {
    const alvo = /** @type {HTMLElement} */ (e.target), digitando = /INPUT|TEXTAREA|SELECT/.test(alvo.tagName || '');
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.side-panel, [role=dialog]:not(.side-panel)')) return;
    if (e.key === '/' && !digitando) { e.preventDefault(); /** @type {HTMLElement | null} */ (document.getElementById('tk-busca'))?.focus(); return; }
    if (digitando) return;
    if (e.key === 'n') { e.preventDefault(); novaTarefa(ctx, m.faseAtual()); return; }
    const itens = /** @type {HTMLElement[]} */ ([...area.querySelectorAll('.tk-row, .tk-card')]);
    if (e.key === 'j' || e.key === 'k') { e.preventDefault(); const i = itens.indexOf(/** @type {HTMLElement} */ (foco())); itens[Math.max(0, Math.min(itens.length - 1, i + (e.key === 'j' ? 1 : -1)))]?.focus(); }
    if (e.key === 's') { const f = foco(), t = f && m.porId.get(/** @type {string} */ (f.dataset.id)); if (t) { e.preventDefault(); acoes.avancar(t); } }
  };
  document.addEventListener('keydown', key); S.timers.push({ remove: () => document.removeEventListener('keydown', key) });

  await carregar(); desenhar();
  S.timers.push(watch(['tasks', 'decisions'], recarregar, 15_000));
  const abrir = hashParams().get('abrir'); if (abrir && m.porId.has(abrir)) abrirTarefa(abrir, ctx);
}
