// @ts-check
import { api } from '../api.js';
import { h } from '../lib/dom.js';
import { hashParams, setHashParams } from '../router.js';
import { S } from '../store.js';
import { diffKeys, diffView } from './diff-view.js';
import { emptyState } from './empty-state.js';
import { ciBadge, ghLink, labelChips, since, unavailableCard } from './gh-common.js';
import { md } from './markdown.js';
import { skeleton } from './skeleton.js';
import { guard } from './toast.js';

const REVIEW = { approved: ['aprovado', 'tst'], changes_requested: ['mudanças pedidas', 'ai2'], review_required: ['aguardando revisão', 'no'], none: ['', ''] };
const STATE = { OPEN: ['aberto', 'ai1'], MERGED: ['mergeado', 'ref'], CLOSED: ['fechado', 'ai2'] };

/** @param {string} review */
const reviewTag = review => { const [t, c] = /** @type {Record<string, string[]>} */ (REVIEW)[review] || REVIEW.none; return t ? h('span', 'tag ' + c, t) : h('span'); };
/** @param {string} state */
const stateTag = state => { const [t, c] = /** @type {Record<string, string[]>} */ (STATE)[state] || [state, 'no']; return h('span', 'tag ' + c, t); };

/** Detalhe de um PR: checks, revisões, commits e o diff (mesmo diff-view dos Commits). @param {HTMLElement} box @param {number | string} n */
async function detail(box, n) {
  box.replaceChildren(skeleton(6));
  const d = await api('gh/pr?n=' + n);
  if (d.unavailable) { box.replaceChildren(unavailableCard(d, () => detail(box, n))); return; }
  box.replaceChildren(h('h3', '', `#${d.number} ${d.title}`));
  const meta = h('div', 'row'); meta.style.margin = '6px 0 10px';
  meta.append(stateTag(d.state), d.draft ? h('span', 'tag no', 'rascunho') : h('span'), h('span', 'mono hint', `${d.branch} → ${d.base}`), h('span', 'hint', d.author ? '@' + d.author : ''), reviewTag(d.review), ghLink(d.url, 'Abrir no GitHub'));
  box.append(meta, labelChips(d.labels));
  if (d.body) { const m = md(d.body); m.classList.add('cbody'); box.append(m); }
  box.append(h('div', 'ctx-h', `Checks (${d.checks.length})`));
  if (!d.checks.length) box.append(h('div', 'hint', 'nenhum check neste PR'));
  d.checks.forEach((/** @type {any} */ c) => {
    const state = c.status && c.status !== 'completed' ? 'pending' : ['failure', 'timed_out', 'error'].includes(c.conclusion || '') ? 'failure' : c.conclusion === 'success' ? 'success' : c.conclusion === 'pending' ? 'pending' : 'cancelled';
    const r = h('div', 'gh-line'); r.append(ciBadge(state), h('span', 'nm', c.name)); if (c.url) r.append(ghLink(c.url, 'abrir', 'chipb')); box.append(r);
  });
  if (d.reviews.length) {
    box.append(h('div', 'ctx-h', `Revisões (${d.reviews.length})`));
    d.reviews.forEach((/** @type {any} */ v) => { const r = h('div', 'gh-line'); r.append(h('b', '', '@' + v.author), h('span', 'tag ' + (v.state === 'approved' ? 'tst' : 'no'), (v.state || '').replace('_', ' ')), h('span', 'hint grow', v.body)); box.append(r); });
  }
  box.append(h('div', 'ctx-h', `Commits (${d.commits.length})`));
  d.commits.forEach((/** @type {any} */ c) => { const r = h('div', 'gh-line'); r.append(h('span', 'mono dim', c.short), h('span', 'nm', c.subject), h('span', 'hint', `${c.author} · ${since(c.t)}`)); box.append(r); });
  box.append(h('div', 'ctx-h', 'Alterações'));
  const dv = diffView(d.diff, { open: 2 }); box.append(dv); if (d.diff_truncated) box.append(h('div', 'hint', 'diff truncado (muito grande): veja o resto no GitHub'));
  S.timers.push(diffKeys(dv));
}

/** Aba Pull requests: lista com filtro abertos/fechados/todos e detalhe ao lado. @param {HTMLElement} box @param {{ fresh: boolean }} o */
export async function prsPanel(box, { fresh }) {
  let state = hashParams().get('state') || 'open';
  const grid = h('div', 'gh-split'), left = h('div', 'card gh-list'), right = h('div', 'card gh-detail dv-scroll'); grid.append(left, right); box.replaceChildren(grid);
  right.append(emptyState('Escolha um pull request', 'O diff, os checks e os commits aparecem aqui.'));
  /** @type {HTMLElement | null} */ let on = null;
  const open = guard(async (/** @type {number} */ n, /** @type {HTMLElement} */ row) => { on?.classList.remove('on'); on = row; row.classList.add('on'); setHashParams({ pr: String(n) }); await detail(right, n); });

  const load = guard(async (/** @type {boolean} */ refresh) => {
    left.replaceChildren(skeleton(5));
    const r = await api(`gh/prs?state=${state}` + (refresh ? '&refresh=1' : ''));
    if (r.unavailable) { left.replaceChildren(unavailableCard(r, () => load(true))); return; }
    const seg = h('div', 'seg'); [['open', 'Abertos'], ['closed', 'Fechados'], ['all', 'Todos']].forEach(([k, l]) => { const b = h('button', state === k ? 'on' : '', l); b.onclick = () => { state = k; setHashParams({ state: k === 'open' ? '' : k, pr: '' }); load(false); }; seg.append(b); });
    left.replaceChildren(seg);
    if (!r.prs.length) { left.append(emptyState('Nenhum pull request', state === 'open' ? 'Não há PRs abertos.' : 'Nada por aqui.')); return; }
    const want = hashParams().get('pr'); /** @type {HTMLElement | null} */ let pre = null;
    r.prs.forEach((/** @type {any} */ p) => {
      const row = h('button', 'gh-row'); row.setAttribute('aria-label', `PR ${p.number}: ${p.title}`);
      const top = h('div', 'row'); top.style.gap = '8px'; top.append(ciBadge(p.checks), h('b', 'grow', `#${p.number} ${p.title}`), ...(p.draft ? [h('span', 'tag no', 'rascunho')] : []), stateTag(p.state));
      const mt = h('div', 'mt'); mt.append(h('span', 'mono', `${p.branch} → ${p.base}`), h('span', '', `@${p.author} · ${since(p.updated_at)}`), reviewTag(p.review), labelChips(p.labels));
      row.append(top, mt); row.onclick = () => open(p.number, row); left.append(row); if (String(p.number) === want) pre = row;
    });
    if (pre) /** @type {HTMLElement} */ (pre).click();
  });
  await load(fresh);
}
