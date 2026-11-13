// @ts-check
import { api } from '../api.js';
import { $, h, svgEl } from '../lib/dom.js';
import { ago } from '../lib/format.js';
import { go } from '../router.js';
import { S, agentCounts } from '../store.js';
import { refreshStatus } from '../status.js';
import { badge } from '../ui/badge.js';
import { button } from '../ui/button.js';
import { section, stats } from '../ui/section.js';
import { toast } from '../ui/toast.js';
import { loadRuns } from './conversa.js';

const FASES = ['Agora', 'MVP-1', 'MVP-2', 'MVP-3', 'Pós-MVP'];
const settled = (/** @type {PromiseSettledResult<any>} */ r) => (r.status === 'fulfilled' ? r.value : null);
const encPath = (/** @type {string} */ p) => encodeURIComponent(p).replace(/%2F/g, '/');
const atendida = (/** @type {{ status: string }} */ t) => t.status === 'feita' || t.status === 'arquivada';

/** Tarefas prontas: a-fazer, dependências atendidas e sem decisão pendente travando. @param {any[]} tarefas @param {Set<string>} pendentes */
function prontas(tarefas, pendentes) {
  const porId = new Map(tarefas.map(t => [t.id, t]));
  return tarefas.filter(t => {
    if (t.status !== 'a-fazer') return false;
    const d = t.bloqueada_por_decisao, decs = d ? (Array.isArray(d) ? d : [d]) : [];
    if (decs.some((/** @type {string} */ x) => pendentes.has(x))) return false;
    return (t.depende_de || []).every((/** @type {string} */ i) => { const o = porId.get(i); return !o || atendida(o); });
  }).sort((a, b) => a.prioridade.localeCompare(b.prioridade) || FASES.indexOf(a.fase) - FASES.indexOf(b.fase));
}

/** Selo de CI de um run do GitHub. @param {any} run */
function ciBadge(run) {
  if (!run) return null;
  const st = run.status && run.status !== 'completed' ? 'pending' : run.conclusion === 'success' ? 'success' : run.conclusion ? 'failure' : 'pending';
  const [txt, tone] = /** @type {Record<string, ['CI passou' | 'CI falhou' | 'CI rodando', 'ok' | 'err' | 'warn']>} */ ({ success: ['CI passou', 'ok'], failure: ['CI falhou', 'err'], pending: ['CI rodando', 'warn'] })[st];
  return badge(txt, tone, run.workflow || 'CI');
}

/** Gasto por dia dos últimos 7 dias, somando as conversas do painel. */
function spend7() {
  const dias = [...Array(7)].map((_, i) => new Date(Date.now() - (6 - i) * 864e5).toLocaleDateString('sv-SE'));
  const por = dias.map(d => S.runs.filter(r => (r.started || '').slice(0, 10) === d).reduce((a, r) => a + (r.cost || 0), 0));
  return { dias, por, total: por.reduce((a, b) => a + b, 0) };
}

