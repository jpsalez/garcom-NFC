// @ts-check
import { watch } from '../lib/realtime.js';
import { api, isAbort } from '../api.js';
import { $, h } from '../lib/dom.js';
import { ago } from '../lib/format.js';
import { go } from '../router.js';
import { S } from '../store.js';
import { activityCards } from '../ui/activity.js';
import { renderCommitDetail, renderCompare, renderWip } from '../ui/commit-detail.js';
import { LANE_COLORS, graphSvg, layoutGraph } from '../ui/commit-graph.js';
import { emptyState } from '../ui/empty-state.js';
import { ciBadge, ghLink, runState } from '../ui/gh-common.js';
import { guard, toast } from '../ui/toast.js';

const ROW = 46, OVER = 6, PAGE = 400;
/** Filtros mantidos entre visitas à tela. Os cinco últimos vão para o servidor; `flt` e `q` filtram o que já foi carregado. */
const F = { flt: 'todos', q: '', branch: '', author: '', path: '', since: '', until: '' };
const SERVER_FILTERS = /** @type {const} */ (['branch', 'author', 'path', 'since', 'until']);

/** @typedef {{ sha: string, short: string, parents: string[], author: string, t: string, ts: number, refs: { name: string, kind: string, current: boolean }[], subject: string, add: number, del: number, nfiles: number, tests: boolean, merge: boolean }} GCommit */

