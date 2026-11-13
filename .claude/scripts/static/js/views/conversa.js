// @ts-check
import { watch } from '../lib/realtime.js';
import { renderChips } from '../status.js';
import { api } from '../api.js';
import { $, h, ico } from '../lib/dom.js';
import { fmtDur, fmtN } from '../lib/format.js';
import { go } from '../router.js';
import { S } from '../store.js';
import { md } from '../ui/markdown.js';
import { guard, toast } from '../ui/toast.js';

/* ---------- anexos de contexto ---------- */
export function updFoot() { $('#foot').textContent = S.draft.length ? S.draft.length + ' anexo(s) em preparo' : 'garcom-NFC'; }
function attachUI() {
  const wrap = h('div'), chips = h('div', 'cchips'), bar = h('div', 'bar'); const est = h('span', 'hint');
  const paint = async () => { chips.replaceChildren(); S.draft.forEach((a, i) => { const c = h('span', 'cc'); c.append(h('span', '', a.type === 'file' ? a.path : 'nota: ' + a.text.slice(0, 40))); const x = h('button', '', '✕'); x.onclick = () => { S.draft.splice(i, 1); paint(); }; c.append(x); chips.append(c); });
    est.textContent = ''; if (S.draft.length) { try { const e = await api('estimate', 'POST', { attach: S.draft }); est.textContent = '≈ ' + fmtN(e.tokens) + ' tokens anexados'; } catch (e) { est.textContent = ''; } } updFoot(); };
  const pop = h('div', 'pop'); pop.style.display = 'none';
  const open = (items, pick) => { pop.replaceChildren(); items.forEach(p => { const d = h('div', '', p); d.onclick = () => { pick(p); pop.style.display = 'none'; }; pop.append(d); }); pop.style.display = items.length ? 'block' : 'none'; };
  const fileIn = h('input'); fileIn.type = 'text'; fileIn.placeholder = 'anexar arquivo…'; fileIn.style.cssText = 'width:140px;padding:4px 10px;font-size:12.5px;border-radius:8px'; fileIn.title = 'Anexar arquivo do projeto';
  fileIn.oninput = guard(async () => { if (fileIn.value.length < 2) { pop.style.display = 'none'; return; } open(await api('files?q=' + encodeURIComponent(fileIn.value)), p => { S.draft.push({ type: 'file', path: p }); fileIn.value = ''; paint(); }); });
  const kn = h('select'); kn.append(new Option('documentação', '')); (S.cat ? S.cat.knowledge : []).forEach(p => kn.append(new Option(p.split('/').pop().replace('.md', ''), p))); kn.onchange = () => { if (kn.value) { S.draft.push({ type: 'file', path: kn.value }); kn.value = ''; paint(); } };
  const note = h('button', 'btn sm', 'nota'); note.onclick = () => { const t = prompt('Nota de contexto para o agente:'); if (t && t.trim()) { S.draft.push({ type: 'note', text: t.trim() }); paint(); } };
  const ic = h('span', 'dim'); ic.append(ico('clip')); bar.append(ic, fileIn, kn, note, est, pop); wrap.append(chips, bar); paint(); return wrap;
}
/* ---------- cartões de subagente e rastro de ferramentas (como no plugin) ---------- */
function buildModel(events, runStatus) {
  const items = [], by = {};
  for (const e of events) {
    if (e.k === 'user') items.push({ type: 'user', e });
    else if (e.k === 'sys') items.push({ type: 'sys', e });
    else if (e.k === 'err') items.push({ type: 'err', e });
    else if (e.k === 'final') items.push({ type: 'final', e });
    else if (e.k === 'text') { if (e.parent && by[e.parent]) by[e.parent].nested.push({ type: 'text', e }); else items.push({ type: 'text', e }); }
    else if (e.k === 'tool') { const ag = e.tool === 'Agent' || e.tool === 'Task'; const it = { type: ag ? 'agent' : 'tool', e, nested: [], status: 'rodando', t0: e.t }; by[e.id] = it; if (e.parent && by[e.parent]) by[e.parent].nested.push(it); else items.push(it); }
    else if (e.k === 'toolres') { const it = by[e.id]; if (it) { it.status = e.err ? 'erro' : 'ok'; it.t1 = e.t; it.res = e.text; } }
  }
  const dead = runStatus !== 'rodando' && runStatus !== 'pausado';
  const fix = a => a.forEach(it => { if (it.status === 'rodando' && dead) it.status = 'interrompido'; if (it.nested) fix(it.nested); }); fix(items);
  return items;
}
function statusMark(st) { const s = h('span', 's'); if (st === 'rodando') s.append(h('span', 'spin')); else { s.textContent = st === 'ok' ? '✓' : st === 'erro' ? '✕' : '–'; s.className = 's st-' + (st === 'ok' ? 'ok' : st === 'erro' ? 'erro' : 'ocioso'); } return s; }
function toolRow(it) {
  const r = h('div', 'tool'); r.append(statusMark(it.status), h('b', 'k-' + (it.e.kind || 'outro'), it.e.tool), h('span', 't', it.e.target || ''));
  if (it.t1 && it.t0) r.append(h('span', 'd', fmtDur(+new Date(it.t1) - +new Date(it.t0)))); return r;
}
export function agentCard(it) {
  const open = S.open.has(it.e.id), c = h('div', 'ag ' + (it.status === 'rodando' ? 'rodando' : '') + (open ? ' open' : ''));
  const hd = h('div', 'h'); const chev = ico('chev'); chev.classList.add('chev');
  hd.append(chev, statusMark(it.status), h('span', 'nm', it.e.stype || 'agente'), h('span', 'ds grow', it.e.desc || it.e.target || ''),
    h('span', 'badge st-' + (it.status === 'ok' ? 'concluido' : it.status), it.status === 'ok' ? 'concluído' : it.status));
  if (it.t1 && it.t0) hd.append(h('span', 'dim mono', fmtDur(+new Date(it.t1) - +new Date(it.t0)))); else if (it.status === 'rodando') hd.append(h('span', 'dim mono', it.nested.filter(x => x.type === 'tool' || x.type === 'agent').length + ' chamadas'));
  hd.onclick = () => { S.open.has(it.e.id) ? S.open.delete(it.e.id) : S.open.add(it.e.id); c.classList.toggle('open'); }; c.append(hd);
  const tools = it.nested.filter(x => x.type !== 'text'); const lastT = tools[tools.length - 1];
  if (it.status === 'rodando' && lastT) c.append(h('div', 'last', lastT.e.tool + ' ' + (lastT.e.target || '')));
  const body = h('div', 'body'); it.nested.forEach(n => { if (n.type === 'text') { const t = h('div', 'res'); t.append(md(n.e.text)); body.append(t); } else body.append(n.type === 'agent' ? agentCard(n) : toolRow(n)); });
  if (it.res) { const r = h('div', 'res'); r.append(h('b', 'dim', 'resposta do subagente\n')); r.append(document.createTextNode(it.res)); body.append(r); }
  if (!it.nested.length && !it.res) body.append(h('div', 'hint', 'sem atividade registrada'));
  c.append(body); return c;
}
function renderItems(items, box) {
  items.forEach(it => {
    if (it.type === 'user') { const m = h('div', 'msg-u', it.e.text); if (it.e.attach && it.e.attach.length) m.append(h('div', 'hint', '📎 ' + it.e.attach.join(', '))); box.append(m); }
    else if (it.type === 'text') { const m = h('div', 'msg-a'), b = h('div', 'bd'); m.append(h('div', 'av', 'G'), b); b.append(md(it.e.text)); box.append(m); }
    else if (it.type === 'tool') { const t = h('div', 'trace'); t.append(toolRow(it)); box.append(t); }
    else if (it.type === 'agent') box.append(agentCard(it));
    else if (it.type === 'final') box.append(h('div', 'fin', (it.e.ok ? 'concluído' : 'terminou com problema') + ' · US$ ' + Number(it.e.cost || 0).toFixed(4) + ' · ' + (it.e.turns || 0) + ' turno(s)'));
    else if (it.type === 'sys') box.append(h('div', 'sysnote', it.e.text));
    else if (it.type === 'err') box.append(h('div', 'errbox', 'erro: ' + it.e.text));
  });
}
/* ---------- aba Conversa ---------- */
const SUGS = [['Planejar um módulo', 'Arquiteto, dados e API montam um plano para o módulo tables.', 'Planeje o módulo tables: arquivos, schema, rotas e a ordem de escrita.'],
  ['Revisar isolamento entre restaurantes', 'Segurança e dados olham o tenant nos repositories.', 'Revise o isolamento entre restaurantes (tenant) nos repositories e no login.'],
  ['Explicar o fluxo de atendimento', 'Sessão da mesa, token por aparelho e chamado.', 'Explique o fluxo de sessão da mesa, token por aparelho e chamado, e o que já está implementado.'],
  ['Cenários de teste', 'O que testar primeiro nas regras de sessão e chamado.', 'Quais cenários de teste faltam para as regras de sessão e chamado?']];
