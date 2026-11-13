// @ts-check
import { api } from '../api.js';
import { h } from '../lib/dom.js';
import { ago } from '../lib/format.js';
import { go } from '../router.js';
import { S } from '../store.js';
import { badge } from './badge.js';
import { button } from './button.js';
import { sidePanel } from './side-panel.js';
import { FASES, PRIORIDADES, STATUS } from './tk-model.js';
import { guard, toast } from './toast.js';

/**
 * @typedef {import('./tk-model.js').Task} Task
 * @typedef {ReturnType<typeof import('./tk-model.js').criarModelo>} Modelo
 * @typedef {{ recarregar: () => Promise<void>, abrir: (id: string) => void, modelo: () => Modelo, fechou: () => void }} Ctx
 */

const enc = encodeURIComponent;
const chaveCriterios = (/** @type {string} */ id) => 'tk.criterios.' + id;
/** Critérios marcados ficam só neste navegador (o esquema não guarda isso). @param {string} id @returns {string[]} */
function marcados(id) { try { return JSON.parse(localStorage.getItem(chaveCriterios(id)) || '[]'); } catch (e) { return []; } }
/** @param {string} id @param {string[]} v */
function gravarMarcados(id, v) { try { localStorage.setItem(chaveCriterios(id), JSON.stringify(v)); } catch (e) { /* sem storage: só não lembra */ } }

/** Campo com rótulo. @param {string} rotulo @param {HTMLElement} controle */
function campo(rotulo, controle) { const f = h('div', 'field'), l = h('label', '', rotulo); const id = 'tkf-' + Math.random().toString(36).slice(2, 8); controle.id = id; l.setAttribute('for', id); f.append(l, controle); return f; }
/** @param {string[]} opcoes @param {string} valor @param {(v: string) => string} [rotulo] */
function selecao(opcoes, valor, rotulo = v => v) { const s = h('select'); opcoes.forEach(o => s.append(Object.assign(h('option'), { value: o, textContent: rotulo(o) }))); s.value = valor; return s; }
/** @param {string} titulo */
const bloco = titulo => { const b = h('div', 'tk-block'); b.append(h('h4', 'tk-bh', titulo)); return b; };

/** Abre o painel de uma tarefa (modo ver; "Editar" troca para o formulário). @param {string} id @param {Ctx} ctx */
export function abrirTarefa(id, ctx) {
  const m = ctx.modelo(), t = m.porId.get(id);
  if (!t) { toast('tarefa não encontrada: ' + id, true); return; }
  const p = sidePanel(`${t.id} · ${t.titulo}`, { onClose: ctx.fechou });
  ver(p, t, ctx);
  return p;
}

