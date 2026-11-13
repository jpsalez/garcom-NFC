// @ts-check
import { api } from '../api.js';
import { $, h } from '../lib/dom.js';
import { watch } from '../lib/realtime.js';
import { S } from '../store.js';
import { go } from '../router.js';
import { button } from '../ui/button.js';
import { md } from '../ui/markdown.js';
import { buildModel, renderItems } from '../ui/obs-trace.js';
import { money, statusBadge } from '../ui/obs-common.js';
import { guard, toast } from '../ui/toast.js';

const active = r => ['rodando', 'pausado'].includes(r.status);
const name = agent => agent.replace(/^garcom-/, '');

/** Discussão explícita: só executa agentes após uma ação do usuário. */
export async function renderOrquestrar() {
  const main = $('#main'); main.className = 'discussion-page'; main.replaceChildren();
  const root = h('div', 'discussion-root'); main.append(root);
  const catalog = S.cat?.agents?.length ? S.cat : await api('catalog');
  if (!root.isConnected) return;
  const selected = new Set(), cache = new Map();
  let teams = [], team = null, busy = false, pending = [], request = '', synthesisPending = null, refreshing = null;
  const intro = h('div', 'ov-intro'), heading = h('div'); heading.append(h('span', 'ov-kicker', 'Workspace / discussão'), h('h2', '', 'Orquestrar'), h('p', '', 'Discuta uma decisão com os agentes do projeto.'));
  const utilities = h('div', 'ov-actions'); utilities.append(button('Nova discussão', { onClick: () => { if (busy) return; S.discussionTeam = null; team = null; pending = []; topic.value = ''; message.value = ''; summary.value = ''; synthesisPending = null; paint(); } }), button('Receitas e execuções', { small: true, onClick: guard(async () => { if (busy) return; const { renderRecipes } = await import('./receitas.js'); if (root.isConnected) { root.remove(); await renderRecipes(); } }) })); intro.append(heading, utilities); root.append(intro);
  const layout = h('div', 'discussion-layout'), sidebar = h('aside', 'discussion-sidebar'), content = h('div', 'discussion-content'); layout.append(sidebar, content); root.append(layout);
  const members = h('section', 'discussion-surface'), choices = h('div', 'discussion-choices'); members.append(h('h3', '', 'Participantes'), h('p', 'ov-note', 'Escolha de 1 a 3 agentes. Todos os agentes cadastrados estão disponíveis.'), choices); sidebar.append(members);
  const budgetLabel = h('label', 'discussion-field', 'Teto por agente / envio (US$)'), budget = h('input'); budget.type = 'number'; budget.min = '0.1'; budget.max = '3'; budget.step = '0.1'; budget.required = true; budget.value = '0.5'; budgetLabel.append(budget);
  const cost = h('p', 'ov-note'), controls = h('section', 'discussion-surface'); controls.append(budgetLabel, cost, h('p', 'ov-note', 'Sem rodadas automáticas. Compartilhar respostas e solicitar síntese também consome tokens.')); sidebar.append(controls);
  const history = h('section', 'discussion-surface'); history.append(h('h3', '', 'Discussões anteriores')); const historyList = h('div'); history.append(historyList); sidebar.append(history);
  const stream = h('section', 'discussion-surface'), streamHead = h('div', 'discussion-stream-head'), streamTitle = h('h3', '', 'Nova discussão'), status = h('span'), output = h('div', 'discussion-output'); streamHead.append(streamTitle, status); stream.append(streamHead, output); content.append(stream);
  const form = h('form', 'discussion-surface discussion-form'), topicLabel = h('label', 'discussion-field', 'Assunto e resultado esperado'), topic = h('textarea'); topic.rows = 3; topic.placeholder = 'Apresente a decisão, as alternativas e as restrições.'; topicLabel.append(topic);
  const targetLabel = h('label', 'discussion-field', 'Enviar para'), target = h('select'); targetLabel.append(target);
  const messageLabel = h('label', 'discussion-field', 'Continuar discussão'), message = h('textarea'); message.rows = 3; message.placeholder = 'Faça uma pergunta ou peça contrapontos.'; messageLabel.append(message);
  const shareLabel = h('label', 'check'), share = h('input'); share.type = 'checkbox'; share.checked = true; shareLabel.append(share, document.createTextNode('Compartilhar respostas anteriores nesta rodada'));
  const send = button('Iniciar discussão', { variant: 'primary' }), note = h('p', 'ov-note'); note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite'); form.append(topicLabel, targetLabel, messageLabel, shareLabel, note, send); content.append(form);
  const synthesis = h('section', 'discussion-surface'), synthesisAgentLabel = h('label', 'discussion-field', 'Agente para elaborar a síntese'), synthesisAgent = h('select'); synthesisAgentLabel.append(synthesisAgent);
  const summarize = button('Solicitar síntese ao agente', { onClick: guard(async () => { const run = team?.runs.find(r => r.id === synthesisAgent.value); if (!run || busy || team.runs.some(active)) return; synthesisPending = { id: run.id, since: cache.get(run.id)?.n || 0 }; try { await sendTo([run], 'Elabore uma síntese desta discussão: pontos de acordo, divergências, riscos e proposta de decisão. Não presuma consenso. Não altere arquivos.', true); } catch (e) { synthesisPending = null; throw e; } }) });
  const summaryLabel = h('label', 'discussion-field', 'Síntese / decisão para sua revisão'), summary = h('textarea'); summary.rows = 7; summaryLabel.append(summary);
  const summaryActions = h('div', 'ov-actions'); summaryActions.append(summarize, button('Copiar', { onClick: guard(async () => { await navigator.clipboard.writeText(summary.value); toast('Texto copiado'); }) }), button('Registrar decisão aprovada', { onClick: guard(async e => { if (!summary.value.trim() || !team) return; const b = e.currentTarget; b.disabled = true; try { const current = await api('decisions'); const text = current.text + '\n\n## Discussão: ' + team.task.replace(/[\r\n]/g, ' ') + '\n\n' + summary.value.trim() + '\n'; await api('decisions', 'PUT', { text }); toast('Decisão registrada'); } finally { b.disabled = false; } }) }));
  synthesis.append(h('h3', '', 'Síntese e decisão'), h('p', 'ov-note', 'A síntese complementa as respostas individuais. Solicitar ao agente inicia um envio pago; registrar sua revisão salva em Decisões.'), synthesisAgentLabel, summaryActions, summaryLabel); content.append(synthesis);
  function updateCost() { const count = team ? (target.value === 'all' ? team.runs.length : 1) : selected.size; cost.textContent = `${count} participante(s) · teto deste envio ${money(count * Number(budget.value || 0))}`; }
  function paintChoices() {
    choices.replaceChildren();
    catalog.agents.forEach(a => { const row = h('label', 'discussion-member'), cb = h('input'), text = h('span'); cb.type = 'checkbox'; cb.checked = team ? team.runs.some(r => r.agent === a.name) : selected.has(a.name); cb.disabled = busy || !!team || (!cb.checked && selected.size >= 3); cb.onchange = () => { cb.checked ? selected.add(a.name) : selected.delete(a.name); paintChoices(); updateCost(); }; text.append(h('strong', '', name(a.name)), h('small', '', a.description || a.model || 'Agente do projeto')); row.append(cb, text); choices.append(row); });
  }
  function paint() {
    paintChoices(); updateCost(); topicLabel.hidden = !!team; topic.required = !team; topic.disabled = busy; targetLabel.hidden = !team; messageLabel.hidden = !team; shareLabel.hidden = !team; message.required = !!team; synthesis.hidden = !team; budget.disabled = !!team || busy;
    const oldTarget = target.value, oldAgent = synthesisAgent.value; target.replaceChildren(new Option('Todos os participantes', 'all')); synthesisAgent.replaceChildren();
    if (team) { budget.value = String(team.runs[0]?.budget || 0.5); team.runs.forEach(r => { target.append(new Option(name(r.agent), r.id)); synthesisAgent.append(new Option(name(r.agent), r.id)); }); if (team.runs.some(r => r.id === oldTarget)) target.value = oldTarget; else target.value = 'all'; if (team.runs.some(r => r.id === oldAgent)) synthesisAgent.value = oldAgent; }
    send.textContent = team ? (pending.length ? 'Tentar novamente nos agentes que falharam' : 'Enviar nova rodada') : 'Iniciar discussão'; send.disabled = busy || !!team?.runs.some(active); summarize.disabled = busy || !team || team.runs.some(active); message.disabled = busy; target.disabled = busy; streamTitle.textContent = team?.task || 'Nova discussão'; status.replaceChildren(); if (team) status.append(statusBadge(team.status)); updateCost(); paintOutput();
    historyList.replaceChildren(); teams.forEach(t => { const b = button(t.task || 'Discussão sem título', { small: true, onClick: guard(async () => { if (busy) return; S.discussionTeam = t.id; team = t; pending = []; message.value = ''; summary.value = ''; synthesisPending = null; await refresh(); }) }); b.setAttribute('aria-pressed', String(t.id === team?.id)); historyList.append(b); });
  }
  function paintOutput() {
    const focused = output.contains(document.activeElement), scroll = window.scrollY; if (focused) return;
    output.replaceChildren(); if (!team) { output.append(h('p', 'ov-empty', 'Selecione os participantes e apresente o assunto. As respostas reais de cada agente aparecerão aqui.')); return; }
    team.runs.forEach(r => { const card = h('article', 'discussion-answer'), head = h('div', 'discussion-stream-head'); head.append(h('h3', '', name(r.agent)), statusBadge(r.status)); card.append(head);
      const events = cache.get(r.id)?.list || [], model = buildModel(events, r.status), answers = model.filter(x => x.type === 'text' && !x.e.parent);
      events.filter(e => e.k === 'user').forEach((e, index) => { const turn = h('div', 'discussion-turn'); turn.append(h('span', 'ov-label', 'Envio ' + (index + 1)), h('p', 'discussion-question-text', e.text.split('\n\n[Contexto compartilhado')[0])); const nextUser = events.indexOf(e) + 1, end = events.findIndex((x, i) => i >= nextUser && x.k === 'user'); const texts = events.slice(nextUser, end < 0 ? events.length : end).filter(x => x.k === 'text' && !x.parent); texts.forEach(x => { const body = h('div', 'discussion-response'); body.append(md(x.text)); turn.append(body); }); card.append(turn); });
      if (!answers.length) card.append(h('p', 'ov-note', active(r) ? 'Aguardando resposta do agente…' : 'Nenhuma resposta de texto disponível.'));
      const errors = events.filter(e => e.k === 'err'); errors.forEach(e => card.append(h('p', 'err-t', e.text)));
      const details = h('details'), label = h('summary', '', 'Ferramentas e detalhes da execução'), trace = h('div'); details.append(label, trace); renderItems(model.filter(x => !['text', 'user'].includes(x.type)), trace); card.append(details);
      const actions = h('div', 'ov-actions'); actions.append(button('Perguntar a ' + name(r.agent), { small: true, onClick: () => { target.value = r.id; message.focus(); updateCost(); } }), button('Pedir contraponto ao grupo', { small: true, onClick: () => { target.value = 'all'; share.checked = true; message.value = 'Avaliem os riscos e contrapontos da proposta de ' + name(r.agent) + '.'; message.focus(); updateCost(); } }), button('Abrir em Conversa', { small: true, onClick: () => { S.sel = r.id; S.selTeam = null; go('conversa'); } }));
      if (active(r)) actions.append(button(r.status === 'pausado' ? 'Continuar' : 'Pausar', { small: true, onClick: guard(async () => { await api('runs/' + r.id + (r.status === 'pausado' ? '/resume' : '/pause'), 'POST', {}); await refresh(); }) }), button('Parar', { variant: 'danger', small: true, onClick: guard(async () => { await api('runs/' + r.id + '/stop', 'POST', {}); await refresh(); }) })); card.append(actions); output.append(card);
    });
    if (window.scrollY !== scroll) window.scrollTo({ top: scroll, behavior: 'instant' });
  }
  function sharedContext() { return team.runs.map(r => { const answer = (cache.get(r.id)?.list || []).filter(e => e.k === 'text' && !e.parent).map(e => e.text).join('\n'); return '## ' + r.agent + '\n' + answer.slice(-8000); }).join('\n\n'); }
  async function sendTo(runs, text, includeContext) {
    if (!team || busy) return; busy = true; paint(); const context = includeContext ? sharedContext() : '', failed = [];
    for (const r of runs) { try { await api('runs/' + r.id + '/send', 'POST', { prompt: text + (context ? '\n\n[Contexto compartilhado — até 8000 caracteres por participante]\n' + context : ''), attach: [] }); } catch (e) { failed.push(r.id); } }
    pending = failed; request = text; busy = false; await refresh();
    if (failed.length) { note.textContent = 'Não enviados: ' + failed.map(id => name(team.runs.find(r => r.id === id).agent)).join(', ') + '. Tentar novamente reenviará apenas para eles.'; throw new Error(note.textContent); }
    message.value = ''; note.textContent = 'Envio realizado. Aguarde as respostas antes de continuar.';
  }
  function refresh() { if (!refreshing) refreshing = refreshRaw().finally(() => { refreshing = null; }); return refreshing; }
  async function refreshRaw() {
    if (!root.isConnected) return;
    teams = await api('teams'); if (!root.isConnected) return;
    team = teams.find(t => t.id === S.discussionTeam) || null;
    if (team) { await Promise.all(team.runs.map(async r => { const cached = cache.get(r.id) || { n: 0, list: [] }; const next = await api('runs/' + r.id + '?since=' + cached.n); cached.list.push(...next.events); cached.n = next.total; cache.set(r.id, cached); })); }
    if (!root.isConnected) return;
    if (synthesisPending && team && !team.runs.some(active)) { const last = (cache.get(synthesisPending.id)?.list || []).slice(synthesisPending.since).filter(e => e.k === 'text' && !e.parent).pop(); if (last && !summary.value.trim()) summary.value = last.text; synthesisPending = null; }
    paint();
  }
  form.onsubmit = guard(async e => { e.preventDefault(); if (busy || !form.reportValidity() || !budget.reportValidity()) return;
    if (!team) { if (!selected.size) { toast('Selecione pelo menos um agente.', true); return; } if (!topic.value.trim()) return; busy = true; paint(); try { const t = await api('teams', 'POST', { source: 'orquestrar', task: topic.value.trim(), budget: Number(budget.value), items: [...selected].map(agent => ({ agent, prompt: 'Discussão com especialistas. Analise o assunto, apresente alternativas e contrapontos, explicite incertezas e não altere arquivos.\n\n' + topic.value.trim() })) }); S.discussionTeam = t.id; await refresh(); } finally { busy = false; paint(); } }
    else { const text = message.value.trim(); if (!text) return; const runs = pending.length && request === text ? team.runs.filter(r => pending.includes(r.id)) : team.runs.filter(r => target.value === 'all' || r.id === target.value); await sendTo(runs, text, share.checked); }
  });
  send.onclick = e => { form.requestSubmit(); }; budget.oninput = updateCost; target.onchange = () => { pending = []; updateCost(); }; message.oninput = () => { if (message.value !== request) pending = []; };
  await refresh(); S.timers.push(watch(['runs'], refresh, 6000));
}
