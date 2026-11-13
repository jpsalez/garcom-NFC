// @ts-check
import { api } from '../api.js';
import { $, countUp, h, ico, stagger } from '../lib/dom.js';
import { ago, hh } from '../lib/format.js';
import { go } from '../router.js';
import { S, agentCounts } from '../store.js';
import { refreshStatus } from '../status.js';
import { loadRuns } from './conversa.js';

const PHASES = ['Agora', 'MVP-1', 'MVP-2', 'MVP-3', 'Pós-MVP'];
const LEVEL = /** @type {Record<string, string>} */ ({ 'atenção': 'atencao', alto: 'alto', ok: 'ok' });
const settled = (/** @type {PromiseSettledResult<any>} */ r) => (r.status === 'fulfilled' ? r.value : null);

/** Cartão clicável (Enter também): leva à tela certa. @param {string} cls @param {string} title @param {() => void} onOpen */
function card(cls, title, onOpen) {
  const c = h('div', 'card hov gcard ' + cls); c.tabIndex = 0; c.setAttribute('role', 'link'); c.setAttribute('aria-label', title);
  c.onclick = e => { if (!(/** @type {HTMLElement} */ (e.target)).closest('button, a')) onOpen(); };
  c.onkeydown = e => { if (e.key === 'Enter' && e.target === c) onOpen(); };
  c.append(h('h3', '', title)); return c;
}

/** Selo de CI: ✓ passou, ✕ falhou, ● rodando. @param {any} run */
function ciBadge(run) {
  if (!run) return null;
  const state = run.status && run.status !== 'completed' ? 'pending' : run.conclusion === 'success' ? 'success' : run.conclusion ? 'failure' : 'pending';
  const b = h('span', 'tag ' + ({ success: 'tst', failure: 'p0', pending: 'ai2' }[/** @type {'success'} */ (state)]), { success: '✓ CI passou', failure: '✕ CI falhou', pending: '● CI rodando' }[/** @type {'success'} */ (state)]);
  b.title = run.workflow || 'CI'; return b;
}

/** Barras dos últimos 7 dias. @param {number[]} vals */
function spark(vals) {
  const box = h('div', 'spark'), mx = Math.max(...vals, 0.0001);
  vals.forEach((v, i) => { const b = h('i', v ? '' : 'z'); b.style.height = Math.max(6, v / mx * 100) + '%'; b.title = (i === vals.length - 1 ? 'hoje' : (vals.length - 1 - i) + ' d atrás') + ': US$ ' + v.toFixed(2); box.append(b); });
  return box;
}

/** Gasto por dia (últimos 7) somando as conversas do painel. */
function spend7() {
  const days = [...Array(7)].map((_, i) => new Date(Date.now() - (6 - i) * 864e5).toLocaleDateString('sv-SE'));
  const per = days.map(d => S.runs.filter(r => (r.started || '').slice(0, 10) === d).reduce((a, r) => a + (r.cost || 0), 0));
  return { per, total: per.reduce((a, b) => a + b, 0) };
}

