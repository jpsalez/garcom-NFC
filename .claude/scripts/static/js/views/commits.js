// @ts-check
import { watch } from '../lib/realtime.js';
import { api, isAbort } from '../api.js';
import { $, h } from '../lib/dom.js';
import { ago } from '../lib/format.js';
import { go } from '../router.js';
import { S } from '../store.js';
import { activityOverview } from '../ui/activity.js';
import { badge } from '../ui/badge.js';
import { button } from '../ui/button.js';
import { renderCommitDetail, renderCompare, renderWip } from '../ui/commit-detail.js';
import { graphSvg, layoutGraph } from '../ui/commit-graph.js';
import { emptyState } from '../ui/empty-state.js';
import { ciBadge, ghLink, runState } from '../ui/gh-common.js';
import { guard, toast } from '../ui/toast.js';

const ROW = 46, OVER = 6, PAGE = 400;
/** Filtros mantidos entre visitas à tela. Os cinco últimos vão para o servidor; `flt` e `q` filtram o que já foi carregado. */
const F = { flt: 'todos', q: '', branch: '', author: '', path: '', since: '', until: '' };
const SERVER_FILTERS = /** @type {const} */ (['branch', 'author', 'path', 'since', 'until']);
const FILTER_LABEL = { branch: 'ramo', author: 'autor', path: 'pasta', since: 'desde', until: 'até' };

/** @typedef {{ sha: string, short: string, parents: string[], author: string, t: string, ts: number, refs: { name: string, kind: string, current: boolean }[], subject: string, add: number, del: number, nfiles: number, tests: boolean, merge: boolean }} GCommit */

