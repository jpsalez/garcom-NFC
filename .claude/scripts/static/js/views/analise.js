// @ts-check
import { api, isAbort } from '../api.js';
import { $, h } from '../lib/dom.js';
import { fmtDur, fmtN } from '../lib/format.js';
import { S } from '../store.js';
import { badge } from '../ui/badge.js';
import { button } from '../ui/button.js';
import { table } from '../ui/table.js';

const TONE = { alta: 'err', media: 'warn', baixa: 'neutral', ok: 'ok' };
const severity = { alta: 0, media: 1, baixa: 2, ok: 3 };
const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const tokens = agent => num(agent.usage?.in) + num(agent.usage?.out) + num(agent.usage?.cache_w);
const nextStep = finding => {
  const text = finding.title.toLowerCase();
  if (/repetid|lidos|contexto/.test(text)) return 'Confira o contexto necessário a cada participante antes de reenviar a tarefa.';
  if (/erro/.test(text)) return 'Revise a causa dos erros antes de repetir a execução.';
  if (/paralelismo|lote/.test(text)) return 'Confira quais trabalhos precisavam ocorrer em paralelo.';
  if (/briefing|longos|trivia/.test(text)) return 'Revise o escopo e o pedido de cada agente.';
  return 'Confira os detalhes e o resultado da sessão antes de mudar o fluxo.';
};

