// @ts-check
import { watch } from '../lib/realtime.js';
import { renderChips } from '../status.js';
import { api } from '../api.js';
import { $, h } from '../lib/dom.js';
import { S } from '../store.js';
import { button } from '../ui/button.js';
import { md } from '../ui/markdown.js';
import { attachPanel, updFoot } from '../ui/obs-attach.js';
import { money, rotulado, statusBadge, statusDot } from '../ui/obs-common.js';
import { agentCard, buildModel, renderItems, statusMark, toolRow } from '../ui/obs-trace.js';
import { guard, toast } from '../ui/toast.js';

export { updFoot };

const SUGESTOES = [
  ['Planejar um módulo', 'Planeje o módulo tables: arquivos, schema, rotas e a ordem de escrita.'],
  ['Revisar isolamento entre restaurantes', 'Revise o isolamento entre restaurantes (tenant) nos repositories e no login.'],
  ['Explicar o fluxo de atendimento', 'Explique o fluxo de sessão da mesa, token por aparelho e chamado, e o que já está implementado.'],
  ['Cenários de teste', 'Quais cenários de teste faltam para as regras de sessão e chamado?'],
];
let optsAbertas = false; // o painel "Opções" lembra se estava aberto

export async function renderChat() {
  const main = $('#main'); main.className = 'flush'; main.replaceChildren();
  const wrap = h('div', 'chatwrap'), convs = h('aside', 'convs'), chat = h('div', 'chat'); wrap.append(convs, chat); main.append(wrap);
  convs.setAttribute('aria-label', 'Conversas');
  function paintList() {
    convs.replaceChildren();
    const head = h('div', 'convs-h'); head.append(button('Nova conversa', { small: true, onClick: () => { S.sel = null; S.selTeam = null; paintAll(); } })); convs.append(head);
    const list = h('div', 'list'); convs.append(list);
    /** @param {string} id @param {boolean} on @param {string} titulo @param {string} meta @param {string} status @param {() => void} pick */
    const item = (id, on, titulo, meta, status, pick) => {
      const b = h('button', 'conv' + (on ? ' on' : '')); b.type = 'button'; if (on) b.setAttribute('aria-current', 'true'); b.dataset.id = id;
      const t = h('span', 'conv-t'); t.append(statusDot(status), h('span', 'ellipsis', titulo)); b.append(t, h('span', 'faint tiny ellipsis', meta)); b.onclick = pick; list.append(b);
    };
    S.teams.forEach((/** @type {any} */ t) => item(t.id, t.id === S.selTeam, t.task || '(equipe)', `equipe · ${t.runs.length} agente(s) · ${money(t.cost)}`, t.status, () => { S.selTeam = t.id; S.sel = null; paintAll(); }));
    S.runs.filter(r => !r.pipeline && !r.team).forEach(r => item(r.id, r.id === S.sel, r.title || '(sem título)', `${r.agent.replace('garcom-', '')} · ${money(r.cost)}`, r.status, () => { S.sel = r.id; S.selTeam = null; paintAll(); }));
    if (!list.children.length) list.append(h('div', 'faint small pad', 'Nenhuma conversa ainda.'));
  }
  async function paintChat() { chat.replaceChildren(); S.view = null; S.tview = null; if (S.selTeam) return teamView(chat); if (S.sel) return runView(chat); welcome(chat); }
  const paintAll = () => { paintList(); paintChat(); }; S.paintAll = paintAll;
  await loadRuns();
  if (S.prefill) { S.sel = null; S.selTeam = null; } // texto vindo de outra tela: começa uma conversa nova
  paintAll();
  S.timers.push(watch('runs', async () => { await loadRuns(); paintList(); if (S.selTeam) await pollTeam(); else if (S.sel) await pollRun(); }, 3000));
}

export async function loadRuns() {
  const [r, t] = await Promise.all([api('runs'), api('teams')]); S.runs = r; S.teams = t;
  renderChips();
}

