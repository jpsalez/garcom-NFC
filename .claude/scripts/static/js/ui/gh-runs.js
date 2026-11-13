// @ts-check
import { api } from '../api.js';
import { h } from '../lib/dom.js';
import { fmtDur } from '../lib/format.js';
import { hashParams, setHashParams } from '../router.js';
import { emptyState } from './empty-state.js';
import { ciBadge, ghLink, runState, since, unavailableCard } from './gh-common.js';
import { skeleton } from './skeleton.js';
import { guard } from './toast.js';

/** Detalhe de uma execução: jobs, passos e o log do passo que falhou. @param {HTMLElement} box @param {number | string} id */
async function detail(box, id) {
  box.replaceChildren(skeleton(6));
  const d = await api('gh/run?id=' + id);
  if (d.unavailable) { box.replaceChildren(unavailableCard(d, () => detail(box, id))); return; }
  box.replaceChildren(h('h3', '', `${d.workflow}: ${d.title}`));
  const meta = h('div', 'row'); meta.style.margin = 'var(--s2) 0 var(--s3)';
  meta.append(ciBadge(runState(d)), h('span', 'mono small muted', `${d.branch} · ${d.sha.slice(0, 7)}`), ghLink(d.url, 'Abrir no GitHub')); box.append(meta);
  d.jobs.forEach((/** @type {any} */ j) => {
    const head = h('div', 'gh-line gh-job'); head.append(ciBadge(runState(j)), h('b', 'nm', j.name)); box.append(head);
    const ol = h('ol', 'gh-steps'); j.steps.forEach((/** @type {any} */ s) => { const li = h('li', s.conclusion === 'failure' ? 'bad' : ''); li.append(ciBadge(runState(s)), h('span', '', s.name)); ol.append(li); }); box.append(ol);
  });
  if (d.failed_log) { box.append(h('div', 'ctx-h', 'Log do passo que falhou')); const pre = h('pre', 'gh-log'); pre.textContent = d.failed_log; box.append(pre); }
  else if (!d.jobs.length) box.append(h('div', 'small muted', 'Esta execução ainda não tem jobs.'));
}

/** Aba Actions: execuções agrupadas por workflow e detalhe ao lado. @param {HTMLElement} box @param {{ fresh: boolean }} o */
export async function runsPanel(box, { fresh }) {
  const grid = h('div', 'split'), left = h('div', 'gh-list'), right = h('div', 'gh-detail'); grid.append(left, right); box.replaceChildren(grid);
  right.append(emptyState('Escolha uma execução para ver os jobs, os passos e o log do que falhou.'));
  /** @type {HTMLElement | null} */ let on = null;
  const open = guard(async (/** @type {number} */ id, /** @type {HTMLElement} */ row) => { on?.classList.remove('on'); on = row; row.classList.add('on'); setHashParams({ run: String(id) }); await detail(right, id); });
  const load = guard(async (/** @type {boolean} */ refresh) => {
    left.replaceChildren(skeleton(5));
    const r = await api('gh/runs' + (refresh ? '?refresh=1' : ''));
    if (r.unavailable) { left.replaceChildren(unavailableCard(r, () => load(true))); return; }
    left.replaceChildren();
    if (!r.runs.length) { left.append(emptyState('Nenhuma execução: os workflows de .github/workflows ainda não rodaram.')); return; }
    const want = hashParams().get('run'); /** @type {HTMLElement | null} */ let pre = null;
    r.workflows.forEach((/** @type {string} */ wf) => {
      const runs = r.runs.filter((/** @type {any} */ x) => x.workflow === wf).slice(0, 8);
      const wh = h('div', 'ctx-h', `${wf} (${runs.length})`); wh.style.margin = 'var(--s4) var(--s3) var(--s1)'; left.append(wh);
      runs.forEach((/** @type {any} */ x) => {
        const row = h('button', 'gh-row'); row.setAttribute('aria-label', `Execução ${x.id} de ${wf}: ${x.title}`);
        const top = h('div', 'row'); top.style.gap = 'var(--s2)'; top.append(ciBadge(runState(x)), h('b', 'grow', x.title || wf));
        const mt = h('div', 'mt'); mt.append(h('span', '', x.branch), h('span', 'mono', x.short), h('span', '', x.duration_s == null ? '' : fmtDur(x.duration_s * 1000)), h('span', '', since(x.created_at)));
        row.append(top, mt); row.onclick = () => open(x.id, row); left.append(row); if (String(x.id) === want) pre = row;
      });
    });
    if (pre) /** @type {HTMLElement} */ (pre).click();
  });
  await load(fresh);
}
