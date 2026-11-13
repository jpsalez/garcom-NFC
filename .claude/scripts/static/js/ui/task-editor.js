// @ts-check
import { api } from '../api.js';
import { h } from '../lib/dom.js';
import { button } from './button.js';
import { FASES, PRIORIDADES, STATUS } from './tk-model.js';
import { go } from '../router.js';
import { S } from '../store.js';
import { guard } from './toast.js';

const fields = ['titulo', 'status', 'prioridade', 'fase', 'quem', 'descricao', 'criterios', 'depende_de', 'bloqueada_por_decisao', 'arquivos', 'notas', 'modulo', 'motivo', 'refs'];
export const taskCopy = task => JSON.parse(JSON.stringify(task));
export const taskPatch = (before, after) => Object.fromEntries(fields.filter(k => JSON.stringify(before[k] ?? (Array.isArray(after[k]) ? [] : '')) !== JSON.stringify(after[k] ?? (Array.isArray(before[k]) ? [] : ''))).map(k => [k, after[k] ?? null]));
const criteriaKey = id => 'tk.criterios.' + id;
const marked = id => { try { return JSON.parse(localStorage.getItem(criteriaKey(id)) || '[]'); } catch { return []; } };

/** Editor embutido: não cria sobreposição nem captura foco fora da área de trabalho. */
export function taskEditor(host, task, ctx) {
  host.replaceChildren(); if (!task) { host.append(h('p', 'taskdesk-empty', 'Selecione uma tarefa para editar.')); return; }
  const draft = ctx.draft(task), head = h('div', 'taskdesk-detail-head'), id = h('div', 'taskdesk-id'); id.append(h('span', '', task.id), h('span', '', STATUS[task.status]));
  const title = h('input'); title.type = 'text'; title.value = draft.titulo; title.setAttribute('aria-label', 'Título da tarefa'); title.maxLength = 200; head.append(id, title); host.append(head);
  const body = h('div', 'taskdesk-detail-body'); host.append(body);
  const state = h('small'), error = h('p', 'err-t'); error.setAttribute('role', 'alert');
  const changed = () => { state.textContent = ctx.dirty(task.id) ? 'Edições ainda não salvas' : 'Sem alterações pendentes'; ctx.changed(); };
  title.oninput = () => { draft.titulo = title.value; changed(); };
  const model = ctx.model(), reason = model.motivoBloqueio(task);
  if (reason) { const block = h('div', 'taskdesk-block'); block.append(h('strong', '', 'Antes de começar'), h('div', '', reason)); model.dependenciasPendentes(task).forEach(dep => block.append(button('Abrir ' + dep, { small: true, onClick: () => ctx.select(dep) }))); if (model.decisoesPendentes(task).length) block.append(button('Abrir Decisões', { small: true, onClick: () => go('decisoes') })); body.append(block); }
  const field = (parent, label, key, options = null, multiline = false) => { const wrap = h('label', 'taskdesk-field', label), input = h(options ? 'select' : multiline ? 'textarea' : 'input', options ? 'taskdesk-select' : 'taskdesk-input'); if (options) options.forEach(([value, text]) => input.append(new Option(text, value))); else if (!multiline) input.type = 'text'; input.value = Array.isArray(draft[key]) ? draft[key].join('\n') : draft[key] || ''; input.addEventListener(options ? 'change' : 'input', () => { draft[key] = ['criterios', 'depende_de', 'arquivos'].includes(key) ? input.value.split('\n').map(t => t.trim()).filter(Boolean) : key === 'bloqueada_por_decisao' ? input.value.split(/[\n,]/).map(t => t.trim()).filter(Boolean) : input.value; if (key === 'bloqueada_por_decisao' && !draft[key].length) draft[key] = null; changed(); }); wrap.append(input); parent.append(wrap); return input; };
  const grid = h('div', 'taskdesk-fields'); field(grid, 'Estado', 'status', Object.entries(STATUS)); field(grid, 'Prioridade', 'prioridade', PRIORIDADES.map(v => [v, v])); field(grid, 'Responsável', 'quem', [['', 'Não definido'], ['você', 'Você'], ['IA ok', 'Pode ser feita por IA']]); field(grid, 'Fase', 'fase', FASES.map(v => [v, v])); body.append(grid);
  field(body, 'Escopo e resultado esperado', 'descricao', null, true);
  body.append(h('h3', 'taskdesk-subtitle', 'Critérios de pronto'));
  const checks = new Set(marked(task.id)), criteria = h('div');
  const paintCriteria = () => { criteria.replaceChildren(); (draft.criterios || []).forEach((text, index) => { const row = h('div', 'taskdesk-criteria'), label = h('label'), cb = h('input'); cb.type = 'checkbox'; cb.checked = checks.has(text); cb.onchange = () => { cb.checked ? checks.add(text) : checks.delete(text); try { localStorage.setItem(criteriaKey(task.id), JSON.stringify([...checks])); } catch {} }; label.append(cb, h('span', '', text)); const remove = button('×', { small: true, title: 'Remover critério', onClick: () => { draft.criterios.splice(index, 1); paintCriteria(); changed(); } }); row.append(label, remove); criteria.append(row); }); };
  paintCriteria(); body.append(criteria, h('p', 'ov-note', 'As marcações dos critérios ficam só neste navegador.'));
  const criterionForm = h('form', 'taskdesk-addline'), criterion = h('input', 'taskdesk-input'), add = button('+', { small: true, title: 'Adicionar critério' }); criterion.type = 'text'; criterion.placeholder = 'Adicionar critério…'; criterion.setAttribute('aria-label', 'Novo critério'); criterion.maxLength = 300; add.type = 'submit'; criterionForm.append(criterion, add); criterionForm.onsubmit = e => { e.preventDefault(); if (!criterion.value.trim()) return; draft.criterios = [...(draft.criterios || []), criterion.value.trim()]; criterion.value = ''; paintCriteria(); changed(); }; body.append(criterionForm);
  const dependencies = h('details', 'taskdesk-other'); dependencies.open = !!task.depende_de?.length || !!task.bloqueada_por_decisao; dependencies.append(h('summary', '', 'Dependências e decisão bloqueadora'));
  (task.depende_de || []).forEach(dep => dependencies.append(button(dep + ' · ' + (model.porId.get(dep)?.titulo || 'Não encontrada'), { small: true, onClick: () => ctx.select(dep) })));
  field(dependencies, 'Dependências · IDs, um por linha', 'depende_de', null, true); field(dependencies, 'Decisões bloqueadoras · IDs separados por vírgula', 'bloqueada_por_decisao'); body.append(dependencies);
  const more = h('details', 'taskdesk-other'); more.append(h('summary', '', 'Arquivos, módulo, notas e histórico')); field(more, 'Módulo', 'modulo'); field(more, 'Arquivos · um por linha', 'arquivos', null, true); (task.arquivos || []).forEach(path => more.append(button('Abrir ' + path, { small: true, onClick: () => go('arquivos', '', 'path=' + encodeURIComponent(path)) }))); field(more, 'Notas', 'notas', null, true); field(more, 'Referências', 'refs');
  const commits = h('details'); commits.append(h('summary', '', 'Commits que citam ' + task.id)); let commitsLoaded = false;
  commits.ontoggle = guard(async () => { if (!commits.open || commitsLoaded) return; const result = await api('graph?limit=20&grep=' + encodeURIComponent(task.id)); if (!host.isConnected) return; commitsLoaded = true; if (!result.commits.length) commits.append(h('p', 'ov-note', 'Nenhum commit cita este ID.')); result.commits.forEach(c => commits.append(button(c.short + ' · ' + c.subject, { small: true, onClick: () => { S.commitSel = c.sha; go('commits'); } }))); }); more.append(commits); body.append(more);
  const reasonInput = field(body, 'Motivo · obrigatório para arquivar', 'motivo');
  const actions = h('div', 'taskdesk-savebar'), save = button('Salvar alterações', { variant: 'primary', onClick: guard(async () => { error.textContent = ''; if (!draft.titulo.trim()) { error.textContent = 'Informe um título.'; return; } if (draft.status === 'fazendo') { const proposed = ctx.modelFor(draft); const blocked = proposed.motivoBloqueio({ ...draft, status: 'a-fazer' }); if (blocked) { error.textContent = 'Resolva o bloqueio antes de iniciar: ' + blocked; return; } } if (draft.status === 'arquivada' && !draft.motivo?.trim()) { error.textContent = 'Informe o motivo para arquivar.'; reasonInput.focus(); return; } save.disabled = true; try { await ctx.save(task.id, draft); } catch (e) { error.textContent = e instanceof Error ? e.message : String(e); } finally { save.disabled = false; } }) });
  actions.append(state, button('Descartar', { small: true, onClick: () => ctx.discard(task.id) }), save); body.append(error, actions);
  const extraActions = h('div', 'ov-actions'); extraActions.append(button('Enviar para agente', { small: true, onClick: () => { if (ctx.dirty(task.id)) { error.textContent = 'Salve a tarefa antes de enviar.'; return; } S.draft.push({ type: 'task', id: task.id }); S.prefill = `Trabalhe na tarefa ${task.id}: ${task.titulo}. Siga os critérios de pronto.`; go('conversa'); } }), button(task.status === 'arquivada' ? 'Restaurar tarefa' : 'Arquivar', { small: true, onClick: () => { draft.status = task.status === 'arquivada' ? 'a-fazer' : 'arquivada'; if (draft.status === 'arquivada') { reasonInput.focus(); error.textContent = 'Informe um motivo e salve para arquivar.'; } ctx.redrawEditor(); } })); body.append(extraActions);
  const danger = h('details', 'taskdesk-other'); danger.append(h('summary', '', 'Excluir permanentemente'), button('Excluir tarefa', { variant: 'danger', small: true, onClick: guard(async () => { if (!confirm('Excluir ' + task.id + ' permanentemente? Prefira arquivar para preservar o histórico.')) return; await ctx.remove(task.id); }) })); body.append(danger); changed();
}
