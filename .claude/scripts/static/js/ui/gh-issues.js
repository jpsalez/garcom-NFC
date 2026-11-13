// @ts-check
import { api } from '../api.js';
import { h } from '../lib/dom.js';
import { go } from '../router.js';
import { emptyState } from './empty-state.js';
import { ghLink, labelChips, since, unavailableCard } from './gh-common.js';
import { skeleton } from './skeleton.js';
import { guard } from './toast.js';

/** Abre a tela Tarefas já filtrada pelo id citado na issue. @param {string} id */
async function openTask(id) {
  await go('tarefas');
  const q = /** @type {HTMLInputElement | null} */ (document.getElementById('tk-q'));
  if (q) { q.value = id; q.dispatchEvent(new Event('input', { bubbles: true })); }
}

/** Aba Issues: abertas, com rótulos, responsáveis e o vínculo com as Tarefas. @param {HTMLElement} box @param {{ fresh: boolean }} o */
export async function issuesPanel(box, { fresh }) {
  const card = h('div', 'card gh-list gh-issues'); box.replaceChildren(card);
  const load = guard(async (/** @type {boolean} */ refresh) => {
    card.replaceChildren(skeleton(5));
    const r = await api('gh/issues' + (refresh ? '?refresh=1' : ''));
    if (r.unavailable) { card.replaceChildren(unavailableCard(r, () => load(true))); return; }
    card.replaceChildren(h('div', 'hint', `${r.issues.length} issue(s) aberta(s)`));
    if (!r.issues.length) { card.append(emptyState('Nenhuma issue aberta', 'Quando houver, elas aparecem aqui.')); return; }
    r.issues.forEach((/** @type {any} */ i) => {
      const row = h('div', 'gh-row gh-issue'), top = h('div', 'row'); top.style.gap = '8px';
      top.append(h('b', 'grow', `#${i.number} ${i.title}`), ghLink(i.url, 'GitHub', 'chipb'));
      const mt = h('div', 'mt'); mt.append(h('span', '', `@${i.author} · ${since(i.updated_at)}`), i.assignees.length ? h('span', 'tag tst', 'resp.: ' + i.assignees.map((/** @type {string} */ a) => '@' + a).join(', ')) : h('span', 'tag no', 'sem responsável'), labelChips(i.labels));
      row.append(top, mt);
      if (i.task_ids.length) { const t = h('div', 'row'); t.style.cssText = 'gap:6px;margin-top:6px'; t.append(h('span', 'hint', 'Tarefas:')); i.task_ids.forEach((/** @type {string} */ id) => { const b = h('button', 'chipb', id); b.title = 'Abrir em Tarefas'; b.onclick = () => openTask(id); t.append(b); }); row.append(t); }
      if (i.body) row.append(h('div', 'hint gh-body', i.body.replace(/\s+/g, ' ').slice(0, 160)));
      card.append(row);
    });
  });
  await load(fresh);
}