export async function renderCommits() {
  const main = $('#main'); main.className = ''; main.replaceChildren();
  const [act, wt, br] = await Promise.all([api('activity?days=84'), api('worktree'), api('branches')]);
  const top = h('div', 'bento'); top.append(...activityCards(act)); main.append(top);

  // ----- filtros -----
  const bar = h('div', 'row'); bar.style.margin = '16px 0 8px';
  const seg = h('div', 'seg'); [['todos', 'Todos'], ['semtestes', 'Sem testes'], ['merge', 'Merges']].forEach(([k, l]) => { const b = h('button', F.flt === k ? 'on' : '', l); b.onclick = () => { F.flt = k; seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); paint(true); }; seg.append(b); });
  const q = h('input'); q.type = 'text'; q.placeholder = 'mensagem, autor ou sha…'; q.value = F.q; q.style.width = '210px'; q.setAttribute('aria-label', 'Buscar nos commits carregados');
  const cmp = h('button', 'btn sm', 'Comparar…'); cmp.title = 'Comparar dois branches, tags ou commits';
  bar.append(seg, q, cmp);
  const adv = h('div', 'row'); adv.style.cssText = 'gap:8px;margin-bottom:8px';
  const author = h('select'); author.setAttribute('aria-label', 'Filtrar por autor');
  const path = h('input'); path.type = 'text'; path.placeholder = 'pasta ou arquivo (ex.: back-end/src)'; path.value = F.path; path.style.width = '250px'; path.setAttribute('aria-label', 'Filtrar por pasta ou arquivo');
  const since = h('input'), until = h('input'); [since, until].forEach((d, i) => { d.type = 'date'; d.value = i ? F.until : F.since; d.setAttribute('aria-label', i ? 'até a data' : 'a partir da data'); });
  const clear = h('button', 'btn sm', 'Limpar filtros'); adv.append(h('span', 'hint', 'Autor'), author, path, h('span', 'hint', 'de'), since, h('span', 'hint', 'até'), until, clear);
  const chips = h('div', 'row'); chips.style.cssText = 'gap:6px;margin-bottom:6px';
  [{ name: '', label: 'todos os ramos' }, ...br.filter((/** @type {any} */ x) => !x.remote).concat(br.filter((/** @type {any} */ x) => x.remote)).map((/** @type {any} */ x) => ({ name: x.name, label: x.name }))].forEach(x => {
    const b = h('button', 'chipb' + (F.branch === x.name ? ' on' : ''), x.label); b.onclick = () => { F.branch = x.name; chips.querySelectorAll('.chipb').forEach(y => y.classList.toggle('on', y === b)); reload(); }; chips.append(b);
  });
  const status = h('div', 'hint'); status.style.marginBottom = '8px'; main.append(bar, adv, chips, status);

  // ----- lista (virtualizada) e detalhe -----
  const g = h('div', 'bento'), left = h('div', 'card s7 cl-card'), right = h('div', 'card s5 cd-card dv-scroll'); g.append(left, right); main.append(g);
  const wipBox = h('div'); const scroller = h('div', 'cl-scroll'), spacer = h('div', 'cl-spacer'), win = h('div', 'cl-win'); spacer.append(win); scroller.append(spacer); left.append(wipBox, scroller);
  scroller.tabIndex = 0; scroller.setAttribute('aria-label', 'Lista de commits (↑ ↓ navegam)');
  /** @type {GCommit[]} */ let commits = []; let total = 0, loading = false, ticket = 0;
  /** Resposta de /api/gh/overview (CI por commit e PR por branch); fica nula sem gh instalado/autenticado. @type {any} */ let gh = null;
  /** PR de um nome de branch (local ou origin/…). @param {string} name */
  const prOf = name => gh && gh.prs_by_branch[name.replace(/^origin\//, '')];
  /** @param {{ number: number, state: string, url: string }} p */
  const prChip = p => { const a = ghLink(p.url, 'PR #' + p.number, 'tag gh-pr ' + p.state.toLowerCase()); a.title = 'Abrir o pull request no GitHub'; a.onclick = e => e.stopPropagation(); return a; };
  /** @type {ReturnType<typeof layoutGraph> | null} */ let layout = null;
  /** @type {GCommit[]} */ let shown = [];

  const filtersOn = () => F.flt !== 'todos' || !!F.q || !!(F.author || F.path || F.since || F.until);
  const visible = () => {
    const t = F.q.trim().toLowerCase();
    return commits.filter(c => (F.flt === 'semtestes' ? !c.tests : F.flt === 'merge' ? c.merge : true) && (!t || c.subject.toLowerCase().includes(t) || c.author.toLowerCase().includes(t) || c.sha.startsWith(t)));
  };

  /** @param {GCommit} c @param {number} i */
  function row(c, i) {
    const r = h('div', 'crow' + (c.sha === S.commitSel ? ' on' : '')); r.style.height = ROW + 'px'; r.dataset.sha = c.sha; r.setAttribute('role', 'button');
    if (layout) r.append(graphSvg(layout.rows[i], layout.maxLanes, ROW)); else { const d = h('span', 'cdot'); r.append(d); }
    const sj = h('div', 'sj'), t = h('b', '', c.subject), mt = h('div', 'mt');
    const refs = h('span', 'refs'); c.refs.slice(0, 3).forEach(x => { const k = h('span', 'tag ' + (x.kind === 'tag' ? 'tg' : x.kind === 'remote' ? 'no' : 'br') + (x.current ? ' cur' : ''), (x.current ? '● ' : '') + x.name); if (layout && x.kind === 'branch') k.style.color = LANE_COLORS[layout.rows[i].color % LANE_COLORS.length]; refs.append(k); });
    const seen = new Set(); c.refs.forEach(x => { const p = x.kind !== 'tag' && prOf(x.name); if (p && !seen.has(p.number)) { seen.add(p.number); refs.append(prChip(p)); } });
    const run = gh && gh.runs_by_sha[c.sha]; mt.append(...(run ? [ciBadge(runState(run))] : []), h('span', 'mono', c.short), h('span', '', c.author + ' · ' + ago(c.ts)), refs); if (!c.tests && c.nfiles !== 0) mt.append(h('span', 'tag no', 'sem testes')); sj.append(t, mt);
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
    if (b >= shown.length - 8 && commits.length < total && !loading) more();
  }
  let raf = 0; scroller.onscroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => paint()); };

  function params() {
    const p = new URLSearchParams({ limit: String(PAGE), skip: String(commits.length) });
    SERVER_FILTERS.forEach(k => { if (F[k]) p.set(k, F[k]); }); return p;
  }
  async function more() {
    const my = ticket; loading = true;
    try { const r = await api('graph?' + params()); if (my !== ticket) return; commits = commits.concat(r.commits); total = r.total; layout = filtersOn() ? null : layoutGraph(commits); paint(); } finally { loading = false; }
  }
  const ticketBusy = () => loading;
  async function reload() {
    const my = ++ticket; commits = []; loading = true;
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
    const w = h('div', 'wip' + (S.commitSel === 'WIP' ? ' on' : '')); const n = wt.groups.staged.length + wt.groups.unstaged.length + wt.groups.untracked.length;
    const d = h('div', 'grow'); d.append(h('b', '', n + ' arquivo(s) não commitado(s)'), h('div', 'hint', `${wt.groups.staged.length} preparado(s) · ${wt.groups.unstaged.length} não preparado(s) · ${wt.groups.untracked.length} novo(s)`));
    w.append(h('span', 'tag ai2', 'não commitado'), d); w.onclick = () => select('WIP'); wipBox.append(w);
  };
  const cb = { select: (/** @type {string} */ sha) => select(sha), timeline: () => go('linha-do-tempo'),
    review: async (/** @type {string} */ sha) => { const r = await api('runs', 'POST', { agent: 'garcom-revisor', prompt: 'Revise este commit: isolamento por restaurante (tenant), tratamento de erros, transações e o estilo simples do projeto. Liste os achados por gravidade.', attach: [{ type: 'commit', sha }], budget: 0.5 }); S.sel = r.id; S.selTeam = null; go('conversa'); } };
  /** Acrescenta ao detalhe o CI do commit, "Abrir no GitHub" e o PR de cada branch que o contém (os dados vêm do gh). @param {string} sha */
  function githubExtras(sha) {
    const row = right.querySelector('.row'); if (!gh || !row || right.querySelector('.gh-extra')) return;
    const run = gh.runs_by_sha[sha], box = h('span', 'row gh-extra'); box.style.gap = '6px';
    if (run) { const b = ghLink(run.url, run.workflow, 'chipb'); b.prepend(ciBadge(runState(run)), document.createTextNode(' ')); b.title = 'Execução do Actions deste commit'; box.append(b); }
    box.append(ghLink(`https://github.com/${gh.repo}/commit/${sha}`, 'Abrir no GitHub', 'chipb'));
    const seen = new Set(); right.querySelectorAll('.tag.ref').forEach(t => { const p = prOf(t.textContent || ''); if (p && !seen.has(p.number)) { seen.add(p.number); box.append(prChip(p)); } });
    row.append(box);
  }
  const detail = guard(async () => {
    wipRow();
    if (S.commitSel === 'WIP' && !wt.clean) await renderWip(right, wt);
    else if (S.commitSel === 'CMP') renderCompare(right, br.map((/** @type {any} */ x) => x.name), cb);
    else if (S.commitSel) { await renderCommitDetail(right, S.commitSel, cb); githubExtras(S.commitSel); }
    else right.replaceChildren(emptyState('Nenhum commit', 'Ajuste os filtros.'));
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
  author.onchange = () => { F.author = author.value; reload(); };
  let tm = 0; path.oninput = () => { clearTimeout(tm); tm = window.setTimeout(() => { F.path = path.value.trim().replace(/^\/+/, ''); reload().catch(e => { if (!isAbort(e)) toast(e.message, true); }); }, 400); };
  since.onchange = () => { F.since = since.value; reload(); }; until.onchange = () => { F.until = until.value; reload(); };
  clear.onclick = () => { Object.assign(F, { flt: 'todos', q: '', branch: '', author: '', path: '', since: '', until: '' }); renderCommits(); };
  cmp.onclick = () => select('CMP');
  const key = (/** @type {KeyboardEvent} */ e) => {
    if (!['ArrowDown', 'ArrowUp'].includes(e.key) || /INPUT|TEXTAREA|SELECT/.test(/** @type {HTMLElement} */ (e.target).tagName || '')) return;
    e.preventDefault(); const i = shown.findIndex(c => c.sha === S.commitSel), n = shown[Math.max(0, Math.min(shown.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) select(n.sha);
  };
  document.addEventListener('keydown', key); S.timers.push({ remove: () => document.removeEventListener('keydown', key) });
  S.timers.push(watch('git', async () => {
    Object.assign(wt, await api('worktree', 'GET', undefined, { global: true })); wipRow();
    const top = (await api('graph?limit=1', 'GET', undefined, { global: true })).commits[0];
    if (top && commits.length && top.sha !== commits[0].sha && !ticketBusy()) await reload();  // commit novo: refaz a lista
    else if (S.commitSel === 'WIP') detail();
  }, 20_000));

  main.insertBefore(h('div', 'hint', 'Atalhos: ↑ ↓ trocam de commit · j k trocam de arquivo no diff · n p pulam entre trechos alterados.'), g);
  api('gh/overview').then(r => { if (!r.unavailable) { gh = r; paint(); githubExtras(S.commitSel); } }).catch(() => { /* sem GitHub: a tela segue normal */ });
  await reload();
}