/**
 * Compositor: texto, "Opções" recolhidas (anexos e o que mais a tela pedir) e Enviar.
 * @param {(text: string) => Promise<void>} onSend @param {{ placeholder?: string, extra?: HTMLElement }} [opts]
 */
function composer(onSend, opts = {}) {
  const dock = h('div', 'dock'), box = h('div', 'composer');
  const ta = h('textarea'); ta.rows = 1; ta.placeholder = opts.placeholder || 'Escreva para o agente…'; ta.setAttribute('aria-label', 'Mensagem para o agente');
  ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'; };
  const send = button('', { variant: 'primary', icon: 'send', title: 'Enviar (Enter)' }); send.classList.add('icon');
  const stop = button('', { variant: 'danger', icon: 'stop', title: 'Parar' }); stop.classList.add('icon'); stop.hidden = true;
  const opt = button('Opções', { variant: 'ghost', small: true }); opt.setAttribute('aria-expanded', String(optsAbertas));
  const panel = h('div', 'copts'); panel.hidden = !optsAbertas;
  const rotulo = () => { opt.textContent = S.draft.length ? `Opções · ${S.draft.length} anexo(s)` : 'Opções'; };
  let anexos = attachPanel(rotulo);
  panel.append(...(opts.extra ? [opts.extra] : []), anexos);
  opt.onclick = () => { optsAbertas = !optsAbertas; panel.hidden = !optsAbertas; opt.setAttribute('aria-expanded', String(optsAbertas)); };
  rotulo();
  const enviar = guard(async () => {
    if (!ta.value.trim()) return; send.disabled = true;
    try { await onSend(ta.value); ta.value = ''; ta.style.height = 'auto'; S.draft = []; const novo = attachPanel(rotulo); anexos.replaceWith(novo); anexos = novo; updFoot(); rotulo(); } finally { send.disabled = false; }
  });
  send.onclick = enviar; ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); enviar(); } };
  const foot = h('div', 'composer-foot'); foot.append(opt, h('span', 'grow'), stop, send);
  box.append(ta, panel, foot); dock.append(box);
  return Object.assign(dock, {
    ta, stopBtn: stop, send,
    set: (/** @type {boolean} */ running) => { send.hidden = running; stop.hidden = !running; ta.placeholder = running ? 'O agente está executando… você pode ir escrevendo' : (opts.placeholder || 'Continue a conversa…'); },
  });
}

