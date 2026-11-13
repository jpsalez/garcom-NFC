// @ts-check
import { watch } from '../lib/realtime.js';
import { renderChips } from '../status.js';
import { api } from '../api.js';
import { $, h } from '../lib/dom.js';
import { go } from '../router.js';
import { S } from '../store.js';
import { button } from '../ui/button.js';
import { emptyState } from '../ui/empty-state.js';
import { money, rotulado, statusBadge } from '../ui/obs-common.js';
import { section } from '../ui/section.js';
import { guard, toast } from '../ui/toast.js';

/**
 * Etapas de uma receita (ou de uma execução, quando há `nodes`): cada etapa é uma coluna de texto.
 * @param {any[]} steps @param {any[][] | null} [nodes] @param {{ open?: (n: any) => void }} [opts]
 */
function flowView(steps, nodes, opts = {}) {
  const f = h('ol', 'flow');
  steps.forEach((st, i) => {
    const c = h('li', 'fstep'), t = h('div', 'fstep-t'); t.append(document.createTextNode((i + 1) + '. ' + (st.nome || 'passo')));
    if (st.gate && i > 0) t.append(h('span', 'badge warn', 'aprovação')); c.append(t);
    (nodes ? nodes[i] : st.agents).forEach((/** @type {any} */ n) => {
      const nome = n.agent.replace('garcom-', '');
      if (nodes && n.run) { const b = h('button', 'fnode link'); b.type = 'button'; b.append(h('span', '', nome), statusBadge(n.status)); b.onclick = () => opts.open?.(n); b.title = 'Abrir a conversa deste agente'; c.append(b); }
      else { const d = h('div', 'fnode'); d.append(h('span', '', nome)); if (nodes) d.append(statusBadge(n.status)); c.append(d); }
    });
    f.append(c);
  });
  return f;
}

export async function renderRecipes() {
  const main = $('#main'); main.className = ''; main.replaceChildren();
  const rec = await api('recipes'); let sel = rec.recipes[0], editando = false;
  const split = h('div', 'recsplit'), left = h('div', 'recsplit-l'), right = h('div', 'recsplit-r'); split.append(left, right); main.append(split);

  const lista = h('div', 'list'); lista.setAttribute('role', 'listbox'); lista.setAttribute('aria-label', 'Receitas');
  left.append(h('h2', '', 'Receitas'), h('p', 'muted small', 'Cada receita encadeia agentes: etapas em sequência, agentes da mesma etapa em paralelo (máx. 3). Uma etapa com “aprovação” espera o seu ok.'), lista,
    button('Editar receitas', { variant: 'ghost', small: true, onClick: () => { editando = true; paintRecipe(); } }));

  function paintLista() {
    lista.replaceChildren();
    rec.recipes.forEach((/** @type {any} */ rc) => {
      const b = h('button', 'item clickable' + (rc === sel && !editando ? ' on' : '')); b.type = 'button'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(rc === sel));
      const t = h('span', 'grow'); t.append(h('b', '', rc.nome || rc.id), h('div', 'muted small', rc.steps.length + ' etapa(s) · ' + rc.steps.reduce((a, /** @type {any} */ s) => a + s.agents.length, 0) + ' agente(s)'));
      b.append(t); b.onclick = () => { sel = rc; editando = false; paintRecipe(); }; lista.append(b);
    });
  }

  function paintEditor() {
    right.append(h('h2', '', 'Editar receitas'), h('p', 'muted small', 'JSON das receitas. Salvar valida o formato; um erro mantém o arquivo como está.'));
    const ta = h('textarea'); ta.value = rec.raw; ta.rows = 18; ta.classList.add('code-area'); ta.setAttribute('aria-label', 'JSON das receitas');
    const r = h('div', 'row');
    r.append(button('Salvar receitas', { variant: 'primary', onClick: guard(async () => { await api('recipes', 'PUT', { raw: ta.value }); toast('receitas salvas'); renderRecipes(); }) }),
      button('Cancelar', { onClick: () => { editando = false; paintRecipe(); } }));
    right.append(ta, r);
  }

  function paintRecipe() {
    right.replaceChildren(); paintLista();
    if (editando) return paintEditor();
    if (!sel) { right.append(emptyState('Nenhuma receita cadastrada.', { label: 'Editar receitas', onClick: () => { editando = true; paintRecipe(); } })); return; }
    right.append(h('h2', '', sel.nome || sel.id), h('p', 'muted', sel.descricao || ''), flowView(sel.steps));
    const ta = h('textarea'); ta.placeholder = 'Descreva a tarefa (ex.: módulo tables — mesas e sessões)…'; ta.rows = 3; ta.setAttribute('aria-label', 'Tarefa da receita');
    const bud = h('input'); bud.type = 'number'; bud.step = '0.1'; bud.value = '0.4'; bud.setAttribute('aria-label', 'Teto por agente em dólares');
    const executar = button('Executar receita', { variant: 'primary', icon: 'play', onClick: guard(async () => { executar.setAttribute('disabled', ''); try { await api('pipelines', 'POST', { recipe: sel.id, task: ta.value, budget: parseFloat(bud.value) }); await paintPipes(); toast('receita iniciada'); } finally { executar.removeAttribute('disabled'); } }) });
    const r = h('div', 'row'); r.append(rotulado('Teto por agente (US$)', bud), executar); right.append(h('div', 'gap'), ta, r);
  }

  const exec = section('Execuções'); main.append(exec.el);
  async function paintPipes() {
    S.pipes = await api('pipelines'); renderChips(); exec.body.replaceChildren();
    if (!S.pipes.length) { exec.body.append(emptyState('Nenhuma execução ainda.')); return; }
    const lista2 = h('div', 'list');
    for (const p of S.pipes) {
      const it = h('div', 'exec');
      const t = h('div', 'row'); t.append(h('b', 'grow ellipsis', p.nome + ' — ' + p.task.slice(0, 70)), statusBadge(p.status), h('span', 'muted small num', money(p.cost)));
      if (p.status === 'aguardando') t.append(button('Aprovar e continuar', { small: true, onClick: guard(async () => { await api('pipelines/' + p.id + '/approve', 'POST', {}); paintPipes(); }) }));
      if (p.status === 'rodando' || p.status === 'aguardando') t.append(button('Parar', { variant: 'danger', small: true, onClick: guard(async () => { await api('pipelines/' + p.id + '/stop', 'POST', {}); paintPipes(); }) }));
      it.append(t); if (p.error) it.append(h('div', 'errline', p.error));
      it.append(flowView(p.steps, p.nodes, { open: n => { S.sel = n.run; go('conversa'); } })); lista2.append(it);
    }
    exec.body.append(lista2);
  }
  paintRecipe(); await paintPipes(); S.timers.push(watch(['pipelines', 'runs'], paintPipes, 6000));
}