export async function renderGeral() {
  const main = $('#main'); main.className = ''; main.replaceChildren();
  const head = h('div', 'row'); head.style.marginBottom = '14px';
  const when = h('span', 'mut', new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })), mode = h('span', 'hint'); head.append(when, mode); main.append(head);
  const grid = h('div', 'bento'); main.append(grid);
  await loadRuns(); try { await refreshStatus(); } catch (e) { /* o Socket.IO atualiza em seguida */ }
  const [tasks, decisions, health, graph, over] = (await Promise.allSettled([api('tasks'), api('decisions'), api('health'), api('graph?limit=1'), api('gh/overview')])).map(settled);
  const gh = over && !over.unavailable ? over : null;

  // ----- agentes e gasto (atualizam ao vivo pelo Socket.IO) -----
  const kA = card('s3 kpi', 'Agentes rodando agora', () => go('conversa')), nA = h('div', 'n', '0'), subA = h('small'); kA.append(nA, subA);
  const kS = card('s3', 'Gasto em 7 dias (US$)', () => go('analise')), nS = h('div', 'n'); nS.style.cssText = 'font:400 36px/1 var(--serif)'; const sparkBox = h('div'), barBox = h('div', 'hint'); kS.append(nS, sparkBox, barBox);
  grid.append(kA, kS);
  /** @param {boolean} first */
  const paintLive = first => {
    const c = agentCounts(); if (first) countUp(nA, c.total); else nA.textContent = String(c.total);
    subA.textContent = `${c.panel} no painel · ${c.live} na sessão interativa`; subA.className = 'mono dim';
    const sp = spend7(), lim = S.spend ? S.spend.limite : 5, hoje = S.spend ? S.spend.hoje : 0;
    nS.textContent = sp.total.toFixed(2).replace('.', ','); sparkBox.replaceChildren(spark(sp.per));
    barBox.textContent = `hoje US$ ${hoje.toFixed(2)} de US$ ${lim.toFixed(2)}`;
    mode.textContent = document.body.dataset.rt === 'on' ? '● ao vivo (Socket.IO)' : '○ reconectando…';
  };
  paintLive(true);
  const onStatus = () => paintLive(false); document.addEventListener('painel:status', onStatus); S.timers.push({ remove: () => document.removeEventListener('painel:status', onStatus) });

  // ----- tarefas -----
  const list = tasks ? /** @type {any[]} */ (tasks.tasks) : [];
  if (list.length) {
    const done = list.filter(t => t.status === 'done').length, c = card('s6', 'Tarefas', () => go('tarefas'));
    const top = h('div', 'row'); top.append(Object.assign(h('div', 'n'), { textContent: `${done}/${list.length}`, style: 'font:400 32px/1 var(--serif)' }), h('span', 'hint', `${Math.round(done / list.length * 100)}% feitas · ${list.filter(t => t.status === 'doing').length} em andamento · ${list.filter(t => t.status === 'blocked').length} bloqueadas`));
    const bar = h('div', 'pbar'); const i = h('i'); i.style.width = done / list.length * 100 + '%'; bar.append(i); c.append(top, bar);
    PHASES.forEach(ph => {
      const L = list.filter(t => t.phase === ph); if (!L.length) return;
      const d = L.filter(t => t.status === 'done').length, r = h('div', 'row'), lab = h('span', 'mut', ph), track = h('div', 'pbar'), fill = h('i');
      r.style.cssText = 'gap:8px;margin-top:6px;font:12px var(--mono)'; lab.style.width = '64px'; track.style.cssText = 'flex:1;margin:0'; fill.style.width = d / L.length * 100 + '%'; track.append(fill);
      r.append(lab, track, h('span', 'dim', `${d}/${L.length}`)); c.append(r);
    });
    grid.append(c);
  }

  // ----- decisões pendentes -----
  const pend = ((decisions && decisions.text) || '').split('\n').map((/** @type {string} */ l) => l.match(/^\s*-\s*\[ \]\s*(.+)/)).filter(Boolean).map(m => /** @type {RegExpMatchArray} */ (m)[1].replace(/\*\*/g, '').replace(/`/g, ''));
  if (pend.length) {
    const c = card('s4', 'Decisões pendentes', () => go('decisoes')); c.append(Object.assign(h('div', 'n'), { textContent: String(pend.length), style: 'font:400 32px/1 var(--serif)' }));
    pend.slice(0, 4).forEach(t => { const r = h('div', 'find'); r.style.padding = '6px 0'; r.append(h('span', 'tag dec', 'decidir'), h('div', 'hint', t.length > 80 ? t.slice(0, 78) + '…' : t)); c.append(r); }); grid.append(c);
  }

  // ----- arquivos que pedem atenção -----
  const prio = health && health.priorities ? /** @type {any[]} */ (health.priorities) : [];
  if (prio.length) {
    const c = card('s4', 'Arquivos que pedem atenção', () => go('saude-do-codigo'));
    prio.slice(0, 4).forEach(p => { const r = h('div', 'find'); r.style.cssText = 'padding:6px 0;cursor:pointer'; const d = h('div', 'grow'); d.append(h('b', 'mono', p.path.split('/').pop()), h('div', 'hint', p.advice ? String(p.advice).slice(0, 70) : p.path)); r.append(h('span', 'lv ' + (LEVEL[p.level] || 'ok'), p.level), d); r.onclick = e => { e.stopPropagation(); go('arquivos', '', 'path=' + encodeURIComponent('back-end/' + p.path).replace(/%2F/g, '/')); }; c.append(r); }); grid.append(c);
  }

  // ----- último commit + CI -----
  const last = graph && graph.commits && graph.commits[0];
  if (last) {
    const c = card('s4', 'Último commit', () => { S.commitSel = last.sha; go('commits'); });
    c.append(h('b', '', last.subject), h('div', 'hint mono', `${last.short} · ${last.author} · ${ago(last.ts)} atrás · +${last.add} −${last.del}`));
    const run = gh && (gh.runs_by_sha && gh.runs_by_sha[last.sha] ? gh.runs_by_sha[last.sha] : gh.latest_run), b = ciBadge(run);
    const row = h('div', 'row'); row.style.marginTop = '8px'; if (b) row.append(b); else row.append(h('span', 'hint', gh ? 'sem execução de CI para este commit' : 'GitHub não configurado')); c.append(row); grid.append(c);
  }

  // ----- pull requests abertos -----
  const prs = gh ? /** @type {any[]} */ (gh.open_prs || []) : [];
  if (prs.length) {
    const c = card('s6', `Pull requests abertos (${prs.length})`, () => go('github'));
    prs.slice(0, 5).forEach(p => { const r = h('div', 'find'); r.style.padding = '6px 0'; const d = h('div', 'grow'); d.append(h('b', '', `#${p.number} ${p.title}`), h('div', 'hint mono', p.branch || '')); r.append(ciBadge({ status: p.checks === 'pending' ? 'in_progress' : 'completed', conclusion: p.checks === 'success' ? 'success' : p.checks === 'failure' ? 'failure' : null }) || h('span'), d); c.append(r); }); grid.append(c);
  }

  // ----- ações rápidas -----
  const q = card('s6', 'Ações rápidas', () => { }); q.removeAttribute('role'); q.removeAttribute('tabindex'); const qa = h('div'); qa.style.cssText = 'display:grid;gap:10px';
  /** @type {[string, string, () => void, string][]} */
  const acts = [['Nova conversa com o orquestrador', 'chat', () => { S.sel = null; go('conversa'); }, 'p'], ['Executar uma receita de agentes', 'flow', () => { go('orquestrar'); }, ''], ['Rodar a verificação do projeto', 'shield', () => { go('verificar'); }, ''], ['Explorar a estrutura do projeto', 'folder', () => { go('arquivos'); }, ''], ['Abrir a paleta de comandos (Ctrl K)', 'command', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })), '']];
  acts.forEach(([t, ic, fn, c]) => { const b = h('button', 'btn ' + c); b.append(ico(ic), document.createTextNode(t)); b.onclick = fn; qa.append(b); }); q.append(qa); grid.append(q);

  // ----- conversas recentes (só se houver) -----
  const rl = S.runs.filter(r => !r.pipeline).slice(0, 5);
  if (rl.length) {
    const rc = h('div', 'card s12'); rc.append(h('h3', '', 'Conversas recentes'));
    rl.forEach(r => { const row = h('div', 'find'); row.style.cursor = 'pointer'; const d = h('div', 'grow'); d.append(h('b', '', r.title || '(sem título)'), h('div', 'hint', r.agent + ' · US$ ' + r.cost.toFixed(3) + ' · ' + hh(r.started))); row.append(h('span', 'badge st-' + r.status, r.status), d); row.onclick = () => { S.sel = r.id; go('conversa'); }; rc.append(row); }); grid.append(rc);
  }
  stagger(grid);
}