/** Conversa nova: modo, agente e teto ficam em "Opções"; sugestões são links de texto. @param {HTMLElement} chat */
function welcome(chat) {
  const st = h('div', 'stream'), hero = h('div', 'hero'); st.append(hero);
  hero.append(h('h2', '', 'Nova conversa'));
  const sub = h('p', 'muted'); hero.append(sub);
  const sug = h('div', 'sugs'); sug.append(h('span', 'faint small', 'Sugestões:'));
  /** @type {{ dock?: ReturnType<typeof composer> }} */ const ref = {};
  SUGESTOES.forEach(([t, p]) => { const b = h('button', 'linkbtn', t); b.type = 'button'; b.onclick = () => { const ta = /** @type {any} */ (ref.dock).ta; ta.value = p; ta.oninput(); ta.focus(); }; sug.append(b); });
  hero.append(sug);

  const extra = h('div', 'opts-grid');
  const seg = h('div', 'seg'), bL = h('button', '', 'Orquestrador local'), bU = h('button', '', 'Agente único'); [bL, bU].forEach(b => { b.type = 'button'; }); seg.append(bL, bU);
  const selAg = h('select'); selAg.setAttribute('aria-label', 'Agente'); S.cat.agents.forEach((/** @type {any} */ a) => selAg.append(new Option(a.name.replace('garcom-', '') + '  (' + a.model + ')', a.name))); selAg.value = 'garcom-arquiteto';
  const bud = h('input'); bud.type = 'number'; bud.step = '0.1'; bud.min = '0.1'; bud.max = '3'; bud.value = '0.5'; bud.setAttribute('aria-label', 'Teto por agente em dólares');
  const fAg = rotulado('Conversar com', selAg), fBud = rotulado('Teto por agente (US$)', bud);
  extra.append(rotulado('Modo', seg), fAg, fBud);
  const planBox = h('div', 'plan'); st.append(planBox);

  /** @param {string} m */
  function setMode(m) {
    S.mode = m; bL.setAttribute('aria-pressed', String(m === 'local')); bU.setAttribute('aria-pressed', String(m !== 'local')); fAg.hidden = m === 'local'; planBox.replaceChildren();
    sub.textContent = m === 'local'
      ? 'O orquestrador local escolhe os especialistas por regras e monta o plano sem gastar tokens. Só os especialistas que você disparar consomem.'
      : 'Conversa direta com um especialista. Cada mensagem gasta tokens dele.';
  }
  bL.onclick = () => setMode('local'); bU.onclick = () => setMode('single'); setMode(S.mode);

  const dock = composer(async text => {
    if (S.mode === 'single') {
      const r = await api('runs', 'POST', { agent: selAg.value, prompt: text, attach: S.draft, budget: parseFloat(bud.value) });
      S.sel = r.id; S.selTeam = null; S.ev[r.id] = { n: 0, list: [] }; await loadRuns(); S.paintAll(); return;
    }
    const pl = await api('plan', 'POST', { task: text }); showPlan(planBox, text, pl, parseFloat(bud.value), dock); planBox.scrollIntoView({ behavior: 'smooth' });
  }, { placeholder: 'Descreva a tarefa. O plano é montado localmente, sem custo…', extra });
  ref.dock = dock; chat.append(st, dock);
  if (S.prefill) { dock.ta.value = S.prefill; S.prefill = ''; dock.ta.oninput(); dock.ta.focus(); }
}

/** Plano do orquestrador local: escolha até 3 especialistas e edite o pedido de cada um. @param {HTMLElement} box @param {string} task @param {any} pl @param {number} budget @param {ReturnType<typeof composer>} dock */
function showPlan(box, task, pl, budget, dock) {
  box.replaceChildren(); dock.send.classList.remove('primary'); // com o plano na tela, o botão principal é "Disparar equipe"
  const c = h('section', 'section'); box.append(c); c.append(h('h3', '', 'Plano do orquestrador local'), h('p', 'muted small', pl.note));
  if (pl.hint) c.append(h('p', 'small warn-t', pl.hint)); if (pl.recipes.length) c.append(h('p', 'muted small', 'Receita sugerida em Orquestrar: ' + pl.recipes.join(', ')));
  const escolhidos = new Set(pl.agents.map((/** @type {any} */ a) => a.agent)), rows = /** @type {{ cb: HTMLInputElement, a: any, ta: HTMLTextAreaElement }[]} */ ([]);
  const cnt = h('span', 'muted small');
  const disparar = button('Disparar equipe', { variant: 'primary', icon: 'play' });
  const upd = () => { const n = rows.filter(r => r.cb.checked).length; cnt.textContent = n + ' de 3 especialistas selecionados'; rows.forEach(r => { r.cb.disabled = !r.cb.checked && n >= 3; }); disparar.toggleAttribute('disabled', n === 0); };
  S.cat.agents.filter((/** @type {any} */ a) => a.name !== 'garcom-orquestrador').forEach((/** @type {any} */ a) => {
    const hit = pl.agents.find((/** @type {any} */ x) => x.agent === a.name), nome = a.name.replace('garcom-', '');
    const row = h('div', 'prow'), cb = h('input'); cb.type = 'checkbox'; cb.checked = escolhidos.has(a.name); cb.onchange = upd; cb.setAttribute('aria-label', 'Incluir ' + nome);
    const t = h('div'); t.append(h('b', '', nome), h('span', 'muted small', hit ? '  ' + hit.reason : '  (sem gatilho)'));
    const ta = h('textarea'); ta.rows = 3; ta.setAttribute('aria-label', 'Pedido para ' + nome); ta.value = hit ? hit.prompt : task + '\n\nResponda em até 300 palavras, em tópicos, conclusão primeiro. Confirme no código antes de afirmar.';
    row.append(cb, t, ta); c.append(row); rows.push({ cb, a, ta });
  });
  disparar.onclick = guard(async () => {
    disparar.setAttribute('disabled', ''); const items = rows.filter(r => r.cb.checked).map(r => ({ agent: r.a.name, prompt: r.ta.value }));
    const t = await api('teams', 'POST', { task, items, budget, attach: S.draft }); S.draft = []; S.selTeam = t.id; S.sel = null; await loadRuns(); S.paintAll();
  });
  const r = h('div', 'row'); r.append(disparar, cnt); c.append(r); upd();
}

