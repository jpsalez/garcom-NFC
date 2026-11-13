// @ts-check
import { api } from '../api.js';
import { $, h, svgEl } from '../lib/dom.js';
import { ago } from '../lib/format.js';
import { go } from '../router.js';
import { S, agentCounts } from '../store.js';
import { refreshStatus } from '../status.js';
import { badge } from '../ui/badge.js';
import { button } from '../ui/button.js';
import { section } from '../ui/section.js';
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
  const main = $('#main'); main.className = 'overview-page'; main.replaceChildren();
  const wrap = h('div', 'overview'); main.append(wrap);
  const data = await Promise.allSettled([loadRuns(), refreshStatus(), api('tasks'), api('decisoes'), api('health'), api('graph?limit=1'), api('gh/overview')]);
  if (!wrap.isConnected) return;
  const tasks = settled(data[2]), dec = settled(data[3]), health = settled(data[4]), graph = settled(data[5]), over = settled(data[6]);
  const gh = over && !over.unavailable ? over : null;
  const tarefas = tasks ? tasks.tasks : [], pend = dec ? dec.pendentes : [];
  const ids = new Set(pend.map(d => d.id)), pronta = dec ? prontas(tarefas, ids) : [], fazendo = tarefas.filter(t => t.status === 'fazendo');
  const fase = FASES.find(f => tarefas.some(t => !atendida(t) && t.fase === f));
  const action = (label, target, fn) => button(label, { small: true, onClick: fn || (() => go(target)) });
  const empty = (box, text) => box.append(h('p', 'ov-empty', text));
  const unavailable = (box, text) => { const n = h('div', 'ov-unavailable'); n.append(h('p', '', text), action('Tentar novamente', 'visao-geral')); box.append(n); };
  const intro = h('div', 'ov-intro'), title = h('div'); title.append(h('span', 'ov-kicker', 'Workspace / desenvolvimento'), h('h2', '', 'garcom-NFC'), h('p', '', 'Visão geral do desenvolvimento'));
  const actions = h('div', 'ov-actions'); actions.append(action('Verificar projeto', 'verificar'), button('Nova conversa', { variant: 'primary', onClick: () => { S.sel = null; S.selTeam = null; go('conversa'); } })); intro.append(title, actions); wrap.append(intro);
  const summary = h('div', 'ov-summary'); wrap.append(summary);
  const layout = h('div', 'ov-layout'), work = h('div'), side = h('div', 'ov-side'); layout.append(work, side); wrap.append(layout);
  const trabalho = section('Trabalho', { actions: [action('Todas as tarefas', 'tarefas')] }); work.append(trabalho.el);
  if (!dec) unavailable(trabalho.body, 'Decisões indisponíveis. Os bloqueios das tarefas não puderam ser confirmados.');
  pend.slice(0, 3).forEach(d => { const block = h('div', 'ov-blocker'); const blocked = d.bloqueia || []; block.append(h('span', 'ov-label', 'Decisão pendente · ' + d.id), h('h3', '', d.titulo), h('p', '', blocked.length ? `Bloqueia ${blocked.length} tarefa(s): ${blocked.join(', ')}.` : 'Aguardando definição.'), action('Abrir decisão', 'decisoes')); trabalho.body.append(block); });
  if (dec && dec.tarefas_bloqueadas.length) trabalho.body.append(h('p', 'ov-note', `${pend.length} decisão(ões) · ${dec.tarefas_bloqueadas.length} tarefa(s) bloqueada(s).`));
  const taskList = (label, list) => { if (!list.length) return; trabalho.body.append(h('h3', 'ov-subtitle', label)); list.forEach(t => { const b = action('', '', () => go('tarefas', '', 'q=' + encodeURIComponent(t.id))); b.className = 'ov-task'; b.append(h('span', 'ov-id', t.id), h('span', 'ov-task-title', t.titulo), badge(t.prioridade)); trabalho.body.append(b); }); };
  if (!tasks) unavailable(trabalho.body, 'Tarefas indisponíveis.');
  else { taskList('Em andamento', fazendo); taskList('Prontas para começar · ' + pronta.length, pronta.slice(0, 3)); if (!fazendo.length && !pronta.length) empty(trabalho.body, dec ? 'Nenhuma tarefa em andamento ou pronta para começar.' : 'Aguardando confirmação dos bloqueios.'); }
  const projeto = section('Código e entrega', { actions: [action('GitHub', 'github')] }); work.append(projeto.el);
  const commit = graph && graph.commits && graph.commits[0];
  if (!graph) unavailable(projeto.body, 'Histórico de commits indisponível.');
  else if (commit) { const r = h('div', 'ov-entry'), t = h('div', 'ov-entry-text'); t.append(h('span', 'ov-label', 'Último commit'), h('h3', '', commit.subject), h('p', 'ov-note', `${commit.short} · ${commit.author} · ${ago(commit.ts)} atrás`)); r.append(t); const ci = gh && ciBadge((gh.runs_by_sha || {})[commit.sha] || gh.latest_run); if (ci) r.append(ci); r.append(action('Ver commit', '', () => { S.commitSel = commit.sha; go('commits'); })); projeto.body.append(r); }
  else empty(projeto.body, 'Nenhum commit encontrado.');
  if (!gh) empty(projeto.body, 'GitHub não configurado ou indisponível.');
  else { const prs = gh.open_prs || []; if (!prs.length) empty(projeto.body, 'Nenhum pull request aberto.'); prs.slice(0, 5).forEach(p => { const r = h('div', 'ov-entry'), t = h('div', 'ov-entry-text'); t.append(h('span', 'ov-label', 'Pull request aberto'), h('h3', '', '#' + p.number + ' · ' + p.title)); r.append(t); const ci = ciBadge({ status: p.checks === 'pending' ? 'in_progress' : 'completed', conclusion: p.checks === 'success' ? 'success' : p.checks === 'failure' ? 'failure' : null }); if (ci) r.append(ci); r.append(action('Revisar', 'github')); projeto.body.append(r); }); }
  const files = section('Arquivos que pedem atenção', { actions: [action('Análise completa', 'saude-do-codigo')] }); work.append(files.el);
  if (!health) unavailable(files.body, 'Análise indisponível. Isso não significa ausência de problemas.');
  else { const priorities = health.priorities || []; if (!priorities.length) empty(files.body, 'Nenhum arquivo pede atenção nos dados disponíveis.'); priorities.slice(0, 4).forEach(p => { const r = h('div', 'ov-entry'), t = h('div', 'ov-entry-text'); t.append(h('h3', 'ov-path', p.path), h('p', '', Array.isArray(p.advice) ? p.advice.join(' ') : String(p.advice || 'Veja as métricas na análise completa.'))); r.append(t, badge(p.level, p.level === 'alto' ? 'err' : p.level === 'ok' ? 'ok' : 'warn'), action('Abrir arquivo', '', () => go('arquivos', '', 'path=' + encPath('back-end/' + p.path)))); files.body.append(r); }); }
  const conversations = section('Conversas recentes', { actions: [action('Todas', 'conversa')] }); side.append(conversations.el);
  const spending = section('Gastos do painel'); side.append(spending.el);
  function paint() {
    if (!wrap.isConnected) return;
    const counts = agentCounts(); summary.replaceChildren();
    summary.append(h('span', '', S.statusAt ? `${counts.total} agentes · ${counts.panel} painel / ${counts.live} sessão` : 'Agentes indisponíveis'), h('span', '', tasks ? `Tarefas ${tarefas.filter(t => t.status === 'feita').length} / ${tarefas.filter(t => t.status !== 'arquivada').length}${fase ? ' · ' + fase : ''}` : 'Tarefas indisponíveis'), h('span', '', dec ? `${pend.length} decisão(ões) pendente(s)` : 'Decisões indisponíveis'));
    conversations.body.replaceChildren();
    const recent = S.runs.filter(r => !r.pipeline).slice(0, 5);
    if (!recent.length) empty(conversations.body, data[0].status === 'rejected' ? 'Conversas indisponíveis.' : 'Nenhuma conversa iniciada pelo painel.');
    recent.forEach(r => { const b = action('', '', () => { S.sel = r.id; S.selTeam = null; go('conversa'); }); b.className = 'ov-conversation'; const top = h('span', 'ov-entry'); top.append(h('strong', '', r.title || '(sem título)'), badge(r.status, r.status === 'erro' ? 'err' : r.status === 'rodando' ? 'accent' : 'neutral')); b.append(top, h('span', 'ov-note', `${r.agent} · US$ ${Number(r.cost || 0).toFixed(3)}`)); conversations.body.append(b); });
    const links = h('div', 'ov-actions'); links.append(action('Sessão interativa', 'ao-vivo'), action('Receitas', 'orquestrar')); conversations.body.append(links);
    if (spending.body.querySelector('form')) return;
    spending.body.replaceChildren();
    if (!S.spend) { unavailable(spending.body, 'Gastos indisponíveis.'); return; }
    const today = Number(S.spend.hoje), limit = Number(S.spend.limite), sp = spend7();
    const amounts = h('div', 'ov-entry'), a = h('div'), b = h('div'); a.append(h('span', 'ov-label', 'Hoje'), h('div', 'ov-money', 'US$ ' + today.toFixed(2))); b.append(h('span', 'ov-label', 'Limite diário'), h('div', '', 'US$ ' + limit.toFixed(2))); amounts.append(a, b); spending.body.append(amounts);
    const track = h('div', 'progress'), fill = h('i'); fill.style.width = Math.min(100, limit > 0 ? today / limit * 100 : 0) + '%'; track.append(fill); spending.body.append(track);
    const controls = h('div', 'ov-entry'); controls.append(h('span', 'ov-note', limit > 0 ? Math.round(today / limit * 100) + '% utilizado' : 'Limite indisponível'), action('Ajustar limite', '', () => editLimit(limit))); spending.body.append(controls, h('h3', 'ov-subtitle', 'Últimos 7 dias · US$ ' + sp.total.toFixed(2)), linha(sp), h('p', 'ov-note', 'Somente conversas iniciadas pelo painel. A sessão interativa não está incluída.'), action('Analisar custos por sessão', 'analise'));
  }
  function editLimit(current) {
    const form = h('form', 'ov-budget-form'), label = h('label', '', 'Limite diário (US$)'), input = h('input'); input.type = 'number'; input.min = '0.01'; input.step = '0.01'; input.required = true; input.value = String(current); label.append(input);
    const save = button('Salvar limite'), cancel = button('Cancelar', { onClick: () => { form.remove(); paint(); } }), error = h('p', 'err-t'); error.setAttribute('role', 'alert'); const controls = h('div', 'ov-actions'); controls.append(save, cancel); form.append(label, controls, error); spending.body.replaceChildren(form);
    const submit = async e => { e.preventDefault(); if (!form.reportValidity()) return; save.disabled = true; cancel.disabled = true; try { const value = input.valueAsNumber; await api('settings', 'PUT', { limite_dia: value }); if (S.spend) S.spend.limite = value; form.remove(); paint(); toast('Limite atualizado'); } catch (e) { error.textContent = e instanceof Error ? e.message : String(e); } finally { save.disabled = false; cancel.disabled = false; } }; form.onsubmit = submit; save.onclick = submit; input.focus();
  }
  paint(); document.addEventListener('painel:status', paint); S.timers.push({ remove: () => document.removeEventListener('painel:status', paint) });
  const foot = h('div', 'ov-actions ov-footer'); foot.append(action('Executar receita', 'orquestrar'), action('Explorar arquivos', 'arquivos')); wrap.append(foot);
  if (matchMedia('(hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)').matches) wrap.addEventListener('pointermove', e => { const panel = e.target instanceof Element ? e.target.closest('.section') : null; if (!(panel instanceof HTMLElement)) return; const box = panel.getBoundingClientRect(); panel.style.setProperty('--ov-x', ((e.clientX - box.left) / box.width * 100).toFixed(1) + '%'); panel.style.setProperty('--ov-y', ((e.clientY - box.top) / box.height * 100).toFixed(1) + '%'); });
}
