// @ts-check
import { api } from '../api.js';
import { $, h } from '../lib/dom.js';
import { poll } from '../poll.js';
import { S } from '../store.js';
import { go } from '../router.js';
import { button } from '../ui/button.js';
import { statusBadge } from '../ui/obs-common.js';
import { guard, toast } from '../ui/toast.js';

const working = a => ['rodando', 'pausado'].includes(a.status);
const origin = source => ({ orquestrar: 'Orquestrar', conversa: 'Conversa', receita: 'Receita', externo: 'Sessão externa', painel: 'Painel · origem anterior não registrada' }[source] || 'Painel');

/** Agentes, atribuição e controle. Atualiza resumos; não recebe o rastro de ferramentas. */
export async function renderVivo() {
  const main = $('#main'); main.className = 'activity-page'; main.replaceChildren();
  const root = h('div', 'activity-root'); main.append(root);
  let data = null, loading = null, alive = true, sessions = [], sessionVersion = 0;
  const openPrompts = new Set(), pending = new Set();
  const intro = h('div', 'ov-intro'), title = h('div'); title.append(h('span', 'ov-kicker', 'Workspace / agentes'), h('h2', '', 'Ao vivo'), h('p', '', 'Quem está trabalhando, em quê e a pedido de quem.')); intro.append(title); root.append(intro);
  const summary = h('div', 'ov-summary'), tools = h('div', 'activity-tools'), filterLabel = h('label', '', 'Exibir'), filter = h('select');
  [['active', 'Em execução e pausados'], ['all', 'Todos os estados'], ['owned', 'Controláveis pelo painel']].forEach(([value, label]) => filter.append(new Option(label, value))); filterLabel.append(filter);
  const sessionLabel = h('label', '', 'Sessão externa'), session = h('select'); session.append(new Option('Mais recente', '')); sessionLabel.append(session);
  const updated = h('span', 'ov-note'), refreshButton = button('Atualizar', { onClick: guard(async () => { await refresh(); }) }); tools.append(filterLabel, sessionLabel, refreshButton, updated); root.append(summary, tools);
  const notice = h('p', 'activity-notice'); notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
  const panel = h('section', 'activity-surface'), head = h('div', 'activity-head'), list = h('div'); head.append(h('h3', '', 'Agentes'), h('span', 'ov-note', 'Agente / tarefa / acionamento / controle')); panel.append(head, list); root.append(notice, panel, h('p', 'ov-note', 'Pausar mantém o processo para continuar depois. Parar encerra a execução; retomar a tarefa inicia um novo envio com custo. Sessões externas só podem ser observadas. O painel não recebe cada ação de ferramenta nesta tela.'));
  const dialog = h('dialog', 'activity-dialog'), dialogTitle = h('h3'), dialogText = h('p'), dialogActions = h('div', 'ov-actions'); dialogTitle.id = 'activity-dialog-title'; dialog.setAttribute('aria-labelledby', dialogTitle.id); dialog.append(dialogTitle, dialogText, dialogActions); document.body.append(dialog);
  S.timers.push({ remove() { alive = false; if (dialog.open) dialog.close(); dialog.remove(); } });
  function confirm(titleText, text, label, fn) {
    dialogTitle.textContent = titleText; dialogText.textContent = text;
    dialogActions.replaceChildren(button('Cancelar', { onClick: () => dialog.close() }), button(label, { variant: 'danger', onClick: guard(async () => { dialog.close(); await fn(); }) })); dialog.showModal();
  }
  async function control(agent, command) {
    if (pending.has(agent.id)) return; pending.add(agent.id); paint();
    try { await api('runs/' + encodeURIComponent(agent.id) + '/' + command, 'POST', command === 'send' ? { prompt: 'Retome a tarefa anterior a partir do ponto em que parou. Confira o estado atual antes de continuar. Não repita ações já concluídas sem necessidade.', attach: [] } : {}); await refresh(); notice.textContent = command === 'send' ? 'Novo envio iniciado para retomar a tarefa.' : 'Comando enviado. Confira o estado atualizado do agente.'; }
    catch (e) { if (alive) notice.textContent = e instanceof Error ? e.message : String(e); throw e; }
    finally { pending.delete(agent.id); if (alive) paint(); }
  }
  function paint() {
    if (!alive || !root.isConnected || !data) return;
    const agents = data.agents || []; summary.replaceChildren(h('span', '', `${agents.filter(a => a.status === 'rodando').length} em execução`), h('span', '', `${agents.filter(a => a.status === 'pausado').length} pausado(s)`), h('span', '', `${agents.filter(a => a.controllable).length} controláveis pelo painel`));
    if (data.external_error) notice.textContent = data.external_error;
    updated.textContent = 'Última leitura · ' + new Date(data.updated_at).toLocaleTimeString('pt-BR');
    // Não interrompe foco/teclado durante uma atualização periódica.
    if (list.contains(document.activeElement)) return;
    list.replaceChildren(); const shown = agents.filter(a => filter.value === 'all' || filter.value === 'owned' && a.controllable || filter.value === 'active' && working(a));
    if (!shown.length) { list.append(h('p', 'ov-empty', 'Nenhum agente neste filtro.')); return; }
    shown.forEach(a => {
      const row = h('article', 'activity-agent'), identity = h('div'), task = h('div', 'activity-task'), controls = h('div', 'activity-controls');
      identity.append(h('h3', '', a.agent.replace(/^garcom-/, '')), statusBadge(a.status), h('span', 'activity-id', a.id));
      task.append(h('h3', '', a.task || 'Tarefa não registrada'), h('p', 'ov-note', 'Acionado por: ' + (a.triggered_by || 'Não registrado') + ' · ' + origin(a.source)));
      if (a.session) task.append(h('span', 'activity-id', 'Sessão ' + a.session));
      const prompt = h('details'), promptTitle = h('summary', '', 'Ver prompt recebido'); prompt.open = openPrompts.has(a.id); prompt.ontoggle = () => { prompt.open ? openPrompts.add(a.id) : openPrompts.delete(a.id); }; prompt.append(promptTitle, h('pre', 'activity-prompt', a.prompt || 'O registro desta execução não forneceu o prompt.')); task.append(prompt);
      const add = (label, command, danger = false) => { const b = button(label, { small: true, variant: danger ? 'danger' : 'secondary', onClick: guard(async () => { if (command === 'stop') confirm('Parar ' + a.agent + '?', 'Isso encerra o processo. Continuar depois exige um novo envio usando a sessão anterior.', 'Parar execução', () => control(a, command)); else if (command === 'send') confirm('Retomar tarefa', `Um novo envio será iniciado na sessão anterior, com teto de US$ ${Number(a.budget || 0.5).toFixed(2)} e consumo de tokens.`, 'Retomar tarefa', () => control(a, command)); else await control(a, command); }) }); b.disabled = pending.has(a.id); controls.append(b); };
      if (a.controllable) { if (a.status === 'rodando' && a.can_pause) add('Pausar', 'pause'); if (a.status === 'pausado' && a.can_resume) add('Continuar', 'resume'); if (working(a)) add('Parar', 'stop', true); if (!a.can_pause && a.status === 'rodando') controls.append(h('p', 'ov-note', 'Pausa indisponível neste sistema.')); }
      else if (a.resumable) add('Retomar tarefa', 'send');
      else controls.append(h('p', 'ov-note', a.source === 'externo' ? 'Sem controle do processo externo.' : 'Sem processo ativo ou sessão para retomar.'));
      if (a.source !== 'externo') controls.append(button('Abrir conversa', { small: true, onClick: () => { S.sel = a.id; S.selTeam = null; go('conversa'); } }));
      row.append(identity, task, controls); list.append(row);
    });
  }
  async function fetchData() {
    const version = sessionVersion;
    try { const result = await api('agent-activity' + (session.value ? '?session=' + encodeURIComponent(session.value) : '')); if (!alive || !root.isConnected || version !== sessionVersion) return; data = result; notice.textContent = ''; paint(); }
    catch (e) { if (alive) { notice.textContent = 'Não foi possível atualizar os agentes. Os estados exibidos podem estar desatualizados.'; if (!data) list.replaceChildren(h('p', 'ov-empty', 'Dados indisponíveis. Use Atualizar para tentar novamente.')); } throw e; }
  }
  function refresh() { if (!loading) loading = fetchData().finally(() => { loading = null; }); return loading; }
  filter.onchange = paint;
  session.onchange = guard(async () => { sessionVersion++; if (loading) await loading.catch(() => {}); await refresh(); });
  try { sessions = await api('sessions'); if (!alive) return; sessions.filter(s => !s.panel).forEach(s => session.append(new Option(s.title.slice(0, 50) + ' · ' + s.mtime, s.id))); } catch (e) { toast('Lista de sessões externas indisponível; consultando a mais recente.', true); }
  await guard(refresh)(); if (alive) S.timers.push(poll(refresh, 6000));
}