/** Botões de ação de uma conversa ou agente (só ícone, com título). @param {HTMLElement} onde @param {[string, string, () => any, boolean?, boolean?][]} acoes */
function acoes(onde, acoes) {
  acoes.forEach(([icon, title, fn, off, danger]) => { const b = button('', { variant: danger ? 'danger' : 'ghost', small: true, icon, title, onClick: guard(async e => { e.stopPropagation(); await fn(); }) }); if (off) b.setAttribute('disabled', ''); onde.append(b); });
}

/** Linha de um agente da equipe: abre para ver o rastro, a resposta e perguntar só a ele. @param {any} r */
function teamCard(r) {
  const cache = S.ev[r.id] || { list: [] }, items = buildModel(cache.list, r.status), open = !S.closed.has(r.id);
  const c = h('div', 'sub tc' + (r.status === 'rodando' ? ' running' : '') + (open ? ' open' : ''));
  const hd = h('div', 'sub-h'); hd.setAttribute('role', 'button'); hd.tabIndex = 0; hd.setAttribute('aria-expanded', String(open));
  const tools = items.filter(x => x.type === 'tool' || x.type === 'agent'), last = tools[tools.length - 1];
  const mark = statusMark(r.status === 'rodando' ? 'rodando' : r.status === 'concluido' ? 'ok' : r.status === 'pausado' ? 'pausado' : 'erro');
  hd.append(h('span', 'chev', '▸'), mark, h('b', '', r.agent.replace('garcom-', '')), h('span', 'ds ellipsis', last && r.status === 'rodando' ? last.e.tool + ' ' + (last.e.target || '') : (r.title || '').slice(0, 80)), statusBadge(r.status), h('span', 'dur', money(r.cost)));
  const refresh = async () => { await loadRuns(); await pollTeam(true); };
  const ac = h('span', 'row-acts'); ac.addEventListener('click', e => e.stopPropagation());
  acoes(ac, [['pause', 'Pausar', async () => { await api('runs/' + r.id + '/pause', 'POST', {}); await refresh(); }, r.status !== 'rodando'],
    ['play', 'Continuar', async () => { await api('runs/' + r.id + '/resume', 'POST', {}); await refresh(); }, r.status !== 'pausado'],
    ['stop', 'Parar', async () => { await api('runs/' + r.id + '/stop', 'POST', {}); await refresh(); }, !(r.status === 'rodando' || r.status === 'pausado'), true]]);
  hd.append(ac);
  const toggle = () => { S.closed.has(r.id) ? S.closed.delete(r.id) : S.closed.add(r.id); c.classList.toggle('open'); hd.setAttribute('aria-expanded', String(c.classList.contains('open'))); };
  hd.onclick = toggle; hd.onkeydown = e => { if (e.target === hd && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(); } };
  c.append(hd);
  const body = h('div', 'sub-b'); tools.forEach(t => body.append(t.type === 'agent' ? agentCard(t) : toolRow(t)));
  const textos = items.filter(x => x.type === 'text'), resposta = textos[textos.length - 1];
  if (resposta) { const a = h('div', 'ans'); a.append(md(resposta.e.text)); body.append(a); } else if (r.status === 'rodando') body.append(h('div', 'muted small', 'trabalhando…'));
  const err = items.find(x => x.type === 'err'); if (err) body.append(h('div', 'errline', 'erro: ' + err.e.text));
  const mini = h('div', 'mini'), ta = h('textarea'); ta.rows = 2; ta.placeholder = 'Pergunte algo só a este agente…'; ta.setAttribute('aria-label', 'Pergunta para ' + r.agent.replace('garcom-', ''));
  const sb = button('Enviar', { small: true, onClick: guard(async () => { if (!ta.value.trim()) return; await api('runs/' + r.id + '/send', 'POST', { prompt: ta.value, attach: [] }); ta.value = ''; await refresh(); }) });
  if (r.status === 'rodando' || r.status === 'pausado') sb.setAttribute('disabled', '');
  mini.append(ta, sb); body.append(mini); c.append(body); return c;
}