export async function renderChat() {
  const main = $('#main'); main.className = 'chatmain'; main.replaceChildren();
  const convs = h('div', 'convs'), chat = h('div', 'chat'); main.append(convs, chat);
  const nb = h('button', 'btn p'); nb.append(ico('plus'), document.createTextNode('Nova conversa')); nb.onclick = () => { S.sel = null; S.selTeam = null; paintAll(); };
  function paintList() {
    convs.replaceChildren(nb);
    S.teams.forEach(t => { const d = h('div', 'conv' + (t.id === S.selTeam ? ' on' : '')); const r = h('div', 'row'); r.append(h('b', 'grow', t.task || '(equipe)'), h('span', 'dot st-' + t.status));
      d.append(r, h('span', '', 'equipe · ' + t.runs.length + ' agente(s) · US$ ' + t.cost.toFixed(3))); d.onclick = () => { S.selTeam = t.id; S.sel = null; paintAll(); }; convs.append(d); });
    S.runs.filter(r => !r.pipeline && !r.team).forEach(r => { const d = h('div', 'conv' + (r.id === S.sel ? ' on' : '')); const t = h('div', 'row'); t.append(h('b', 'grow', r.title || '(sem título)'), h('span', 'dot st-' + r.status));
      d.append(t, h('span', '', r.agent.replace('garcom-', '') + ' · US$ ' + r.cost.toFixed(3))); d.onclick = () => { S.sel = r.id; S.selTeam = null; paintAll(); }; convs.append(d); });
  }
  async function paintChat() { chat.replaceChildren(); S.view = null; S.tview = null; if (S.selTeam) return teamView(chat); if (S.sel) return runView(chat); welcome(chat); }
  const paintAll = () => { paintList(); paintChat(); }; S.paintAll = paintAll;
  await loadRuns(); paintAll();
  S.timers.push(watch('runs', async () => { await loadRuns(); paintList(); if (S.selTeam) await pollTeam(); else if (S.sel) await pollRun(); }, 3000));
}
export async function loadRuns() {
  const [r, t] = await Promise.all([api('runs'), api('teams')]); S.runs = r; S.teams = t;
  renderChips();
}
function composer(onSend, opts = {}) {
  const dock = h('div', 'dock'), box = h('div', 'composer'); const ta = h('textarea'); ta.rows = 1; ta.placeholder = opts.placeholder || 'Escreva para o agente…';
  ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'; };
  const go = h('button', 'btn p ic'); go.append(ico('send')); go.title = 'Enviar (Enter)';
  const stop = h('button', 'btn ic d'); stop.append(ico('stop')); stop.title = 'Parar'; stop.style.display = 'none';
  let au = attachUI();
  const send = guard(async () => { if (!ta.value.trim()) return; go.disabled = true; try { await onSend(ta.value); ta.value = ''; ta.style.height = 'auto'; S.draft = []; const n = attachUI(); au.replaceWith(n); au = n; updFoot(); } finally { go.disabled = false; } });
  go.onclick = send; ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } };
  const foot = h('div', 'row'); foot.style.cssText = 'justify-content:flex-end'; foot.append(stop, go);
  box.append(ta, au, foot); dock.append(box);
  dock.set = running => { go.style.display = running ? 'none' : ''; stop.style.display = running ? '' : 'none'; ta.placeholder = running ? 'o agente está executando… você pode ir escrevendo' : (opts.placeholder || 'Continue a conversa…'); };
  dock.stopBtn = stop; dock.ta = ta; return dock;
}
function welcome(chat) {
  const st = h('div', 'stream'), hero = h('div', 'hero'); st.append(hero);
  hero.append(h('h2', '', 'Em que posso orquestrar hoje?'));
  const sub = h('p'); hero.append(sub);
  const seg = h('div', 'seg'), bL = h('button', '', 'Orquestrador local · 0 tokens'), bU = h('button', '', 'Agente único'); seg.append(bL, bU); hero.append(seg);
  const opt = h('div', 'row'); opt.style.marginTop = '12px'; hero.append(opt);
  const sel = h('select'); S.cat.agents.forEach(a => sel.append(new Option(a.name.replace('garcom-', '') + '  (' + a.model + ')', a.name))); sel.value = 'garcom-arquiteto';
  const bud = h('input'); bud.type = 'number'; bud.step = '0.1'; bud.min = '0.1'; bud.max = '3'; bud.value = '0.5'; bud.style.width = '80px';
  const planBox = h('div', 'plan'); st.append(planBox);
  const ref = {}; const sg = h('div', 'sugs'); SUGS.forEach(([t, d, p], i) => { const c = h('div', 'card hov sug rise'); c.style.setProperty('--i', i); c.append(h('b', '', t), h('span', '', d)); c.onclick = () => { ref.dock.ta.value = p; ref.dock.ta.oninput(); ref.dock.ta.focus(); }; sg.append(c); }); hero.append(sg);
  function setMode(m) { S.mode = m; bL.classList.toggle('on', m === 'local'); bU.classList.toggle('on', m === 'single'); opt.replaceChildren(); planBox.replaceChildren();
    if (m === 'local') { sub.textContent = 'O orquestrador do painel é um roteador local: lê a tarefa, escolhe os especialistas por regras e monta o plano sem gastar nenhum token. Só os especialistas que você disparar consomem tokens.'; opt.append(h('span', 'mut', 'teto por agente US$'), bud); }
    else { sub.textContent = 'Converse direto com um especialista. Cada mensagem gasta tokens desse agente.'; opt.append(h('span', 'mut', 'Conversar com'), sel, h('span', 'mut', 'teto US$'), bud); } }
  bL.onclick = () => setMode('local'); bU.onclick = () => setMode('single'); setMode(S.mode);
  const dock = composer(async text => {
    if (S.mode === 'single') { const r = await api('runs', 'POST', { agent: sel.value, prompt: text, attach: S.draft, budget: parseFloat(bud.value) }); S.sel = r.id; S.selTeam = null; S.ev[r.id] = { n: 0, list: [] }; await loadRuns(); S.paintAll(); return; }
    const pl = await api('plan', 'POST', { task: text }); showPlan(planBox, text, pl, parseFloat(bud.value)); planBox.scrollIntoView({ behavior: 'smooth' });
  }, { placeholder: 'Descreva a tarefa. O plano é montado localmente, sem custo…' });
  ref.dock = dock; chat.append(st, dock);
}
function showPlan(box, task, pl, budget) {
  box.replaceChildren(); const c = h('div', 'card'); box.append(c); c.append(h('h3', '', 'Plano do orquestrador local'), h('div', 'hint', pl.note));
  if (pl.hint) c.append(h('div', 'hint warn', pl.hint)); if (pl.recipes.length) c.append(h('div', 'hint', 'Receita sugerida na aba Orquestrar: ' + pl.recipes.join(', ')));
  const chosen = new Set(pl.agents.map(a => a.agent)), rows = [];
  const cnt = h('div', 'hint'); const upd = () => { const n = rows.filter(r => r.cb.checked).length; cnt.textContent = n + ' de 3 especialistas selecionados'; rows.forEach(r => { r.cb.disabled = !r.cb.checked && n >= 3; }); go_.disabled = n === 0; };
  S.cat.agents.filter(a => a.name !== 'garcom-orquestrador').forEach(a => { const hit = pl.agents.find(x => x.agent === a.name); const row = h('div', 'prow'); const cb = h('input'); cb.type = 'checkbox'; cb.checked = chosen.has(a.name); cb.onchange = upd;
    const t = h('div'); t.append(h('b', '', a.name.replace('garcom-', '')), h('span', 'hint', hit ? '  ' + hit.reason : '  (sem gatilho)')); const ta = h('textarea'); ta.value = hit ? hit.prompt : task + '\n\nResponda em até 300 palavras, em tópicos, conclusão primeiro. Confirme no código antes de afirmar.';
    row.append(cb, t, ta); c.append(row); rows.push({ cb, a, ta }); });
  const go_ = h('button', 'btn p'); go_.append(ico('play'), document.createTextNode('Disparar equipe'));
  go_.onclick = guard(async () => { go_.disabled = true; const items = rows.filter(r => r.cb.checked).map(r => ({ agent: r.a.name, prompt: r.ta.value })); const t = await api('teams', 'POST', { task, items, budget, attach: S.draft }); S.draft = []; S.selTeam = t.id; S.sel = null; await loadRuns(); S.paintAll(); });
  const r = h('div', 'row'); r.style.marginTop = '12px'; r.append(go_, cnt); c.append(r); upd();
}
function teamCard(r) {
  const cache = S.ev[r.id] || { list: [] }, items = buildModel(cache.list, r.status), open = !S.closed.has(r.id);
  const c = h('div', 'ag tc ' + (r.status === 'rodando' ? 'rodando ' : '') + (open ? 'open' : '')); c.style.marginLeft = '0';
  const hd = h('div', 'h'); const chev = ico('chev'); chev.classList.add('chev');
  const mark = statusMark(r.status === 'rodando' ? 'rodando' : r.status === 'concluido' ? 'ok' : r.status === 'pausado' ? 'pausado' : 'erro');
  const tools = items.filter(x => x.type === 'tool' || x.type === 'agent'), last = tools[tools.length - 1];
  hd.append(chev, mark, h('span', 'nm', r.agent.replace('garcom-', '')), h('span', 'ds grow', last && r.status === 'rodando' ? last.e.tool + ' ' + (last.e.target || '') : (r.title || '').slice(0, 80)), h('span', 'badge st-' + r.status, r.status), h('span', 'dim mono', 'US$ ' + r.cost.toFixed(3)));
  const mk = (ic, tip, fn, dis, cls) => { const b = h('button', 'btn sm ic ' + (cls || '')); b.append(ico(ic)); b.title = tip; b.disabled = dis; b.onclick = guard(async e => { e.stopPropagation(); await api('runs/' + r.id + '/' + fn, 'POST', {}); await loadRuns(); await pollTeam(true); }); hd.append(b); };
  mk('pause', 'Pausar', 'pause', r.status !== 'rodando'); mk('play', 'Continuar', 'resume', r.status !== 'pausado'); mk('stop', 'Parar', 'stop', !(r.status === 'rodando' || r.status === 'pausado'), 'd');
  hd.onclick = () => { S.closed.has(r.id) ? S.closed.delete(r.id) : S.closed.add(r.id); c.classList.toggle('open'); }; c.append(hd);
  const body = h('div', 'body'); tools.forEach(t => body.append(t.type === 'agent' ? agentCard(t) : toolRow(t)));
  const texts = items.filter(x => x.type === 'text'); const ans = texts[texts.length - 1];
  if (ans) { const a = h('div', 'ans'); a.append(md(ans.e.text)); body.append(a); } else if (r.status === 'rodando') body.append(h('div', 'hint', 'trabalhando…'));
  const err = items.find(x => x.type === 'err'); if (err) body.append(h('div', 'errbox', 'erro: ' + err.e.text));
  const mini = h('div', 'mini'); const ta = h('textarea'); ta.placeholder = 'Pergunte algo só a este agente…'; const sb = h('button', 'btn sm p', 'Enviar'); sb.disabled = r.status === 'rodando' || r.status === 'pausado';
  sb.onclick = guard(async () => { if (!ta.value.trim()) return; await api('runs/' + r.id + '/send', 'POST', { prompt: ta.value, attach: [] }); ta.value = ''; await loadRuns(); await pollTeam(true); }); mini.append(ta, sb); body.append(mini);
  c.append(body); return c;
}
async function teamView(chat) {
  const t = S.teams.find(x => x.id === S.selTeam); if (!t) { S.selTeam = null; return welcome(chat); }
  const head = h('div', 'chathead'), hd = h('div', 'row grow'), acts = h('div', 'row'); head.append(hd, acts);
  const st = h('div', 'stream'), col = h('div', 'col'); st.append(col);
  const dock = composer(async text => { for (const r of t.runs) { try { await api('runs/' + r.id + '/send', 'POST', { prompt: text, attach: S.draft }); } catch (e) { } } await loadRuns(); await pollTeam(true); }, { placeholder: 'Mensagem para TODOS os agentes da equipe (cada cartão também tem o seu campo)…' });
  chat.append(head, st, dock); S.tview = { id: t.id, hd, acts, col, st, sig: '' }; await pollTeam(true);
}
async function pollTeam(force) {
  const v = S.tview; if (!v || v.id !== S.selTeam) return; const t = S.teams.find(x => x.id === v.id); if (!t) return; let changed = false;
  for (const r of t.runs) { const c = S.ev[r.id] = S.ev[r.id] || { n: 0, list: [] }; const d = await api('runs/' + r.id + '?since=' + c.n); if (d.events.length) { c.list.push(...d.events); c.n = d.total; changed = true; } }
  const sig = t.runs.map(r => r.id + r.status + r.cost).join('|'); if (!force && !changed && sig === v.sig) return; v.sig = sig;
  const near = v.st.scrollTop + v.st.clientHeight >= v.st.scrollHeight - 80;
  v.hd.replaceChildren(h('b', '', 'Equipe'), h('span', 'badge st-' + t.status, t.status), h('span', 'dim mono', 'US$ ' + t.cost.toFixed(3) + ' · ' + t.runs.length + ' agente(s)'));
  v.acts.replaceChildren(); [['pause', 'Pausar todos', 'pause'], ['play', 'Continuar todos', 'resume'], ['stop', 'Parar todos', 'stop']].forEach(([ic, tip, fn]) => { const b = h('button', 'btn sm ic' + (fn === 'stop' ? ' d' : '')); b.append(ico(ic)); b.title = tip; b.onclick = guard(async () => { for (const r of t.runs) { try { await api('runs/' + r.id + '/' + fn, 'POST', {}); } catch (e) { } } await loadRuns(); await pollTeam(true); }); v.acts.append(b); });
  v.col.replaceChildren(); const tk = h('div', 'msg-u', t.task); v.col.append(tk); v.col.append(h('div', 'sysnote', 'Orquestrador local: plano e disparo sem tokens · ' + t.runs.length + ' especialista(s) trabalhando de forma independente'));
  t.runs.forEach(r => v.col.append(teamCard(r)));
  const done = t.runs.every(r => ['concluido', 'erro', 'parado'].includes(r.status));
  if (done) { const parts = t.runs.map(r => { const items = buildModel((S.ev[r.id] || { list: [] }).list, r.status).filter(x => x.type === 'text'); const a = items[items.length - 1]; return a ? '## ' + r.agent.replace('garcom-', '') + '\n\n' + a.e.text : null; }).filter(Boolean);
    if (parts.length) { const c = h('div', 'card'); c.append(h('h3', '', 'Respostas juntas (montadas sem IA)')); const joined = parts.join('\n\n'); const box = h('div'); box.append(md(joined)); c.append(box); const r = h('div', 'row'); r.style.marginTop = '10px';
      const cp = h('button', 'btn sm', 'Copiar'); cp.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(joined); toast('copiado'); }; const an = h('button', 'btn sm'); an.append(ico('clip'), document.createTextNode('Anexar como nota')); an.onclick = () => { S.draft.push({ type: 'note', text: joined.slice(0, 9000) }); updFoot(); toast('anexado à próxima mensagem'); }; r.append(cp, an); c.append(r); v.col.append(c); } }
  if (near || force) v.st.scrollTop = v.st.scrollHeight;
}
async function runView(chat) {
  const run = S.runs.find(r => r.id === S.sel); if (!run) { S.sel = null; return welcome(chat); }
  const head = h('div', 'chathead'); const hd = h('div', 'row grow'); head.append(hd); const acts = h('div', 'row'); head.append(acts);
  const st = h('div', 'stream'), col = h('div', 'col'); st.append(col);
  const dock = composer(async text => { await api('runs/' + run.id + '/send', 'POST', { prompt: text, attach: S.draft }); await pollRun(true); await loadRuns(); }, { placeholder: 'Continue a conversa (o agente lembra do que já foi dito)…' });
  dock.stopBtn.onclick = guard(async () => { await api('runs/' + run.id + '/stop', 'POST', {}); await loadRuns(); await pollRun(true); });
  chat.append(head, st, dock); S.view = { head, hd, acts, st, col, dock, id: run.id, drawn: -1, status: '' };
  S.ev[run.id] = { n: 0, list: [] }; await pollRun(true);
}
async function pollRun(force) {
  const v = S.view; if (!v || v.id !== S.sel) return; const cache = S.ev[v.id];
  const d = await api('runs/' + v.id + '?since=' + cache.n); cache.list.push(...d.events); cache.n = d.total;
  if (!force && cache.list.length === v.drawn && d.status === v.status) { headInfo(d); return; }
  const near = v.st.scrollTop + v.st.clientHeight >= v.st.scrollHeight - 80; v.col.replaceChildren(); renderItems(buildModel(cache.list, d.status), v.col);
  v.drawn = cache.list.length; v.status = d.status; headInfo(d); v.dock.set(d.status === 'rodando'); if (near || force) v.st.scrollTop = v.st.scrollHeight;
}
function headInfo(d) {
  const v = S.view; v.hd.replaceChildren(); v.hd.append(h('b', '', d.agent), h('span', 'badge st-' + d.status, d.status), h('span', 'dim mono', 'US$ ' + d.cost.toFixed(3) + ' · ' + d.turns + ' turno(s) · ' + (d.session || '—').slice(0, 8)));
  v.acts.replaceChildren(); const mk = (ic, tip, fn, dis, cls = '') => { const b = h('button', 'btn sm ic ' + cls); b.append(ico(ic)); b.title = tip; b.disabled = dis; b.onclick = guard(async () => { await api('runs/' + d.id + '/' + fn, 'POST', {}); if (fn === 'forget') { S.sel = null; delete S.ev[d.id]; await loadRuns(); S.paintAll(); } else { await loadRuns(); await pollRun(true); } }); v.acts.append(b); };
  const run = d.status === 'rodando', pau = d.status === 'pausado'; mk('pause', 'Pausar (congela o processo)', 'pause', !run); mk('play', 'Continuar', 'resume', !pau); mk('stop', 'Parar', 'stop', !(run || pau), 'd'); mk('trash', 'Esquecer conversa', 'forget', run || pau);
}
