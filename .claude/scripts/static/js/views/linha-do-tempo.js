// @ts-check
import { api, isAbort } from '../api.js';
import { $, h } from '../lib/dom.js';
import { fmtDur } from '../lib/format.js';
import { go } from '../router.js';
import { S } from '../store.js';
import { button } from '../ui/button.js';

const MIN_SPAN = 60;
const finite = value => Number.isFinite(Number(value));
const time = seconds => new Date(seconds * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const clock = seconds => new Date(seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Normalização sem inventar vínculos entre agentes, commits e verificações. */
export function timelineEvents(data, includePanel) {
  const sessions = (data.sessions || []).filter(s => includePanel || (!s.panel && !(s.end - s.start < 30 && !s.agents))).map(s => ({ id: 'session:' + s.id, kind: 'session', start: s.start, end: s.end, name: s.title, who: `${s.agents} subagente(s) · ${s.panel ? 'sessão do painel' : 'sessão interativa'}`, detail: 'Registros da sessão, incluindo pausas entre atividades.', raw: s }));
  const runs = (data.runs || []).map(r => ({ id: 'run:' + r.id, kind: 'agent', start: r.start, end: r.end, name: r.agent.replace(/^garcom-/, '') + ' · ' + (r.title || 'Execução sem título'), who: `${r.status} · US$ ${Number(r.cost || 0).toFixed(3)}`, detail: r.team ? 'Execução vinculada a uma equipe do painel.' : 'Execução iniciada pelo painel.', raw: r }));
  const commits = (data.commits || []).map(c => ({ id: 'commit:' + c.sha, kind: 'commit', start: c.t, end: c.t, name: c.subject, who: `${c.short} · +${c.add} / −${c.del}`, detail: 'O horário não estabelece, sozinho, relação com uma execução ou verificação.', raw: c }));
  const checks = (data.checks || []).map((c, i) => ({ id: 'check:' + c.t + ':' + c.name + ':' + i, kind: 'check', start: c.t, end: c.t, name: c.name, who: c.ok ? 'Verificação passou' : 'Verificação falhou', detail: c.summary || 'Sem resumo registrado.', raw: c }));
  return [...sessions, ...runs, ...commits, ...checks].filter(e => finite(e.start) && finite(e.end) && e.end >= e.start).sort((a, b) => a.start - b.start);
}

/** Empilha apenas os eventos que colidem visualmente, sem mudar suas durações. */
export function timelineRows(events, minSeconds) {
  const ends = [];
  return events.slice().sort((a, b) => a.start - b.start).map(e => { let row = ends.findIndex(end => end <= e.start); if (row < 0) row = ends.length; ends[row] = Math.max(e.end, e.start + minSeconds); return { ...e, row }; });
}

export async function renderTempo() {
  const main = $('#main'); main.className = 'timeline-page'; main.replaceChildren();
  const root = h('div', 'timeline-root'); main.append(root);
  let data = null, events = [], full = [0, MIN_SPAN], win = [...full], selected = '', mode = 'chart', version = 0, alive = true, drag = null, frame = 0;
  const intro = h('div', 'ov-intro'), title = h('div'); title.append(h('span', 'ov-kicker', 'Workspace / histórico'), h('h2', '', 'Linha do tempo'), h('p', '', 'Sessões, agentes e entregas na mesma escala.')); intro.append(title); root.append(intro);
  const shell = h('div', 'chronos'), toolbar = h('div', 'chronos-toolbar'), leftTools = h('div', 'chronos-tools'), rightTools = h('div', 'chronos-tools'); toolbar.append(leftTools, rightTools); root.append(shell); shell.append(toolbar);
  const period = h('select', 'chronos-select'); period.setAttribute('aria-label', 'Período'); [[0, 'Ajustar aos dados'], [1, 'Últimas 24 horas'], [3, '3 dias'], [7, '7 dias'], [30, '30 dias']].forEach(([v, l]) => period.append(new Option(String(l), String(v)))); period.value = String(S.days || 0);
  const filter = h('select', 'chronos-select'); filter.setAttribute('aria-label', 'Tipo de evento'); [['all', 'Todos os eventos'], ['session', 'Sessões'], ['agent', 'Agentes'], ['commit', 'Commits'], ['check', 'Verificações']].forEach(([v, l]) => filter.append(new Option(l, v)));
  const previous = button('←', { small: true, title: 'Janela anterior' }), next = button('→', { small: true, title: 'Próxima janela' }), out = button('−', { small: true, title: 'Afastar' }), inside = button('+', { small: true, title: 'Aproximar' }), fit = button('Período inteiro', { small: true }), view = button('Ver histórico', { small: true }), refresh = button('Atualizar', { small: true, onClick: () => load() }); leftTools.append(period, filter, previous, next); rightTools.append(out, inside, fit, view, refresh);
  const panelLabel = h('label', 'check'), panelCheck = h('input'); panelCheck.type = 'checkbox'; panelCheck.checked = !!S.showPanel; panelLabel.append(panelCheck, document.createTextNode('Incluir sessões do painel e muito curtas')); shell.append(panelLabel);
  const surface = h('section', 'timeline-surface'), top = h('div', 'chronos-title'), heading = h('h3', '', 'Trabalho no projeto'), readout = h('span', 'chronos-readout'); top.append(heading, readout); surface.append(top);
  const legend = h('div', 'chronos-legend'); [['', 'Sessões'], ['agent', 'Agentes'], ['commit', 'Commit'], ['pass', 'Verificação passou'], ['fail', 'Verificação falhou']].forEach(([cls, label]) => { const key = h('span'); key.append(h('i', cls), document.createTextNode(label)); legend.append(key); }); surface.append(legend);
  const stage = h('div'), miniTitle = h('div', 'chronos-mini-title'), spanLabel = h('span'), mini = h('div', 'chronos-mini'), miniMarks = h('div'), brush = h('div', 'chronos-brush'), details = h('div', 'chronos-details');
  miniTitle.append(h('span', '', 'Visão do período · arraste para navegar'), spanLabel); mini.setAttribute('role', 'slider'); mini.tabIndex = 0; mini.setAttribute('aria-label', 'Início da janela temporal'); mini.append(miniMarks, brush); details.setAttribute('role', 'region'); details.setAttribute('aria-label', 'Evento selecionado'); surface.append(stage, miniTitle, mini, details); shell.append(surface, h('p', 'chronos-footer', 'Selecione uma faixa ou marcador para inspecionar. Proximidade no horário não prova relação causal entre agente, commit e verificação. Ctrl + roda aproxima; setas movem a janela.'));
  const status = h('p', 'chronos-controls-note'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); shell.append(status);
  const span = () => win[1] - win[0], x = seconds => (seconds - win[0]) / span() * 100;
  function setWindow(a, b) { const size = Math.min(full[1] - full[0], Math.max(MIN_SPAN, b - a)); const start = Math.max(full[0], Math.min(full[1] - size, a)); win = [start, start + size]; draw(); }
  function zoom(factor, fraction = 0.5) { const size = Math.min(full[1] - full[0], Math.max(MIN_SPAN, span() * factor)); const center = win[0] + fraction * span(); setWindow(center - fraction * size, center + (1 - fraction) * size); }
  function choose(event) { selected = event.id; draw(); status.textContent = 'Selecionado: ' + event.name + ' · ' + time(event.start); }
  function open(event) {
    if (event.kind === 'session') { S.anSession = event.raw.id; go('analise'); }
    else if (event.kind === 'agent') { if (event.raw.team) { S.selTeam = event.raw.team; S.sel = null; } else { S.sel = event.raw.id; S.selTeam = null; } go('conversa'); }
    else if (event.kind === 'commit') { S.commitSel = event.raw.sha; go('commits'); }
    else go('verificar');
  }
  function paintDetails() {
    details.replaceChildren(); const event = events.find(e => e.id === selected); if (!event) { details.append(h('p', 'ov-note', 'Selecione um evento para ver os detalhes.')); return; }
    const copy = h('div'), labels = { session: 'Sessão', agent: 'Agente', commit: 'Commit', check: 'Verificação' }; copy.append(h('span', 'chronos-kicker', labels[event.kind]), h('h3', '', event.name), h('p', '', event.who), h('p', '', event.detail), h('div', 'chronos-time', time(event.start) + (event.end > event.start ? ' — ' + time(event.end) + ' · ' + fmtDur((event.end - event.start) * 1000) : '')));
    const actions = h('div', 'ov-actions'); actions.append(button({ session: 'Analisar sessão', agent: 'Abrir conversa', commit: 'Abrir commit', check: 'Abrir verificações' }[event.kind], { small: true, onClick: () => open(event) })); details.append(copy, actions);
  }
  function draw() {
    if (!alive || !root.isConnected || !data) return;
    const focus = stage.contains(document.activeElement); stage.replaceChildren(); const total = full[1] - full[0];
    readout.textContent = time(win[0]) + ' — ' + time(win[1]); spanLabel.textContent = fmtDur(span() * 1000) + ' visíveis'; inside.disabled = span() <= MIN_SPAN; out.disabled = fit.disabled = span() >= total; previous.disabled = win[0] <= full[0]; next.disabled = win[1] >= full[1]; view.textContent = mode === 'chart' ? 'Ver histórico' : 'Ver gráfico';
    brush.style.left = (win[0] - full[0]) / total * 100 + '%'; brush.style.width = span() / total * 100 + '%'; mini.setAttribute('aria-valuemin', String(full[0])); mini.setAttribute('aria-valuemax', String(full[1] - span())); mini.setAttribute('aria-valuenow', String(win[0])); mini.setAttribute('aria-valuetext', time(win[0]) + ' a ' + time(win[1]));
    const visible = events.filter(e => (filter.value === 'all' || e.kind === filter.value) && e.end >= win[0] && e.start <= win[1]);
    if (mode === 'list') { visible.slice().sort((a, b) => b.start - a.start).forEach(e => { const row = h('div', 'chronos-listitem'), copy = h('div'); copy.append(h('strong', '', e.name), h('p', '', e.who)); row.append(h('span', 'chronos-time', time(e.start)), copy, button('Inspecionar', { small: true, onClick: () => choose(e) })); stage.append(row); }); if (!visible.length) stage.append(h('p', 'ov-empty', 'Nenhum evento nesta janela e filtro.')); paintDetails(); return; }
    const chart = h('div', 'chronos-chart'), axis = h('div', 'chronos-axis'), grid = h('div', 'chronos-grid'); chart.tabIndex = 0; chart.setAttribute('aria-label', 'Linha do tempo. Setas movem, + e − aproximam, 0 mostra todo o período.'); chart.append(axis, grid);
    const narrow = main.clientWidth < 700, width = Math.max(180, main.clientWidth - (narrow ? 60 : 210)), ticks = width < 500 ? 3 : 5;
    for (let i = 0; i <= ticks; i++) { const seconds = win[0] + i * span() / ticks, tick = h('span', 'chronos-tick', span() > 86400 ? new Date(seconds * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : clock(seconds)); tick.style.left = i / ticks * 100 + '%'; axis.append(tick); const line = h('i'); line.style.left = i / ticks * 100 + '%'; grid.append(line); }
    [['session', 'Sessões', 'Contexto do trabalho'], ['agent', 'Agentes', 'Execuções e sobreposições'], ['commit', 'Commits', 'Mudanças registradas'], ['check', 'Verificações', 'Resultados observados']].filter(([kind]) => filter.value === 'all' || filter.value === kind).forEach(([kind, name, description]) => {
      const lane = h('div', 'chronos-lane'), label = h('span', 'chronos-lane-label', name); label.append(h('small', '', description)); lane.append(label);
      const laneEvents = timelineRows(visible.filter(e => e.kind === kind), (kind === 'commit' || kind === 'check' ? 30 : 8) / width * span()), count = Math.max(1, ...laneEvents.map(e => e.row + 1)), offset = narrow ? 30 : 0; lane.style.height = Math.max(82, count * 44 + 36) + offset + 'px';
      laneEvents.forEach(e => { if (e.end > e.start) { const bar = h('button', 'chronos-bar ' + (kind === 'agent' ? 'agent' : '') + (selected === e.id ? ' selected' : '')); bar.type = 'button'; const left = Math.max(0, x(e.start)), right = Math.min(100, x(e.end)); bar.style.left = left + '%'; bar.style.width = Math.max(0, right - left) + '%'; bar.style.top = offset + 18 + e.row * 44 + 'px'; bar.append(h('span', '', e.name)); bar.setAttribute('aria-label', e.name + ' · ' + time(e.start) + ' a ' + time(e.end)); bar.setAttribute('aria-pressed', String(selected === e.id)); bar.onclick = () => choose(e); lane.append(bar); }
        else { const point = h('button', 'chronos-point ' + (kind === 'check' ? e.raw.ok ? 'pass' : 'fail' : '') + (selected === e.id ? ' selected' : '')); point.type = 'button'; point.style.left = x(e.start) + '%'; point.style.top = offset + 20 + e.row * 44 + 'px'; point.setAttribute('aria-label', e.name + ' · ' + time(e.start) + ' · ' + e.who); point.setAttribute('aria-pressed', String(selected === e.id)); if (kind === 'check') point.append(h('em', '', e.raw.ok ? '✓' : '×')); point.onclick = () => choose(e); lane.append(point); }
      }); if (!laneEvents.length) { const empty = h('span', 'chronos-empty', 'Sem eventos nesta janela'); empty.style.top = offset + 24 + 'px'; lane.append(empty); } chart.append(lane);
    });
    const cursor = h('div', 'chronos-cursor'); chart.append(cursor); chart.onpointermove = e => { if (e.pointerType === 'touch') return; const rect = chart.getBoundingClientRect(), fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)); cursor.style.left = fraction * 100 + '%'; cursor.style.display = 'block'; readout.textContent = clock(win[0] + fraction * span()) + ' · ' + time(win[0]) + ' — ' + time(win[1]); }; chart.onpointerleave = () => { cursor.style.display = 'none'; readout.textContent = time(win[0]) + ' — ' + time(win[1]); };
    chart.onkeydown = e => { if (e.target !== chart) return; if (['ArrowLeft', 'ArrowRight', '+', '=', '-', '0'].includes(e.key)) e.preventDefault(); if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const shift = span() * 0.2 * (e.key === 'ArrowLeft' ? -1 : 1); setWindow(win[0] + shift, win[1] + shift); } else if (e.key === '+' || e.key === '=') zoom(.6); else if (e.key === '-') zoom(1.6); else if (e.key === '0') setWindow(full[0], full[1]); };
    chart.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); const rect = chart.getBoundingClientRect(); zoom(e.deltaY < 0 ? .8 : 1.25, Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))); }, { passive: false });
    stage.append(chart); if (focus) chart.focus(); paintDetails();
  }
  function reset() {
    events = timelineEvents(data, panelCheck.checked); const earliest = events.length ? Math.min(...events.map(e => e.start)) : data.t1 - 3 * 3600, start = Number(period.value) ? data.t0 : Math.max(data.t0, earliest - 120);
    full = [start, Math.max(data.t1, start + MIN_SPAN)]; win = [...full]; if (!events.some(e => e.id === selected)) selected = events.at(-1)?.id || '';
    miniMarks.replaceChildren(); const total = full[1] - full[0]; events.filter(e => e.end > e.start).forEach((e, i) => { const mark = h('i', 'chronos-mini-event ' + (e.kind === 'agent' ? 'agent' : '')); mark.style.left = Math.max(0, (e.start - full[0]) / total * 100) + '%'; mark.style.width = Math.max(.1, (e.end - Math.max(e.start, full[0])) / total * 100) + '%'; mark.style.top = (e.kind === 'session' ? 9 : 23 + i % 2 * 7) + 'px'; miniMarks.append(mark); }); draw();
  }
  async function load() { const current = ++version; refresh.disabled = true; status.textContent = 'Carregando histórico…';
    try { const result = await api('timeline?days=' + (Number(period.value) || 30)); if (!alive || !root.isConnected || current !== version) return; data = result; S.days = Number(period.value); S.showPanel = panelCheck.checked; reset(); status.textContent = events.length + ' evento(s) disponíveis · sem atualização automática.'; }
    catch (e) { if (alive && current === version && !isAbort(e)) { status.textContent = 'Não foi possível atualizar o histórico. Use Atualizar para tentar novamente.'; if (!data) stage.replaceChildren(h('p', 'ov-empty', 'Histórico indisponível.')); } }
    finally { if (alive && current === version) refresh.disabled = false; }
  }
  previous.onclick = () => { const shift = span() * .4; setWindow(win[0] - shift, win[1] - shift); }; next.onclick = () => { const shift = span() * .4; setWindow(win[0] + shift, win[1] + shift); }; out.onclick = () => zoom(1.6); inside.onclick = () => zoom(.6); fit.onclick = () => setWindow(full[0], full[1]); view.onclick = () => { mode = mode === 'chart' ? 'list' : 'chart'; draw(); }; filter.onchange = draw; period.onchange = load; panelCheck.onchange = () => { S.showPanel = panelCheck.checked; if (data) reset(); };
  mini.onpointerdown = e => { if (!data || e.button !== 0) return; const box = mini.getBoundingClientRect(); drag = { x: e.clientX, start: win[0], size: span(), width: box.width }; mini.setPointerCapture(e.pointerId); const at = full[0] + (e.clientX - box.left) / box.width * (full[1] - full[0]); if (at < win[0] || at > win[1]) { setWindow(at - drag.size / 2, at + drag.size / 2); drag.start = win[0]; } };
  mini.onpointermove = e => { if (!drag) return; const start = drag.start + (e.clientX - drag.x) / drag.width * (full[1] - full[0]); setWindow(start, start + drag.size); }; mini.onpointerup = mini.onpointercancel = () => { drag = null; }; mini.onkeydown = e => { if (!data) return; if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const shift = span() * .15 * (e.key === 'ArrowLeft' ? -1 : 1); setWindow(win[0] + shift, win[1] + shift); } };
  let pan = null;
  stage.onpointerdown = e => { if (!data || e.button !== 0 || !(e.target instanceof Element) || e.target.closest('button') || !e.target.closest('.chronos-chart')) return; const chart = stage.querySelector('.chronos-chart'); if (!chart) return; pan = { x: e.clientX, start: win[0], end: win[1], perPixel: span() / chart.getBoundingClientRect().width }; stage.setPointerCapture(e.pointerId); };
  stage.onpointermove = e => { if (!pan) return; const shift = (pan.x - e.clientX) * pan.perPixel; setWindow(pan.start + shift, pan.end + shift); };
  stage.onpointerup = stage.onpointercancel = () => { pan = null; };
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); }); observer?.observe(main);
  S.timers.push({ remove() { alive = false; version++; observer?.disconnect(); cancelAnimationFrame(frame); drag = null; } }); await load();
}