export async function renderCommits() {
  const main = $('#main'); main.className = ''; main.replaceChildren();
  const [act, wt, br] = await Promise.all([api('activity?days=84'), api('worktree'), api('branches')]);
  main.append(activityOverview(act));

  // ----- barra de filtros: o essencial à vista, o resto atrás de "Filtros" -----
  const bar = h('div', 'toolbar');
  const seg = h('div', 'seg'); [['todos', 'Todos'], ['semtestes', 'Sem testes'], ['merge', 'Merges']].forEach(([k, l]) => { const b = h('button', F.flt === k ? 'on' : '', l); b.onclick = () => { F.flt = k; seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); paint(true); }; seg.append(b); });
  const q = h('input'); q.type = 'search'; q.placeholder = 'mensagem, autor ou sha'; q.value = F.q; q.style.width = '220px'; q.setAttribute('aria-label', 'Buscar nos commits carregados');
  const branch = h('select'); branch.setAttribute('aria-label', 'Ramo'); branch.append(new Option('todos os ramos', ''));
  br.filter((/** @type {any} */ x) => !x.remote).concat(br.filter((/** @type {any} */ x) => x.remote)).forEach((/** @type {any} */ x) => branch.append(new Option(x.name, x.name))); branch.value = F.branch;
  const more = button('Filtros', { small: true, onClick: () => { adv.hidden = !adv.hidden; more.setAttribute('aria-expanded', String(!adv.hidden)); } }); more.setAttribute('aria-expanded', 'false');
  const cmp = button('Comparar', { small: true, title: 'Comparar dois branches, tags ou commits' });
  bar.append(seg, q, branch, more, h('span', 'grow'), cmp);
  const adv = h('div', 'filters'); adv.hidden = true;
  const author = h('select'); author.setAttribute('aria-label', 'Filtrar por autor');
  const path = h('input'); path.type = 'text'; path.placeholder = 'pasta ou arquivo (ex.: back-end/src)'; path.value = F.path; path.style.width = '250px'; path.setAttribute('aria-label', 'Filtrar por pasta ou arquivo');
  const since = h('input'), until = h('input'); [since, until].forEach((d, i) => { d.type = 'date'; d.value = i ? F.until : F.since; d.setAttribute('aria-label', i ? 'até a data' : 'a partir da data'); });
  adv.append(h('span', 'small muted', 'Autor'), author, path, h('span', 'small muted', 'de'), since, h('span', 'small muted', 'até'), until, button('Limpar filtros', { small: true, variant: 'ghost', onClick: () => { Object.assign(F, { flt: 'todos', q: '', branch: '', author: '', path: '', since: '', until: '' }); renderCommits(); } }));
  const chips = h('div', 'chipsrow'), status = h('div', 'small muted'); status.style.marginBottom = 'var(--s2)';
  main.append(bar, adv, chips, status);

  // ----- lista (virtualizada) e detalhe -----
  const g = h('div', 'split'), left = h('div'), right = h('div', 'cd-pane dv-scroll'); g.append(left, right); main.append(g);
  const wipBox = h('div'), scroller = h('div', 'cl-scroll'), spacer = h('div', 'cl-spacer'), win = h('div', 'cl-win'); spacer.append(win); scroller.append(spacer); left.append(wipBox, scroller);
  scroller.tabIndex = 0; scroller.setAttribute('aria-label', 'Lista de commits (↑ ↓ navegam)');
  /** @type {GCommit[]} */ let commits = []; let total = 0, loading = false, ticket = 0;
  /** Resposta de /api/gh/overview (CI por commit e PR por branch); fica nula sem gh instalado/autenticado. @type {any} */ let gh = null;
  /** PR de um nome de branch (local ou origin/…). @param {string} name */
  const prOf = name => gh && gh.prs_by_branch[name.replace(/^origin\//, '')];
  /** @param {{ number: number, state: string, url: string }} p */
  const prChip = p => { const a = ghLink(p.url, 'PR #' + p.number, 'badge info gh-pr ' + p.state.toLowerCase()); a.title = 'Abrir o pull request no GitHub'; a.onclick = e => e.stopPropagation(); return a; };
  /** @type {ReturnType<typeof layoutGraph> | null} */ let layout = null;
  /** @type {GCommit[]} */ let shown = [];

  const filtersOn = () => F.flt !== 'todos' || !!F.q || !!(F.author || F.path || F.since || F.until);
  const visible = () => {
    const t = F.q.trim().toLowerCase();
    return commits.filter(c => (F.flt === 'semtestes' ? !c.tests : F.flt === 'merge' ? c.merge : true) && (!t || c.subject.toLowerCase().includes(t) || c.author.toLowerCase().includes(t) || c.sha.startsWith(t)));
  };
  /** Chips dos filtros avançados ativos, cada um com × para tirar. */
  function paintChips() {
    chips.replaceChildren();
    SERVER_FILTERS.forEach(k => {
      if (!F[k]) return;
      const c = h('span', 'chipf', `${FILTER_LABEL[k]}: ${F[k]}`), x = h('button', '', '×'); x.setAttribute('aria-label', 'Remover filtro ' + FILTER_LABEL[k]);
      x.onclick = () => { F[k] = ''; ({ branch, author, path, since, until })[k].value = ''; reload(); }; c.append(x); chips.append(c);
    });
    const n = SERVER_FILTERS.filter(k => F[k] && k !== 'branch').length; more.textContent = n ? `Filtros (${n})` : 'Filtros';
  }

  /** @param {GCommit} c @param {number} i */
  function row(c, i) {
    const r = h('div', 'crow' + (c.sha === S.commitSel ? ' on' : '')); r.style.height = ROW + 'px'; r.dataset.sha = c.sha; r.setAttribute('role', 'button');
    if (layout) r.append(graphSvg(layout.rows[i], layout.maxLanes, ROW)); else r.append(h('span', 'cdot'));
    const sj = h('div', 'sj'), mt = h('div', 'mt'), refs = h('span', 'refs');
    /** @type {HTMLElement[]} */ const marks = [];
    c.refs.forEach(x => marks.push(badge(x.name, x.current ? 'accent' : x.kind === 'tag' ? 'warn' : 'neutral')));
    const seen = new Set(); c.refs.forEach(x => { const p = x.kind !== 'tag' && prOf(x.name); if (p && !seen.has(p.number)) { seen.add(p.number); marks.push(prChip(p)); } });
    marks.slice(0, 2).forEach(m => refs.append(m));
    const run = gh && gh.runs_by_sha[c.sha]; mt.append(...(run ? [ciBadge(runState(run))] : []), h('span', 'mono', c.short), h('span', '', c.author + ' · ' + ago(c.ts)), refs);
    sj.append(h('b', '', c.subject), mt);
    const pm = h('span', 'pm'); pm.append(h('span', 'a', '+' + c.add), document.createTextNode(' '), h('span', 'd', '−' + c.del));
    r.append(sj, pm); r.onclick = () => select(c.sha); return r;
  }

  /** @param {boolean} [relayout] */
  function paint(relayout = false) {
    if (relayout) { shown = visible(); layout = filtersOn() ? null : layoutGraph(commits); scroller.scrollTop = 0; } else shown = visible();
    spacer.style.height = shown.length * ROW + 'px';
    const tp = scroller.scrollTop, hg = scroller.clientHeight || 600;
    const a = Math.max(0, Math.floor(tp / ROW) - OVER), b = Math.min(shown.length, Math.ceil((tp + hg) / ROW) + OVER);
    win.style.transform = `translateY(${a * ROW}px)`; win.replaceChildren(...shown.slice(a, b).map((c, i) => row(c, a + i)));
    status.textContent = `${shown.length} de ${commits.length} commit(s) carregados · ${total} no total` + (filtersOn() ? ' · o grafo fica oculto enquanto há filtros' : '');
    if (b >= shown.length - 8 && commits.length < total && !loading) loadMore();
  }
  let raf = 0; scroller.onscroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => paint()); };

  function params() {
    const p = new URLSearchParams({ limit: String(PAGE), skip: String(commits.length) });
    SERVER_FILTERS.forEach(k => { if (F[k]) p.set(k, F[k]); }); return p;
  }
  async function loadMore() {
    const my = ticket; loading = true;
    try { const r = await api('graph?' + params()); if (my !== ticket) return; commits = commits.concat(r.commits); total = r.total; layout = filtersOn() ? null : layoutGraph(commits); paint(); } finally { loading = false; }
  }
  async function reload() {
    const my = ++ticket; commits = []; loading = true; paintChips();
    try {
      const r = await api('graph?' + params()); if (my !== ticket) return;
      commits = r.commits; total = r.total;
      author.replaceChildren(new Option('todos', '')); r.authors.forEach((/** @type {string} */ a) => author.append(new Option(a, a))); author.value = F.author;
      paint(true);
      if (!S.commitSel || (S.commitSel !== 'WIP' && S.commitSel !== 'CMP' && !commits.length)) S.commitSel = !wt.clean ? 'WIP' : commits[0]?.sha || '';
      detail();
    } finally { loading = false; }
  }

  // ----- seleção e painel direito -----
  const wipRow = () => {
    wipBox.replaceChildren(); if (wt.clean) return;
    const w = h('div', 'wip' + (S.commitSel === 'WIP' ? ' on' : '')), n = wt.groups.staged.length + wt.groups.unstaged.length + wt.groups.untracked.length, d = h('div', 'grow');
    w.tabIndex = 0; d.append(h('b', '', n + ' arquivo(s) não commitado(s)'), h('div', 'small muted', `${wt.groups.staged.length} preparado(s) · ${wt.groups.unstaged.length} não preparado(s) · ${wt.groups.untracked.length} novo(s)`));
    w.append(d); w.onclick = () => select('WIP'); w.onkeydown = e => { if (e.key === 'Enter') select('WIP'); }; wipBox.append(w);
  };
  const cb = { select: (/** @type {string} */ sha) => select(sha), timeline: () => go('linha-do-tempo'),
    review: async (/** @type {string} */ sha) => { const r = await api('runs', 'POST', { agent: 'garcom-revisor', prompt: 'Revise este commit: isolamento por restaurante (tenant), tratamento de erros, transações e o estilo simples do projeto. Liste os achados por gravidade.', attach: [{ type: 'commit', sha }], budget: 0.5 }); S.sel = r.id; S.selTeam = null; go('conversa'); } };
  /** Acrescenta ao detalhe o CI do commit, "Abrir no GitHub" e o PR de cada branch que o contém (os dados vêm do gh). @param {string} sha */
  function githubExtras(sha) {
    const row = right.querySelector('.cd-meta'); if (!gh || !row || right.querySelector('.gh-extra')) return;
    const run = gh.runs_by_sha[sha], box = h('span', 'row gh-extra'); box.style.gap = 'var(--s2)';
    if (run) { const b = ghLink(run.url, run.workflow, 'btn sm ghost'); b.prepend(ciBadge(runState(run)), document.createTextNode(' ')); b.title = 'Execução do Actions deste commit'; box.append(b); }
    box.append(ghLink(`https://github.com/${gh.repo}/commit/${sha}`, 'Abrir no GitHub', 'btn sm ghost'));
    const seen = new Set(); right.querySelectorAll('.ref').forEach(t => { const p = prOf(t.textContent || ''); if (p && !seen.has(p.number)) { seen.add(p.number); box.append(prChip(p)); } });
    row.append(box);
  }
  const detail = guard(async () => {
    wipRow();
    if (S.commitSel === 'WIP' && !wt.clean) await renderWip(right, wt);
    else if (S.commitSel === 'CMP') renderCompare(right, br.map((/** @type {any} */ x) => x.name), cb);
    else if (S.commitSel) { await renderCommitDetail(right, S.commitSel, cb); githubExtras(S.commitSel); }
    else right.replaceChildren(emptyState('Nenhum commit com estes filtros.'));
  });
  /** @param {string} sha */
  function select(sha) {
    S.commitSel = sha; paint();
    const i = shown.findIndex(c => c.sha === sha);
    if (i >= 0 && (i * ROW < scroller.scrollTop || (i + 1) * ROW > scroller.scrollTop + scroller.clientHeight)) { scroller.scrollTop = Math.max(0, i * ROW - scroller.clientHeight / 3); }
    detail();
  }

  // ----- eventos -----
  q.oninput = () => { F.q = q.value; paint(true); };
  branch.onchange = () => { F.branch = branch.value; reload(); };
  author.onchange = () => { F.author = author.value; reload(); };
  let tm = 0; path.oninput = () => { clearTimeout(tm); tm = window.setTimeout(() => { F.path = path.value.trim().replace(/^\/+/, ''); reload().catch(e => { if (!isAbort(e)) toast(e.message, true); }); }, 400); };
  since.onchange = () => { F.since = since.value; reload(); }; until.onchange = () => { F.until = until.value; reload(); };
  cmp.onclick = () => select('CMP');
  const key = (/** @type {KeyboardEvent} */ e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key) || /INPUT|TEXTAREA|SELECT/.test(/** @type {HTMLElement} */ (e.target).tagName || '')) return;
    e.preventDefault(); const i = shown.findIndex(c => c.sha === S.commitSel), n = shown[Math.max(0, Math.min(shown.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) select(n.sha);
  };
  document.addEventListener('keydown', key); S.timers.push({ remove: () => document.removeEventListener('keydown', key) });
  S.timers.push(watch('git', async () => {
    Object.assign(wt, await api('worktree', 'GET', undefined, { global: true })); wipRow();
    const top = (await api('graph?limit=1', 'GET', undefined, { global: true })).commits[0];
    if (top && commits.length && top.sha !== commits[0].sha && !loading) await reload();  // commit novo: refaz a lista
    else if (S.commitSel === 'WIP') detail();
  }, 20_000));

  const dica = h('div', 'small faint'); dica.style.marginTop = 'var(--s3)'; dica.textContent = 'Atalhos: ↑ ↓ trocam de commit · j k trocam de arquivo no diff · n p pulam entre trechos alterados.'; main.append(dica);
  api('gh/overview').then(r => { if (!r.unavailable) { gh = r; paint(); githubExtras(S.commitSel); } }).catch(() => { /* sem GitHub: a tela segue normal */ });
  await reload();
}
