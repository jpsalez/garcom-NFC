// @ts-check
import { button } from './button.js';
import { api } from '../api.js';
import { h } from '../lib/dom.js';
import { go } from '../router.js';
import { emptyState } from './empty-state.js';
import { ghLink, labelChips, since, unavailableCard } from './gh-common.js';
import { skeleton } from './skeleton.js';
import { guard } from './toast.js';

/** Abre a tela Tarefas filtrada pelo id citado na issue (ou Decisões, se for DEC-NN). @param {string} id */
function openTask(id) { return id.startsWith('DEC-') ? go('decisoes') : go('tarefas', '', 'q=' + encodeURIComponent(id)); }

/** Aba Issues: abertas, com rótulos, responsáveis e o vínculo com as Tarefas. @param {HTMLElement} box @param {{ fresh: boolean }} o */
export async function issuesPanel(box, { fresh }) {
  const card = h('div', 'gh-list gh-issues'); box.replaceChildren(card);
  const load = guard(async (/** @type {boolean} */ refresh) => {
    card.replaceChildren(skeleton(5));
    const r = await api('gh/issues' + (refresh ? '?refresh=1' : ''));
    if (r.unavailable) { card.replaceChildren(unavailableCard(r, () => load(true))); return; }
    const cnt = h('div', 'small muted', `${r.issues.length} issue(s) aberta(s)`); cnt.style.padding = 'var(--s3)'; card.replaceChildren(cnt);
    if (!r.issues.length) { card.append(emptyState('Nenhuma issue aberta.')); return; }
    r.issues.forEach((/** @type {any} */ i) => {
      const row = h('div', 'gh-row gh-issue'), top = h('div', 'row'); top.style.gap = 'var(--s2)';
      top.append(h('b', 'grow', `#${i.number} ${i.title}`), ghLink(i.url, 'GitHub', 'btn sm ghost'));
      const mt = h('div', 'mt'); mt.append(h('span', '', `@${i.author} · ${since(i.updated_at)}`), h('span', '', i.assignees.length ? 'resp.: ' + i.assignees.map((/** @type {string} */ a) => '@' + a).join(', ') : 'sem responsável'), labelChips(i.labels.slice(0, 2)));
      row.append(top, mt);
      if (i.task_ids.length) { const t = h('div', 'row'); t.style.marginTop = 'var(--s2)'; t.append(h('span', 'small muted', 'Cita:')); i.task_ids.forEach((/** @type {string} */ id) => t.append(button(id, { small: true, variant: 'ghost', title: id.startsWith('DEC-') ? 'Abrir em Decisões' : 'Abrir em Tarefas', onClick: () => openTask(id) }))); row.append(t); }
      if (i.body) row.append(h('div', 'small muted gh-body', i.body.replace(/\s+/g, ' ').slice(0, 160)));
      card.append(row);
    });
  });
  await load(fresh);
}
