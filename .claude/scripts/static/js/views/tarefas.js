// @ts-check
import { watch } from '../lib/realtime.js';
import { S } from '../store.js';
import { api } from '../api.js';
import { $, h, ico } from '../lib/dom.js';
import { md } from '../ui/markdown.js';
import { guard, toast } from '../ui/toast.js';

/* ---------- navegação ---------- */
/* ---------- Tarefas ---------- */
const TK = { items: [], view: 'prox', showDropped: false, st: 'todos', pr: 'todos', ph: 'todas', mode: 'todos', q: '', hideDone: false, open: new Set(), closed: new Set(), form: false };
const TK_ST = { todo: 'A fazer', doing: 'Fazendo', blocked: 'Bloqueada', done: 'Feita', dropped: 'Arquivada' };
const TK_PH = ['Agora', 'MVP-1', 'MVP-2', 'MVP-3', 'Pós-MVP'];
const TK_ORD = { doing: 0, todo: 1, blocked: 2, done: 3, dropped: 4 };
/** Trilhas: agrupam os módulos pelo que o projeto precisa entregar, na ordem em que fazem sentido. */
const TRACKS = [['1 · Decidir (produto)', ['Decisões de produto']], ['2 · API núcleo', ['Auth', 'Usuários e equipe', 'Administração (SUPER_ADMIN)', 'Mesas (tables)', 'Sessões de mesa (atendimento)', 'Chamados (calls)', 'Expiração (job)', 'Banco de dados']], ['3 · Tempo real', ['Tempo real (Socket.IO)']], ['4 · Qualidade', ['Testes', 'Segurança transversal', 'Documentação']], ['5 · Front-end e cliente', ['Front-end (Next.js)', 'QR / NFC']], ['6 · Produção', ['Infra da API', 'Docker e deploy']], ['7 · Futuro', ['Pós-MVP']]];
const trackOf = (/** @type {string} */ m) => (TRACKS.find(([, ms]) => ms.includes(m)) || ['Outras', []])[0];
/** Tarefas que contam no progresso: as arquivadas saem da conta. */
const tkLive = () => TK.items.filter(x => x.status !== 'dropped');
/** Quantas tarefas abertas dependem desta, direta ou indiretamente. */
function tkUnlocks(/** @type {string} */ id) {
  const seen = new Set(), walk = (/** @type {string} */ k) => TK.items.forEach(y => { if (y.status !== 'done' && y.status !== 'dropped' && (y.deps || []).includes(k) && !seen.has(y.id)) { seen.add(y.id); walk(y.id); } });
  walk(id); return seen.size;
}
const tkById = id => TK.items.find(x => x.id === id);
const tkDone = id => { const x = tkById(id); return !x || x.status === 'done' || x.status === 'dropped'; };
const tkUnmet = t => [...new Set([...(t.deps || []), ...(t.blocked_by ? [t.blocked_by] : [])])].filter(id => !tkDone(id));
const tkReady = t => t.status === 'todo' && tkUnmet(t).length === 0;
const tkTag = (txt, cls, title) => { const e = h('span', 'tag ' + cls, txt); if (title) e.title = title; return e; };
function tkMatch(t) {
  if (TK.st !== 'todos' && t.status !== TK.st) return false; if (TK.pr !== 'todos' && t.prio !== TK.pr) return false;
  if (TK.ph !== 'todas' && t.phase !== TK.ph) return false; if (TK.mode !== 'todos' && t.mode !== TK.mode) return false;
  if (TK.hideDone && t.status === 'done') return false;
  if (t.status === 'dropped' && !TK.showDropped && TK.st !== 'dropped') return false;
  if (TK.q && !(t.id + ' ' + t.title + ' ' + t.desc + ' ' + t.module + ' ' + t.refs).toLowerCase().includes(TK.q.toLowerCase())) return false;
  return true;
}
const tkSort = (a, b) => (TK_ORD[a.status] - TK_ORD[b.status]) || a.prio.localeCompare(b.prio) || (tkUnlocks(b.id) - tkUnlocks(a.id)) || TK_PH.indexOf(a.phase) - TK_PH.indexOf(b.phase);
const tkPatch = guard(async (t, body, redraw = true) => { const r = await api('tasks/' + t.id, 'PUT', body); Object.assign(t, r); if (redraw) tkRedraw(); });
function tkProg(list) { const d = list.filter(x => x.status === 'done').length; const p = list.length ? Math.round(d / list.length * 100) : 0; const bar = h('div', 'pbar'); const i = h('i'); i.style.width = p + '%'; bar.append(i); return { d, p, bar }; }
function tkSummary() {
  const c = h('div', 'card'); const all = tkLive(); const pg = tkProg(all);
  const mets = h('div', 'mets'); const met = (n, l, cls) => { const m = h('div', 'met' + (cls ? ' ' + cls : '')); m.append(h('b', '', n), h('span', '', l)); return m; };
  mets.append(met(pg.p + '%', 'concluído (' + pg.d + '/' + all.length + ')'), met(all.filter(x => x.status === 'doing').length, 'fazendo'), met(all.filter(tkReady).length, 'prontas para começar'),
    met(all.filter(x => x.status !== 'done' && tkUnmet(x).length).length, 'esperando outra tarefa', 'warn'), met(all.filter(x => x.mode === 'decisão' && x.status !== 'done').length, 'decisões suas pendentes', 'bad'));
  c.append(h('h3', '', 'Progresso do projeto'), pg.bar, mets);
  const ph = h('div', 'row'); ph.style.cssText = 'gap:18px;align-items:flex-start';
  TK_PH.forEach(f => { const l = all.filter(x => x.phase === f); if (!l.length) return; const p = tkProg(l); const b = h('div'); b.style.cssText = 'min-width:140px;flex:1'; b.append(h('div', 'hint', f + ' · ' + p.d + '/' + l.length), p.bar); ph.append(b); });
  c.append(ph); return c;
}
function tkDetail(t) {
  const d = h('div', 'tk-d'); d.onclick = e => e.stopPropagation();
  if (t.desc) d.append(h('div', '', t.desc));
  const meta = h('div', 'row'); meta.style.gap = '8px';
  if (t.refs) meta.append(h('span', 'hint', 'Documentação: ' + t.refs));
// @ts-ignore (.value em elemento genérico)
  (t.deps || []).forEach(id => { const x = tkById(id); const b = h('button', 'chipb' + (tkDone(id) ? ' on' : ''), (tkDone(id) ? '✓ ' : '○ ') + id + (x ? ' ' + x.title.slice(0, 38) : '')); b.title = 'Ver ' + id; b.onclick = () => { TK.q = id; TK.open.add(id); const qi = document.getElementById('tk-q'); if (qi) qi.value = id; tkRedraw(); }; meta.append(b); });
  d.append(meta);
  const f = h('div', 'row'); const inp = (v, w) => { const i = h('input'); i.type = 'text'; i.value = v; i.style.width = w; return i; }; const sel = (opts, v) => { const s = h('select'); opts.forEach(o => { const e = h('option', '', o); e.value = o; s.append(e); }); s.value = v; return s; };
  const ti = inp(t.title, '100%'); const mo = inp(t.module, '200px'); const pr = sel(['P0', 'P1', 'P2', 'P3'], t.prio); const phs = sel(TK_PH, t.phase); const md = sel(['você', 'IA ok', 'decisão'], t.mode);
  const ds = h('textarea'); ds.rows = 2; ds.value = t.desc; const nt = h('textarea'); nt.rows = 2; nt.value = t.notes || ''; nt.placeholder = 'Anotações suas (salvas ao sair do campo)'; nt.onblur = () => { if (nt.value !== (t.notes || '')) tkPatch(t, { notes: nt.value }, false); };
  f.append(mo, pr, phs, md); d.append(h('label', 'hint', 'Título'), ti, f, h('label', 'hint', 'Descrição'), ds, h('label', 'hint', 'Anotações'), nt);
  const act = h('div', 'row'); const sv = h('button', 'btn p sm', 'Salvar alterações'); sv.onclick = () => tkPatch(t, { title: ti.value, module: mo.value, prio: pr.value, phase: phs.value, mode: md.value, desc: ds.value });
  const cp = h('button', 'btn sm', 'Copiar pedido ao orquestrador'); cp.onclick = guard(async () => { await navigator.clipboard.writeText('Me guie na tarefa ' + t.id + ' (' + t.module + '): ' + t.title + '. ' + t.desc); toast('copiado: cole na conversa'); });
  const rm = h('button', 'btn sm', 'Excluir'); rm.onclick = guard(async () => { if (!confirm('Excluir ' + t.id + '?')) return; await api('tasks/' + t.id, 'DELETE'); TK.items = TK.items.filter(x => x !== t); TK.items.forEach(x => x.deps = (x.deps || []).filter(y => y !== t.id)); tkRedraw(); });
  act.append(sv, cp, rm); d.append(act); return d;
}
function tkRow(t) {
  const w = h('div', 'tk' + (t.status === 'done' ? ' done' : t.status === 'dropped' ? ' dropped' : '')); const hd = h('div', 'tk-h');
  const sel = h('select', 'tk-st st-' + t.status); Object.entries(TK_ST).forEach(([k, v]) => { const o = h('option', '', v); o.value = k; sel.append(o); }); sel.value = t.status; sel.setAttribute('aria-label', 'status de ' + t.id); sel.onclick = e => e.stopPropagation(); sel.onchange = () => tkPatch(t, { status: sel.value });
  hd.append(sel, h('span', 'mono dim', t.id), h('span', 'grow tk-t', t.title));
  const um = tkUnmet(t); if (t.status !== 'done' && um.length) hd.append(tkTag('aguarda ' + um[0] + (um.length > 1 ? ' +' + (um.length - 1) : ''), 'dec', 'Pendente: ' + um.join(', ')));
  if (tkReady(t)) hd.append(tkTag('pronta', 'tst'));
  const unl = t.status === 'done' || t.status === 'dropped' ? 0 : tkUnlocks(t.id); if (unl >= 2) hd.append(tkTag('destrava ' + unl, 'p1', 'tarefas abertas que dependem desta, direta ou indiretamente'));
  if (t.status === 'dropped') hd.append(tkTag('arquivada', 'no', 'fora do progresso; veja o motivo nas notas'));
  hd.append(tkTag(t.prio, 'p' + t.prio[1]), tkTag(t.phase, 'ph'), tkTag(t.mode, t.mode === 'decisão' ? 'dec' : 'md'));
  hd.onclick = () => { TK.open.has(t.id) ? TK.open.delete(t.id) : TK.open.add(t.id); tkRedraw(); }; w.append(hd); if (TK.open.has(t.id)) w.append(tkDetail(t)); return w;
}
function tkViewMod(list) {
  const box = h('div'); const mods = [...new Set(TK.items.map(x => x.module))];
  [...TRACKS.map(([n]) => n), 'Outras'].forEach(track => {
    const inTrack = mods.filter(m => trackOf(m) === track); const cards = [];
    inTrack.forEach(m => { const all = tkLive().filter(x => x.module === m); const l = list.filter(x => x.module === m).sort(tkSort); if (!l.length) return;
      const c = h('div', 'card'); c.style.marginBottom = '14px'; const p = tkProg(all); const open = !TK.closed.has(m);
      const hd = h('div', 'row'); hd.style.cursor = 'pointer'; hd.append(h('h3', 'grow', (open ? '▾ ' : '▸ ') + m), h('span', 'hint', p.d + '/' + all.length + ' · ' + p.p + '%'));
      hd.onclick = () => { open ? TK.closed.add(m) : TK.closed.delete(m); tkRedraw(); }; c.append(hd, p.bar); if (open) { const b = h('div'); b.style.marginTop = '10px'; l.forEach(t => b.append(tkRow(t))); c.append(b); } cards.push(c); });
    if (!cards.length) return;
    const all = tkLive().filter(x => inTrack.includes(x.module)), pg = tkProg(all), th = h('div', 'row'); th.style.cssText = 'margin:18px 0 8px;gap:12px';
    th.append(h('h2', 'grow tk-track', track), h('span', 'hint', pg.d + '/' + all.length + ' · ' + pg.p + '%')); box.append(th, ...cards);
  });
  return box;
}
function tkViewBoard(list) {
  const g = h('div', 'tk-cols'); Object.entries(TK_ST).filter(([k]) => k !== 'dropped' || TK.showDropped).forEach(([k, v]) => { const l = list.filter(x => x.status === k).sort(tkSort); const col = h('div', 'card'); col.append(h('h3', '', v + ' · ' + l.length)); l.forEach(t => { const r = tkRow(t); const m = h('div', 'hint', t.module); m.style.cssText = 'padding:0 10px 6px'; r.insertBefore(m, r.firstChild.nextSibling || null); col.append(r); }); g.append(col); }); return g;
}
function tkViewNext(list) {
  const box = h('div'); const ids = new Set(list.map(x => x.id));
  const dec = tkLive().filter(x => x.mode === 'decisão' && x.status !== 'done').map(x => ({ x, n: tkLive().filter(y => y.status !== 'done' && tkUnmet(y).includes(x.id)).length })).sort((a, b) => b.n - a.n);
  const c1 = h('div', 'card'); c1.style.marginBottom = '14px'; c1.append(h('h3', '', 'Decisões suas que destravam mais tarefas'), h('div', 'hint', 'O orquestrador não decide questões de produto: cada decisão aqui trava as tarefas contadas.'));
  dec.forEach(({ x, n }) => { const r = tkRow(x); const k = tkTag(n + ' tarefa' + (n === 1 ? '' : 's') + ' travada' + (n === 1 ? '' : 's'), n ? 'p1' : 'no'); r.firstChild.insertBefore(k, r.firstChild.children[3] || null); c1.append(r); }); box.append(c1);
  const c2 = h('div', 'card'); const rd = list.filter(t => tkReady(t) && t.mode !== 'decisão').sort((a, b) => a.prio.localeCompare(b.prio) || (tkUnlocks(b.id) - tkUnlocks(a.id)) || TK_PH.indexOf(a.phase) - TK_PH.indexOf(b.phase));
  c2.append(h('h3', '', 'Prontas para começar (' + rd.length + ')'), h('div', 'hint', 'Sem dependência pendente. Ordem: prioridade, depois quantas tarefas ela destrava, depois a fase.')); rd.slice(0, 30).forEach(t => c2.append(tkRow(t))); box.append(c2); return box;
}
function tkBody() { const list = TK.items.filter(tkMatch); return TK.view === 'mod' ? tkViewMod(list) : TK.view === 'quadro' ? tkViewBoard(list) : tkViewNext(list); }
function tkForm() {
  const c = h('div', 'card'); c.style.marginBottom = '14px'; c.append(h('h3', '', 'Nova tarefa'));
  const mo = h('input'); mo.type = 'text'; mo.placeholder = 'Módulo'; mo.setAttribute('list', 'tk-mods'); const dl = h('datalist'); dl.id = 'tk-mods'; [...new Set(TK.items.map(x => x.module))].forEach(m => { const o = h('option'); o.value = m; dl.append(o); });
  const ti = h('input'); ti.type = 'text'; ti.placeholder = 'Título'; ti.style.width = '100%'; const ds = h('textarea'); ds.rows = 2; ds.placeholder = 'Descrição';
  const pr = h('select'); ['P0', 'P1', 'P2', 'P3'].forEach(p => { const o = h('option', '', p); o.value = p; pr.append(o); }); pr.value = 'P2'; const ph = h('select'); TK_PH.forEach(p => { const o = h('option', '', p); o.value = p; ph.append(o); }); ph.value = 'MVP-2';
  const ok = h('button', 'btn p sm', 'Criar'); ok.onclick = guard(async () => { const r = await api('tasks', 'POST', { module: mo.value, title: ti.value, desc: ds.value, prio: pr.value, phase: ph.value }); TK.items.push(r); TK.form = false; tkRedraw(); toast('criada ' + r.id); });
  const r = h('div', 'row'); r.append(mo, pr, ph, ok); c.append(r, dl, ti, ds); ti.style.marginTop = '8px'; ds.style.marginTop = '8px'; return c;
}
function tkRedraw() { TK.sum.replaceChildren(tkSummary()); TK.form ? TK.formBox.replaceChildren(tkForm()) : TK.formBox.replaceChildren(); TK.body.replaceChildren(tkBody()); }
export async function renderTarefas() {
  const main = $('#main'); main.className = ''; main.replaceChildren(); TK.items = (await api('tasks')).tasks;
  TK.sum = h('div'); TK.sum.style.marginBottom = '14px'; TK.formBox = h('div'); TK.body = h('div');
  const bar = h('div', 'row'); bar.style.cssText = 'gap:8px;margin-bottom:14px';
  const seg = h('div', 'seg'); [['prox', 'Próximas ações'], ['mod', 'Por trilha'], ['quadro', 'Quadro']].forEach(([k, l]) => { const b = h('button', TK.view === k ? 'on' : '', l); b.onclick = () => { TK.view = k; seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); tkRedraw(); }; seg.append(b); });
  const mkSel = (key, opts, label) => { const s = h('select'); opts.forEach(([v, l]) => { const o = h('option', '', l); o.value = v; s.append(o); }); s.value = TK[key]; s.title = label; s.onchange = () => { TK[key] = s.value; tkRedraw(); }; return s; };
  const q = h('input'); q.type = 'text'; q.id = 'tk-q'; q.placeholder = 'buscar (id, título, RF…)'; q.value = TK.q; q.style.width = '210px'; q.oninput = () => { TK.q = q.value; tkRedraw(); };
  const hd = h('label', 'hint'); const cb = h('input'); cb.type = 'checkbox'; cb.checked = TK.hideDone; cb.onchange = () => { TK.hideDone = cb.checked; tkRedraw(); }; hd.append(cb, document.createTextNode(' ocultar feitas'));
  const ha = h('label', 'hint'); const ca = h('input'); ca.type = 'checkbox'; ca.checked = TK.showDropped; ca.onchange = () => { TK.showDropped = ca.checked; tkRedraw(); }; ha.append(ca, document.createTextNode(' mostrar arquivadas (' + TK.items.filter(x => x.status === 'dropped').length + ')'));
  const nw = h('button', 'btn p sm'); nw.append(ico('plus'), document.createTextNode('Nova tarefa')); nw.onclick = () => { TK.form = !TK.form; tkRedraw(); };
  bar.append(seg, ha, mkSel('st', [['todos', 'Todos os status'], ...Object.entries(TK_ST)], 'status'), mkSel('pr', [['todos', 'Toda prioridade'], ['P0', 'P0 crítico'], ['P1', 'P1 MVP'], ['P2', 'P2'], ['P3', 'P3 futuro']], 'prioridade'),
    mkSel('ph', [['todas', 'Todas as fases'], ...TK_PH.map(x => [x, x])], 'fase'), mkSel('mode', [['todos', 'Quem faz: todos'], ['você', 'você escreve'], ['IA ok', 'IA pode fazer'], ['decisão', 'decisão sua']], 'quem faz'), q, hd, nw);
  main.append(TK.sum, bar, TK.formBox, TK.body); tkRedraw();
  // alguém (você, um agente) mexeu no tasks.json: recarrega a lista, sem perder filtros nem o que está aberto
  S.timers.push(watch('tasks', async () => { TK.items = (await api('tasks')).tasks; tkRedraw(); }, 15_000));
}