/** @param {ReturnType<typeof sidePanel>} p @param {Task} t @param {Ctx} ctx */
function ver(p, t, ctx) {
  const m = ctx.modelo(), corpo = p.body; corpo.replaceChildren(); p.setTitle(`${t.id} · ${t.titulo}`);
  const meta = h('div', 'row'); meta.append(badge(STATUS[/** @type {keyof typeof STATUS} */ (t.status)], t.status === 'feita' ? 'ok' : t.status === 'fazendo' ? 'accent' : t.status === 'bloqueada' ? 'warn' : 'neutral'), badge(t.prioridade, t.prioridade === 'P0' ? 'err' : t.prioridade === 'P1' ? 'warn' : 'neutral'), badge(t.fase));
  if (t.quem) meta.append(h('span', 'small muted', t.quem === 'IA ok' ? 'pode ser feita por IA' : 'você faz'));
  if (t.atualizada_em) meta.append(h('span', 'small faint', 'atualizada em ' + t.atualizada_em));
  corpo.append(meta);
  const motivo = m.motivoBloqueio(t); if (motivo) corpo.append(h('p', 'tk-warn small', motivo));
  if (t.descricao) corpo.append(Object.assign(h('p', 'tk-desc'), { textContent: t.descricao }));
  if (t.criterios?.length) {
    const b = bloco('Critérios de pronto'), feitos = new Set(marcados(t.id));
    t.criterios.forEach(c => {
      const l = h('label', 'check tk-crit'), cb = h('input'); cb.type = 'checkbox'; cb.checked = feitos.has(c);
      cb.onchange = () => { cb.checked ? feitos.add(c) : feitos.delete(c); gravarMarcados(t.id, [...feitos]); };
      l.append(cb, h('span', '', c)); b.append(l);
    });
    b.append(h('div', 'tiny faint', 'As marcações ficam só neste navegador.')); corpo.append(b);
  }
  if (t.depende_de?.length) {
    const b = bloco('Depende de'), l = h('div', 'row');
    t.depende_de.forEach(d => { const x = m.porId.get(d); l.append(button(d + (x ? ' · ' + x.titulo.slice(0, 40) : ''), { small: true, title: x ? STATUS[/** @type {keyof typeof STATUS} */ (x.status)] : '', onClick: () => { p.close(); ctx.abrir(d); } })); });
    b.append(l); corpo.append(b);
  }
  if (t.bloqueada_por_decisao) { const b = bloco('Bloqueada por decisão'), l = h('div', 'row'); const ds = typeof t.bloqueada_por_decisao === 'string' ? [t.bloqueada_por_decisao] : t.bloqueada_por_decisao; ds.forEach(d => l.append(button(d, { small: true, onClick: () => { p.close(); go('decisoes'); } }))); b.append(l); corpo.append(b); }
  if (t.arquivos?.length) { const b = bloco('Arquivos'); t.arquivos.forEach(f => b.append(button(f, { variant: 'ghost', small: true, onClick: () => { p.close(); go('arquivos', '', 'path=' + enc(f)); } }))); corpo.append(b); }
  if (t.notas) { const b = bloco('Notas'); b.append(Object.assign(h('p', 'small muted tk-desc'), { textContent: t.notas })); corpo.append(b); }
  commitsDoId(t.id, p, corpo);
  const acoes = h('div', 'tk-actions');
  acoes.append(
    button('Mandar para um agente', { title: 'Abre a Conversa com esta tarefa no contexto', onClick: () => { S.draft.push({ type: 'task', id: t.id }); S.prefill = `Trabalhe na tarefa ${t.id}: ${t.titulo}. Siga os critérios de pronto.`; p.close(); go('conversa'); } }),
    button('Editar', { onClick: () => editar(p, t, ctx) }),
  );
  corpo.append(acoes);
}

/** Commits cujo texto cita o id (carregado depois, sem travar o painel). @param {string} id @param {ReturnType<typeof sidePanel>} p @param {HTMLElement} corpo */
function commitsDoId(id, p, corpo) {
  const b = bloco('Commits que citam ' + id), area = h('div', 'small faint', 'procurando…'); b.append(area); corpo.append(b);
  api(`graph?limit=20&grep=${enc(id)}`).then(r => {
    area.replaceChildren();
    if (!r.commits.length) { area.textContent = 'nenhum commit cita este id'; return; }
    r.commits.forEach((/** @type {any} */ c) => {
      const row = h('button', 'tk-commit'); row.type = 'button'; row.append(h('span', 'num faint', c.short), h('span', 'ellipsis grow', c.subject), h('span', 'tiny faint', ago(c.ts)));
      row.onclick = () => { S.commitSel = c.sha; p.close(); go('commits'); }; area.append(row);
    });
  }).catch(() => { area.textContent = 'não deu para consultar os commits'; });
}