/** @param {HTMLElement} chat */
async function teamView(chat) {
  const t = S.teams.find((/** @type {any} */ x) => x.id === S.selTeam); if (!t) { S.selTeam = null; return welcome(chat); }
  const head = h('div', 'chathead'), hd = h('div', 'row grow'), ac = h('div', 'row'); head.append(hd, ac);
  const st = h('div', 'stream'), col = h('div', 'col'); st.append(col);
  const dock = composer(async text => {
    for (const r of t.runs) { try { await api('runs/' + r.id + '/send', 'POST', { prompt: text, attach: S.draft }); } catch (e) { /* um agente ocupado não impede os outros */ } }
    await loadRuns(); await pollTeam(true);
  }, { placeholder: 'Mensagem para TODOS os agentes da equipe (cada agente também tem o seu campo)…' });
  chat.append(head, st, dock); S.tview = { id: t.id, hd, acts: ac, col, st, sig: '' }; await pollTeam(true);
}

/** @param {boolean} [force] */
async function pollTeam(force) {
  const v = S.tview; if (!v || v.id !== S.selTeam) return; const t = S.teams.find((/** @type {any} */ x) => x.id === v.id); if (!t) return; let mudou = false;
  for (const r of t.runs) { const c = S.ev[r.id] = S.ev[r.id] || { n: 0, list: [] }; const d = await api('runs/' + r.id + '?since=' + c.n); if (d.events.length) { c.list.push(...d.events); c.n = d.total; mudou = true; } }
  const sig = t.runs.map((/** @type {any} */ r) => r.id + r.status + r.cost).join('|'); if (!force && !mudou && sig === v.sig) return; v.sig = sig;
  const perto = v.st.scrollTop + v.st.clientHeight >= v.st.scrollHeight - 80;
  v.hd.replaceChildren(h('b', '', 'Equipe'), statusBadge(t.status), h('span', 'muted small num', money(t.cost) + ' · ' + t.runs.length + ' agente(s)'));
  v.acts.replaceChildren();
  const todos = (/** @type {string} */ fn) => async () => { for (const r of t.runs) { try { await api('runs/' + r.id + '/' + fn, 'POST', {}); } catch (e) { /* já estava nesse estado */ } } await loadRuns(); await pollTeam(true); };
  acoes(v.acts, [['pause', 'Pausar todos', todos('pause')], ['play', 'Continuar todos', todos('resume')], ['stop', 'Parar todos', todos('stop'), false, true]]);
  v.col.replaceChildren(); v.col.append(h('div', 'msg user', t.task), h('div', 'cnote', 'Orquestrador local: plano e disparo sem tokens · ' + t.runs.length + ' especialista(s) trabalhando de forma independente'));
  t.runs.forEach((/** @type {any} */ r) => v.col.append(teamCard(r)));
  const prontos = t.runs.every((/** @type {any} */ r) => ['concluido', 'erro', 'parado'].includes(r.status));
  if (prontos) {
    const partes = t.runs.map((/** @type {any} */ r) => { const a = buildModel((S.ev[r.id] || { list: [] }).list, r.status).filter(x => x.type === 'text').pop(); return a ? '## ' + r.agent.replace('garcom-', '') + '\n\n' + a.e.text : null; }).filter(Boolean);
    if (partes.length) {
      const c = h('section', 'section'); c.append(h('h3', '', 'Respostas juntas (montadas sem IA)')); const junto = partes.join('\n\n'); const corpo = h('div'); corpo.append(md(junto)); c.append(corpo);
      const r = h('div', 'row'); r.append(button('Copiar', { small: true, onClick: () => { navigator.clipboard && navigator.clipboard.writeText(junto); toast('copiado'); } }),
        button('Anexar como nota', { small: true, onClick: () => { S.draft.push({ type: 'note', text: junto.slice(0, 9000) }); updFoot(); toast('anexado à próxima mensagem'); } })); c.append(r); v.col.append(c);
    }
  }
  if (perto || force) v.st.scrollTop = v.st.scrollHeight;
}