/** Métricas carregadas por solicitação. Sem chamadas a modelos e sem polling. */
export async function renderAnalise() {
  const main = $('#main'); main.className = 'analysis-page'; main.replaceChildren();
  const root = h('div', 'analysis-root'); main.append(root);
  const intro = h('div', 'ov-intro'), title = h('div'); title.append(h('span', 'ov-kicker', 'Workspace / revisão'), h('h2', '', 'Análise'), h('p', '', 'Entenda o consumo e o que vale revisar em cada sessão.')); intro.append(title); root.append(intro);
  const toolbar = h('div', 'analysis-toolbar'), label = h('label', '', 'Sessão'), select = h('select'); label.append(select);
  const refresh = button('Atualizar análise', { onClick: () => load() }); toolbar.append(label, refresh, h('span', 'ov-note', 'Carrega quando você solicita.')); root.append(toolbar);
  const state = h('p', 'analysis-state'); state.setAttribute('role', 'status'); state.setAttribute('aria-live', 'polite');
  const body = h('div'); root.append(state, body);
  let version = 0;
  S.timers.push({ remove() { version++; } });
  function surface(titleText, parent) { const panel = h('section', 'analysis-surface'); panel.append(h('h3', '', titleText)); parent.append(panel); return panel; }
  function detail(parent, titleText) { const details = h('details', 'analysis-details'); details.append(h('summary', '', titleText)); parent.append(details); return details; }
  function rowsTable(parent, rows) { parent.append(table({ columns: [{ key: 'k', label: 'Medida' }, { key: 'v', label: 'Valor', align: 'r' }], rows: rows.map(([k, v]) => ({ k, v })) })); }
  function failure(text, retry) { body.replaceChildren(); const box = surface('Análise indisponível', body); box.append(h('p', 'ov-note', text + ' Dados ausentes não são apresentados como zero nem como uma avaliação positiva.'), button('Tentar novamente', { small: true, onClick: retry })); }
  async function sessions() {
    const current = ++version; refresh.disabled = true; state.textContent = 'Carregando sessões…';
    try { const list = await api('sessions'); if (!root.isConnected || current !== version) return;
      select.replaceChildren(); list.forEach(s => select.append(new Option((s.title || s.id).slice(0, 70) + ' · ' + s.mtime + (s.panel ? ' · painel' : ''), s.id)));
      if (!list.length) { state.textContent = ''; body.replaceChildren(); surface('Nenhuma sessão disponível', body).append(h('p', 'ov-note', 'As sessões aparecerão aqui quando houver registros para analisar.')); select.disabled = true; return; }
      select.disabled = false; if (list.some(s => s.id === S.anSession)) select.value = S.anSession; S.anSession = select.value; await load();
    } catch (e) { if (!root.isConnected || current !== version || isAbort(e)) return; state.textContent = ''; failure('Não foi possível consultar a lista de sessões.', sessions); }
    finally { if (root.isConnected) refresh.disabled = false; }
  }
  async function load() {
    if (!select.value) { await sessions(); return; }
    S.anSession = select.value; const current = ++version; refresh.disabled = true; state.textContent = 'Analisando os registros da sessão…';
    // Não mantém dados da sessão anterior sob o nome da nova sessão.
    body.replaceChildren();
    try { const data = await api('analysis?session=' + encodeURIComponent(select.value)); if (!root.isConnected || current !== version) return; if (!data.kpis) throw new Error('A sessão não forneceu métricas.'); paint(data); state.textContent = 'Registros analisados · ' + new Date().toLocaleTimeString('pt-BR') + ' · nenhuma IA acionada.'; }
    catch (e) { if (!root.isConnected || current !== version || isAbort(e)) return; state.textContent = ''; failure(e instanceof Error ? e.message : 'Não foi possível analisar a sessão.', load); }
    finally { if (root.isConnected && current === version) refresh.disabled = false; }
  }
  function paint(a) {
    body.replaceChildren(); const K = a.kpis, orch = a.orch || {}, agents = a.agents || [];
    const facts = h('div', 'analysis-facts');
    [[ 'Tokens novos', fmtN(num(K.tokens)), 'Entrada, saída e escrita de cache' ], [ 'Cache lido', fmtN(num(K.cache_read)), 'Separado dos tokens novos' ], [ 'Duração da sessão', fmtDur(num(K.duration) * 1000), 'Inclui pausas do usuário' ], [ 'Subagentes', String(num(K.agents)), 'Execuções nesta sessão' ]].forEach(([label, value, help]) => { const fact = h('div'); fact.append(h('span', '', label), h('strong', '', value), h('span', '', help)); facts.append(fact); }); body.append(facts);
    const layout = h('div', 'analysis-layout'), left = h('div'), right = h('div'); layout.append(left, right); body.append(layout);
    const findings = surface('O que revisar', left); findings.append(h('p', 'ov-note', 'Heurísticas, não uma nota de qualidade. Os sinais precisam ser conferidos no contexto do trabalho.'));
    const issues = (a.findings || []).filter(f => f.sev !== 'ok').sort((x, y) => (severity[x.sev] ?? 9) - (severity[y.sev] ?? 9));
    if (!issues.length) findings.append(h('p', 'ov-empty', 'Nenhum sinal apontado pelas heurísticas disponíveis. Isso não substitui revisar o resultado.'));
    issues.forEach(f => { const item = h('article', 'analysis-finding'), head = h('div', 'analysis-finding-head'); head.append(h('h4', '', f.title), badge(f.sev, TONE[f.sev] || 'neutral')); item.append(head, h('p', '', nextStep(f))); const evidence = detail(item, 'Ver evidências e limites'); evidence.append(h('p', '', f.detail), h('p', 'ov-note', 'Este é um sinal heurístico; isoladamente não prova desperdício nem falha no resultado.')); findings.append(item); });
    const orchestration = surface('Orquestração', left); orchestration.append(h('p', 'ov-note', 'A distribuição das execuções ajuda a entender o trabalho. Maior paralelismo não significa melhor resultado.'));
    const timed = agents.filter(ag => ag.start != null), span = Math.max(1, num(a.t1) - num(a.t0));
    if (!timed.length) orchestration.append(h('p', 'ov-empty', 'Nenhum intervalo de subagente disponível.'));
    else { const chart = h('div', 'analysis-timeline'); chart.setAttribute('role', 'img'); chart.setAttribute('aria-label', 'Intervalos de execução dos subagentes dentro da sessão'); timed.forEach(ag => { const row = h('div', 'analysis-time-row'), track = h('div', 'analysis-track'), fill = h('i'), start = Math.max(0, Math.min(1, (num(ag.start) - num(a.t0)) / span)), end = Math.max(start, Math.min(1, (num(ag.end || a.t1) - num(a.t0)) / span)); fill.style.marginLeft = (start * 100) + '%'; fill.style.width = Math.max(0, (end - start) * 100) + '%'; track.append(fill); row.append(h('span', '', ag.name), track, h('span', '', fmtDur(Math.max(0, num(ag.end || a.t1) - num(ag.start)) * 1000))); chart.append(row); }); orchestration.append(chart); }
    const complete = detail(orchestration, 'Ver métricas completas do orquestrador');
    rowsTable(complete, [['Delegações', num(orch.spawns)], ['Lotes de delegação', num(orch.batches)], ['Briefing médio', num(orch.avg_briefing) + ' caracteres'], ['Primeira delegação após', orch.first_delegation_s == null ? '—' : fmtDur(orch.first_delegation_s * 1000)], ['Mensagens aos agentes', num(orch.send_message)], ['Chamadas do principal', num(orch.main_calls)], ['Tokens novos: principal / subagentes', fmtN(num(orch.main_tokens)) + ' / ' + fmtN(num(orch.sub_tokens))], ['Paralelismo máximo', num(K.max_parallel) + ' · ' + num(K.parallel_time) + ' s com 2+ agentes'], ['Arquivos editados', num(K.edited)], ['Erros de ferramentas', num(K.errors) + ' / ' + num(K.calls) + ' · ' + (K.calls ? (100 * K.errors / K.calls).toFixed(1) : '0') + '%']]);
    const usage = surface('Distribuição de tokens', right), breakdown = [{ name: 'Principal', value: num(a.main?.tokens ?? orch.main_tokens), calls: num(a.main?.calls ?? orch.main_calls) }, ...agents.map(ag => ({ name: ag.name, value: tokens(ag), calls: num(ag.calls) }))];
    breakdown.forEach(ag => { const row = h('div', 'analysis-agent'), track = h('div', 'analysis-tokenbar'), fill = h('i'), fraction = K.tokens > 0 ? ag.value / K.tokens : 0; fill.style.width = Math.min(100, fraction * 100) + '%'; track.append(fill); row.append(h('span', '', ag.name), h('strong', '', fmtN(ag.value)), h('small', '', ag.calls + ' chamadas'), h('small', '', (fraction * 100).toFixed(1) + '% dos tokens novos'), track); usage.append(row); });
    usage.append(h('p', 'ov-note', 'Tokens novos por participante, incluindo o principal. Não é uma cobrança em dólares: modelos e cache têm preços diferentes.'));
    const context = surface('Contexto e ferramentas', right), files = detail(context, 'Arquivos mais lidos');
    if (!a.hot_files?.length) files.append(h('p', 'ov-empty', 'Nenhuma leitura de arquivo registrada.'));
    else files.append(table({ columns: [{ key: 'path', label: 'Arquivo' }, { key: 'reads', label: 'Leituras', align: 'r' }, { key: 'agents', label: 'Agentes', render: f => (f.agents || []).join(', ') }], rows: a.hot_files }));
    const tools = detail(context, 'Ferramentas mais usadas'); const entries = Object.entries(a.tools || {});
    if (!entries.length) tools.append(h('p', 'ov-empty', 'Nenhuma ferramenta registrada.')); else rowsTable(tools, entries);
  }
  select.onchange = load; await sessions();
}