/** Formulário de edição: grava só o que mudou. @param {ReturnType<typeof sidePanel>} p @param {Task} t @param {Ctx} ctx */
function editar(p, t, ctx) {
  const corpo = p.body; corpo.replaceChildren();
  const titulo = h('input'); titulo.type = 'text'; titulo.value = t.titulo;
  const status = selecao(Object.keys(STATUS), t.status, s => STATUS[/** @type {keyof typeof STATUS} */ (s)]);
  const prioridade = selecao(PRIORIDADES, t.prioridade), fase = selecao(FASES, t.fase), quem = selecao(['', 'você', 'IA ok'], t.quem || '', v => v || '—');
  const descricao = h('textarea'); descricao.rows = 4; descricao.value = t.descricao || '';
  const criterios = h('textarea'); criterios.rows = 4; criterios.value = (t.criterios || []).join('\n');
  const motivo = h('input'); motivo.type = 'text'; motivo.value = t.motivo || ''; motivo.placeholder = 'obrigatório ao arquivar';
  const notas = h('textarea'); notas.rows = 3; notas.value = t.notas || '';
  const erro = h('div', 'small tk-erro'); erro.setAttribute('role', 'alert');
  const linha = h('div', 'tk-grid'); linha.append(campo('Status', status), campo('Prioridade', prioridade), campo('Fase', fase), campo('Quem faz', quem));
  corpo.append(campo('Título', titulo), linha, campo('Descrição', descricao), campo('Critérios de pronto (um por linha)', criterios), campo('Motivo (ao arquivar)', motivo), campo('Notas', notas), erro);
  const salvar = button('Salvar', { variant: 'primary', onClick: guard(async () => {
    const novo = { titulo: titulo.value.trim(), status: status.value, prioridade: prioridade.value, fase: fase.value, quem: quem.value, descricao: descricao.value, motivo: motivo.value, notas: notas.value, criterios: criterios.value.split('\n').map(x => x.trim()).filter(Boolean) };
    if (novo.status === 'arquivada' && !novo.motivo.trim()) { erro.textContent = 'Para arquivar, escreva o motivo.'; motivo.focus(); return; }
    /** @type {Record<string, any>} */ const corpoPut = {};
    Object.entries(novo).forEach(([k, v]) => { const antes = /** @type {any} */ (t)[k]; if (JSON.stringify(v) !== JSON.stringify(antes ?? (Array.isArray(v) ? [] : ''))) corpoPut[k] = v; });
    if (!Object.keys(corpoPut).length) { ver(p, t, ctx); return; }
    try { Object.assign(t, await api('tasks/' + t.id, 'PUT', corpoPut)); } catch (e) { erro.textContent = e instanceof Error ? e.message : String(e); return; }
    await ctx.recarregar(); const novoT = ctx.modelo().porId.get(t.id); toast('tarefa salva'); if (novoT) ver(p, novoT, ctx);
  }) });
  const excluir = button('Excluir', { variant: 'danger', onClick: guard(async () => {
    if (!confirm(`Excluir ${t.id} de vez? Prefira arquivar (fica recuperável).`)) return;
    await api('tasks/' + t.id, 'DELETE'); p.close(); await ctx.recarregar(); toast(t.id + ' excluída');
  }) });
  const acoes = h('div', 'tk-actions'); acoes.append(salvar, button('Cancelar', { onClick: () => ver(p, t, ctx) }), h('span', 'grow'), excluir); corpo.append(acoes);
  titulo.focus();
}

/** Painel de nova tarefa (o servidor gera o id). @param {Ctx} ctx @param {string} [faseInicial] */
export function novaTarefa(ctx, faseInicial = 'MVP-1') {
  const p = sidePanel('Nova tarefa', { onClose: ctx.fechou }), corpo = p.body;
  const titulo = h('input'); titulo.type = 'text'; titulo.placeholder = 'O que precisa ser feito?';
  const modulo = h('input'); modulo.type = 'text'; modulo.setAttribute('list', 'tk-modulos'); const dl = h('datalist'); dl.id = 'tk-modulos'; ctx.modelo().modulos().forEach(x => dl.append(Object.assign(h('option'), { value: x })));
  const fase = selecao(FASES, faseInicial), prioridade = selecao(PRIORIDADES, 'P2'), quem = selecao(['você', 'IA ok'], 'você');
  const erro = h('div', 'small tk-erro'); erro.setAttribute('role', 'alert');
  const linha = h('div', 'tk-grid'); linha.append(campo('Fase', fase), campo('Prioridade', prioridade), campo('Quem faz', quem));
  corpo.append(campo('Título', titulo), campo('Módulo', modulo), dl, linha, erro);
  const criar = button('Criar tarefa', { variant: 'primary', onClick: guard(async () => {
    if (!titulo.value.trim()) { erro.textContent = 'Escreva o título.'; titulo.focus(); return; }
    let nova; try { nova = await api('tasks', 'POST', { titulo: titulo.value, modulo: modulo.value, fase: fase.value, prioridade: prioridade.value, quem: quem.value }); } catch (e) { erro.textContent = e instanceof Error ? e.message : String(e); return; }
    p.close(); await ctx.recarregar(); toast(nova.id + ' criada'); ctx.abrir(nova.id);
  }) });
  titulo.onkeydown = e => { if (e.key === 'Enter') criar.click(); };
  const acoes = h('div', 'tk-actions'); acoes.append(criar, button('Cancelar', { onClick: () => p.close() })); corpo.append(acoes);
  titulo.focus();
}