/** @param {HTMLElement} chat */
async function runView(chat) {
  const run = S.runs.find(r => r.id === S.sel); if (!run) { S.sel = null; return welcome(chat); }
  const head = h('div', 'chathead'), hd = h('div', 'row grow'), ac = h('div', 'row'); head.append(hd, ac);
  const st = h('div', 'stream'), col = h('div', 'col'); st.append(col);
  const dock = composer(async text => { await api('runs/' + run.id + '/send', 'POST', { prompt: text, attach: S.draft }); await pollRun(true); await loadRuns(); }, { placeholder: 'Continue a conversa (o agente lembra do que já foi dito)…' });
  dock.stopBtn.onclick = guard(async () => { await api('runs/' + run.id + '/stop', 'POST', {}); await loadRuns(); await pollRun(true); });
  chat.append(head, st, dock); S.view = { head, hd, acts: ac, st, col, dock, id: run.id, drawn: -1, status: '' };
  S.ev[run.id] = { n: 0, list: [] }; await pollRun(true);
}

/** @param {boolean} [force] */
async function pollRun(force) {
  const v = S.view; if (!v || v.id !== S.sel) return; const cache = S.ev[v.id];
  const d = await api('runs/' + v.id + '?since=' + cache.n); cache.list.push(...d.events); cache.n = d.total;
  if (!force && cache.list.length === v.drawn && d.status === v.status) { headInfo(d); return; }
  const perto = v.st.scrollTop + v.st.clientHeight >= v.st.scrollHeight - 80; v.col.replaceChildren(); renderItems(buildModel(cache.list, d.status), v.col);
  v.drawn = cache.list.length; v.status = d.status; headInfo(d); v.dock.set(d.status === 'rodando'); if (perto || force) v.st.scrollTop = v.st.scrollHeight;
}

/** @param {any} d */
function headInfo(d) {
  const v = S.view; v.hd.replaceChildren(); v.hd.append(h('b', '', d.agent.replace('garcom-', '')), statusBadge(d.status), h('span', 'muted small num', money(d.cost) + ' · ' + d.turns + ' turno(s) · ' + (d.session || '—').slice(0, 8)));
  v.acts.replaceChildren(); const run = d.status === 'rodando', pau = d.status === 'pausado';
  const faz = (/** @type {string} */ fn) => async () => {
    await api('runs/' + d.id + '/' + fn, 'POST', {});
    if (fn === 'forget') { S.sel = null; delete S.ev[d.id]; await loadRuns(); S.paintAll(); } else { await loadRuns(); await pollRun(true); }
  };
  acoes(v.acts, [['pause', 'Pausar (congela o processo)', faz('pause'), !run], ['play', 'Continuar', faz('resume'), !pau], ['stop', 'Parar', faz('stop'), !(run || pau), true], ['trash', 'Esquecer conversa', faz('forget'), run || pau]]);
}
