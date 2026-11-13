// @ts-check
import { watch } from '../lib/realtime.js';
import { renderChips } from '../status.js';
import { api } from '../api.js';
import { $, h, ico, stagger } from '../lib/dom.js';
import { go } from '../router.js';
import { S } from '../store.js';
import { guard, toast } from '../ui/toast.js';

/* ---------- Orquestrar ---------- */
function flowView(steps, nodes, opts = {}) {
  const f = h('div', 'flow'); steps.forEach((st, i) => { const c = h('div', 'stepc'); const t = h('div', 't'); t.append(document.createTextNode((i + 1) + '. ' + (st.nome || 'passo'))); if (st.gate && i > 0) t.append(h('span', 'gate', 'aprovação')); c.append(t);
    (nodes ? nodes[i] : st.agents).forEach(n => { const status = nodes ? n.status : null; const d = h('div', 'node ' + (status || '') + (nodes && n.run ? ' click' : '')); const r = h('div', 'r'); r.append(ico('diamond'), h('b', '', n.agent.replace('garcom-', ''))); if (status) r.append(h('span', 'badge st-' + status, status)); d.append(r);
      if (nodes && n.run) d.onclick = () => opts.open && opts.open(n); c.append(d); }); f.append(c); }); return f;
}
export async function renderOrquestrar() {
  const main = $('#main'); main.className = ''; main.replaceChildren(); const grid = h('div', 'bento'); main.append(grid);
  const rec = await api('recipes'); let sel = rec.recipes[0];
  const left = h('div', 'card s5'); left.append(h('h3', '', 'Receitas'), h('div', 'hint', 'Cada receita encadeia agentes: passos em sequência, agentes do mesmo passo em paralelo (máx. 3) e a saída de um passo alimenta o próximo. Um passo marcado com “aprovação” espera o seu ok.'));
  const list = h('div'); list.style.cssText = 'display:grid;gap:8px;margin-top:10px'; left.append(list);
  const right = h('div', 'card s7'); grid.append(left, right);
  function paintRecipe() { right.replaceChildren(); right.append(h('h3', '', sel.nome || sel.id), h('div', 'hint', sel.descricao || '')); right.append(flowView(sel.steps));
    const ta = h('textarea'); ta.placeholder = 'Descreva a tarefa (ex.: módulo tables — mesas e sessões)…'; ta.style.marginTop = '12px'; ta.rows = 3; const bud = h('input'); bud.type = 'number'; bud.step = '0.1'; bud.value = '0.4'; bud.style.width = '80px';
    const run_ = h('button', 'btn p'); run_.append(ico('play'), document.createTextNode('Executar receita')); run_.onclick = guard(async () => { run_.disabled = true; try { await api('pipelines', 'POST', { recipe: sel.id, task: ta.value, budget: parseFloat(bud.value) }); await paintPipes(); toast('receita iniciada'); } finally { run_.disabled = false; } });
    const r = h('div', 'row'); r.style.marginTop = '10px'; r.append(h('span', 'mut', 'teto por agente US$'), bud, run_); right.append(ta, r); }
  rec.recipes.forEach(rc => { const c = h('div', 'card hov'); c.style.padding = '10px 14px'; c.append(h('b', '', rc.nome || rc.id), h('div', 'hint', rc.steps.length + ' passo(s) · ' + rc.steps.reduce((a, s) => a + s.agents.length, 0) + ' agente(s)')); c.onclick = () => { sel = rc; paintRecipe(); }; list.append(c); });
  const ed = h('details'); ed.style.marginTop = '12px'; ed.append(h('summary', 'hint', 'editar receitas (JSON)')); const rta = h('textarea'); rta.value = rec.raw; rta.rows = 12; rta.style.fontFamily = 'var(--mono)'; const sv = h('button', 'btn sm', 'Salvar receitas'); sv.onclick = guard(async () => { await api('recipes', 'PUT', { raw: rta.value }); toast('receitas salvas'); renderOrquestrar(); }); ed.append(rta, sv); left.append(ed);
  const pc = h('div', 'card s12'); pc.append(h('h3', '', 'Execuções')); const pbox = h('div'); pc.append(pbox); grid.append(pc); paintRecipe();
  async function paintPipes() {
    S.pipes = await api('pipelines'); renderChips(); pbox.replaceChildren(); if (!S.pipes.length) pbox.append(h('div', 'hint', 'Nenhuma execução ainda.'));
    for (const p of S.pipes) { const c = h('div'); c.style.cssText = 'padding:12px 0;border-bottom:1px solid var(--bd)'; const t = h('div', 'row'); t.append(h('b', 'grow', p.nome + ' — ' + p.task.slice(0, 70)), h('span', 'badge st-' + p.status, p.status), h('span', 'dim mono', 'US$ ' + p.cost.toFixed(3)));
      if (p.status === 'aguardando') { const ap = h('button', 'btn sm p', 'Aprovar e continuar'); ap.onclick = guard(async () => { await api('pipelines/' + p.id + '/approve', 'POST', {}); paintPipes(); }); t.append(ap); }
      if (p.status === 'rodando' || p.status === 'aguardando') { const sp = h('button', 'btn sm d', 'Parar'); sp.onclick = guard(async () => { await api('pipelines/' + p.id + '/stop', 'POST', {}); paintPipes(); }); t.append(sp); }
      c.append(t); if (p.error) c.append(h('div', 'hint st-erro', p.error));
      c.append(flowView(p.steps, p.nodes, { open: n => { S.sel = n.run; go('chat'); } })); pbox.append(c); }
  }
  await paintPipes(); stagger(grid); S.timers.push(watch(['pipelines', 'runs'], paintPipes, 6000));
}