/** Linha fina com os 7 dias. @param {{ dias: string[], por: number[] }} sp */
function linha(sp) {
  const W = 280, H = 36, mx = Math.max(...sp.por, 0.0001), x = (/** @type {number} */ i) => 4 + i * (W - 8) / 6, y = (/** @type {number} */ v) => H - 4 - v / mx * (H - 8);
  const svg = svgEl('svg', { class: 'spend-line', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Gasto dos últimos 7 dias' });
  svg.append(svgEl('polyline', { points: sp.por.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') }));
  sp.por.forEach((v, i) => { const c = svgEl('circle', { cx: x(i).toFixed(1), cy: y(v).toFixed(1), r: i === 6 ? 2.5 : 1.5 }); c.append(Object.assign(svgEl('title'), { textContent: `${sp.dias[i]}: US$ ${v.toFixed(2)}` })); svg.append(c); });
  return svg;
}

/** Linha de lista clicável (também com Enter). @param {() => void} onOpen */
function item(onOpen) {
  const r = h('div', 'item clickable'); r.tabIndex = 0; r.setAttribute('role', 'link');
  r.onclick = onOpen; r.onkeydown = e => { if (e.key === 'Enter') onOpen(); };
  return r;
}

export async function renderGeral() {
  const main = $('#main'); main.className = ''; main.replaceChildren();
  const wrap = h('div'); main.append(wrap);
  await loadRuns(); try { await refreshStatus(); } catch (e) { /* o Socket.IO atualiza em seguida */ }
  const [tasks, dec, health, graph, over] = (await Promise.allSettled([api('tasks'), api('decisoes'), api('health'), api('graph?limit=1'), api('gh/overview')])).map(settled);
  const gh = over && !over.unavailable ? over : null;
  const tarefas = /** @type {any[]} */ (tasks ? tasks.tasks : []), pend = /** @type {any[]} */ (dec ? dec.pendentes : []);
  const ids = new Set(pend.map(d => d.id)), ativas = tarefas.filter(t => !atendida(t));
  const feitas = tarefas.filter(t => t.status === 'feita').length, pronta = prontas(tarefas, ids);
  const faseAtual = FASES.find(f => ativas.some(t => t.fase === f)) || '';
  const sp = spend7();

  // ----- linha de abertura: data, status e as ações -----
  const top = h('div', 'ov-top'), when = h('span', 'when', new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })), live = h('span', 'when');
  const mais = h('select'); mais.setAttribute('aria-label', 'Outras ações'); mais.append(new Option('Mais ações…', ''));
  /** @type {[string, () => void][]} */
  const acoes = [['Executar uma receita de agentes', () => go('orquestrar')], ['Rodar a verificação do projeto', () => go('verificar')], ['Explorar os arquivos', () => go('arquivos')]];
  acoes.forEach(([t], i) => mais.append(new Option(t, String(i))));
  mais.onchange = () => { const i = mais.value; mais.value = ''; if (i) acoes[Number(i)][1](); };
  const g = h('span', 'grow'); top.append(when, live, g, button('Nova conversa', { variant: 'primary', icon: 'chat', onClick: () => { S.sel = null; go('conversa'); } }), mais); wrap.append(top);

  // ----- números de destaque (no máximo 4) -----
  const numeros = h('div'), pintaNumeros = () => {
    const c = agentCounts(), lim = S.spend ? S.spend.limite : 5, hoje = S.spend ? S.spend.hoje : 0;
    numeros.replaceChildren(stats([
      { label: 'agentes rodando', value: c.total, sub: `${c.panel} no painel · ${c.live} na sessão interativa` },
      { label: `tarefas feitas${faseAtual ? ' · fase ' + faseAtual : ''}`, value: `${feitas}/${tarefas.length - tarefas.filter(t => t.status === 'arquivada').length}`, sub: `${pronta.length} prontas para começar` },
      { label: 'decisões pendentes', value: pend.length, sub: dec && dec.tarefas_bloqueadas.length ? `bloqueiam ${dec.tarefas_bloqueadas.length} tarefas` : '' },
      { label: 'gasto em 7 dias (US$)', value: sp.total.toFixed(2).replace('.', ','), sub: `hoje US$ ${hoje.toFixed(2)} de ${lim.toFixed(2)}` },
    ]));
    live.textContent = document.body.dataset.rt === 'on' ? '· ao vivo' : '· reconectando…';
  };
  pintaNumeros(); wrap.append(numeros);
  const onStatus = () => pintaNumeros(); document.addEventListener('painel:status', onStatus); S.timers.push({ remove: () => document.removeEventListener('painel:status', onStatus) });

  // ----- Agora -----
  const fazendo = tarefas.filter(t => t.status === 'fazendo'), prox = pronta.slice(0, 3);
  if (fazendo.length || prox.length || pend.length) {
    const s = section('Agora', { actions: [button('Ver tarefas', { variant: 'ghost', small: true, onClick: () => go('tarefas') })] });
    /** @param {string} t @param {any[]} l */
    const bloco = (t, l) => { if (!l.length) return; s.body.append(h('div', 'ov-sub', t)); l.forEach(x => { const r = item(() => go('tarefas', '', 'q=' + x.id)); r.append(h('span', 'id', x.id), h('span', 't', x.titulo), badge(x.prioridade)); s.body.append(r); }); };
    bloco('Em andamento', fazendo); bloco('Próximas', prox);
    if (pend.length) {
      s.body.append(h('div', 'ov-sub', `Decisões pendentes (${pend.length})`));
      pend.slice(0, 3).forEach(d => { const r = item(() => go('decisoes')); r.append(h('span', 'id', d.id), h('span', 't', d.titulo), d.bloqueia.length ? badge(`bloqueia ${d.bloqueia.length}`, 'warn') : h('span')); s.body.append(r); });
      if (dec && dec.tarefas_bloqueadas.length) s.body.append(h('p', 'small muted', `${pend.length} decisões pendentes bloqueiam ${dec.tarefas_bloqueadas.length} tarefas.`));
    }
    s.body.classList.add('list'); wrap.append(s.el);
  }

  // ----- Projeto -----
  const ultimo = graph && graph.commits && graph.commits[0], prs = gh ? /** @type {any[]} */ (gh.open_prs || []) : [];
  const prio = health && health.priorities ? /** @type {any[]} */ (health.priorities) : [];
  if (ultimo || prs.length || prio.length) {
    const s = section('Projeto');
    if (ultimo) {
      s.body.append(h('div', 'ov-sub', 'Último commit'));
      const r = item(() => { S.commitSel = ultimo.sha; go('commits'); }), run = gh && (gh.runs_by_sha && gh.runs_by_sha[ultimo.sha] ? gh.runs_by_sha[ultimo.sha] : gh.latest_run);
      r.append(h('span', 'id', ultimo.short), h('span', 't', ultimo.subject), ciBadge(run) || h('span', 'tiny faint', gh ? '' : 'GitHub não configurado'), h('span', 'tiny faint', `${ultimo.author} · ${ago(ultimo.ts)} atrás`)); s.body.append(r);
    }
    if (prs.length) {
      s.body.append(h('div', 'ov-sub', `Pull requests abertos (${prs.length})`));
      prs.slice(0, 5).forEach(p => { const r = item(() => go('github')); r.append(h('span', 'id', '#' + p.number), h('span', 't', p.title), ciBadge({ status: p.checks === 'pending' ? 'in_progress' : 'completed', conclusion: p.checks === 'success' ? 'success' : p.checks === 'failure' ? 'failure' : null }) || h('span')); s.body.append(r); });
    }
    if (prio.length) {
      s.body.append(h('div', 'ov-sub', 'Arquivos que pedem atenção'));
      prio.slice(0, 4).forEach(p => { const r = item(() => go('arquivos', '', 'path=' + encPath('back-end/' + p.path))); r.append(h('span', 't mono', p.path.split('/').pop()), badge(p.level, p.level === 'alto' ? 'err' : p.level === 'ok' ? 'ok' : 'warn'), h('span', 'tiny faint ellipsis', p.advice ? String(p.advice).slice(0, 60) : '')); s.body.append(r); });
    }
    s.body.classList.add('list'); wrap.append(s.el);
  }

  // ----- Gasto -----
  const gs = section('Gasto', { meta: `limite diário US$ ${(S.spend ? S.spend.limite : 5).toFixed(2)}`, actions: [button('Ajustar limite', { variant: 'ghost', small: true, onClick: async () => {
    const v = prompt('Limite diário do painel (US$):', String(S.spend ? S.spend.limite : 5)); if (!v) return;
    try { await api('settings', 'PUT', { limite_dia: parseFloat(v) }); toast('limite atualizado'); renderGeral(); } catch (e) { toast(e instanceof Error ? e.message : String(e), true); }
  } })] });
  const lim = S.spend ? S.spend.limite : 5, hoje = S.spend ? S.spend.hoje : 0, bar = h('div', 'progress'), fill = h('i'); fill.style.width = Math.min(100, hoje / lim * 100) + '%'; bar.append(fill);
  gs.body.append(h('div', 'small', `Hoje US$ ${hoje.toFixed(2)} de US$ ${lim.toFixed(2)}`), bar, linha(sp), h('div', 'tiny faint', 'Últimos 7 dias, só das conversas iniciadas pelo painel.')); wrap.append(gs.el);

  // ----- conversas recentes (só se houver) -----
  const rl = S.runs.filter(r => !r.pipeline).slice(0, 5);
  if (rl.length) {
    const s = section('Conversas recentes', { actions: [button('Abrir Conversa', { variant: 'ghost', small: true, onClick: () => go('conversa') })] });
    rl.forEach(r => { const row = item(() => { S.sel = r.id; go('conversa'); }); row.append(h('span', 't', r.title || '(sem título)'), h('span', 'tiny faint', `${r.agent} · US$ ${r.cost.toFixed(3)}`), badge(r.status, r.status === 'rodando' ? 'accent' : r.status === 'erro' ? 'err' : 'neutral')); s.body.append(row); });
    s.body.classList.add('list'); wrap.append(s.el);
  }
}
