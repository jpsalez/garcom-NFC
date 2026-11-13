// @ts-check
import { api } from '../api.js';
import { h } from '../lib/dom.js';
import { ago } from '../lib/format.js';
import { S } from '../store.js';
import { diffKeys, diffView } from './diff-view.js';
import { emptyState } from './empty-state.js';
import { md } from './markdown.js';
import { skeleton } from './skeleton.js';
import { guard, toast } from './toast.js';

const enc = encodeURIComponent;
let seq = 0;

/** @param {string} text */
const toLines = text => { const l = text.split('\n'); if (l.length && l[l.length - 1] === '') l.pop(); return l; };
/** @param {string} sha @returns {(p: string) => Promise<string[] | null>} */
const blobLines = sha => p => api(`blob?sha=${sha}&path=${enc(p)}`).then(r => toLines(r.text));

/**
 * Arquivos do commit em árvore por pasta (pastas com um só filho são juntadas), com +/− e barra proporcional.
 * @param {{ path: string, add: number, del: number }[]} files @param {(path: string) => void} onPick
 */
export function filesTree(files, onPick) {
  /** @typedef {{ name: string, kids: Map<string, any>, file: any }} N */
  /** @type {N} */ const root = { name: '', kids: new Map(), file: null };
  files.forEach(f => { let n = root; f.path.split('/').forEach(seg => { if (!n.kids.has(seg)) n.kids.set(seg, { name: seg, kids: new Map(), file: null }); n = n.kids.get(seg); }); n.file = f; });
  const mx = Math.max(1, ...files.map(f => f.add + f.del)), box = h('div', 'ftree');
  /** @param {N} n @returns {{ add: number, del: number }} */
  const sum = n => (n.file ? n.file : [...n.kids.values()].reduce((a, k) => { const s = sum(k); return { add: a.add + s.add, del: a.del + s.del }; }, { add: 0, del: 0 }));
  /** @param {N} n @param {number} depth */
  function draw(n, depth) {
    for (const k of [...n.kids.values()].sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name))) {
      let node = k, label = k.name;
      while (!node.file && node.kids.size === 1) { node = [...node.kids.values()][0]; label += '/' + node.name; }
      if (node.file) {
        const f = node.file, r = h('div', 'frow'); r.style.paddingLeft = 6 + depth * 14 + 'px'; r.title = f.path;
        const bar = h('div', 'fbar'), a = h('i', 'a'), d = h('i', 'd'); a.style.width = f.add / mx * 100 + '%'; d.style.width = f.del / mx * 100 + '%'; bar.append(a, d);
        r.append(h('span', 'nm', label), bar, h('span', 'pm', `+${f.add} −${f.del}`)); r.onclick = () => onPick(f.path); box.append(r);
      } else {
        const s = sum(node), r = h('div', 'fdir'); r.style.paddingLeft = 6 + depth * 14 + 'px'; r.append(h('span', '', label + '/'), h('span', 'pm', `+${s.add} −${s.del}`)); box.append(r); draw(node, depth + 1);
      }
    }
  }
  draw(root, 0); return box;
}

/** Abre (e rola até) o diff de um arquivo dentro do diffView. @param {HTMLElement} dv @param {string} path */
function pick(dv, path) {
  const fh = [...dv.querySelectorAll('.dv-fh')].find(x => x.querySelector('.nm')?.textContent === path);
  if (!fh) return; if (fh.getAttribute('aria-expanded') !== 'true') /** @type {HTMLElement} */ (fh).click();
  fh.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/**
 * Painel de um commit: cabeçalho, mensagem, árvore de arquivos, ações e diff.
 * @param {HTMLElement} box @param {string} sha
 * @param {{ select: (sha: string) => void, review: (sha: string) => void, timeline: () => void }} cb
 */
export async function renderCommitDetail(box, sha, cb) {
  const mine = ++seq; box.replaceChildren(skeleton(7));
  const [info, d] = await Promise.all([api('commit/info?sha=' + sha), api('commit?sha=' + sha)]); if (mine !== seq) return;
  box.replaceChildren(); box.append(h('h3', '', info.subject));
  box.append(h('div', 'hint', `${info.author} · ${new Date(info.t).toLocaleString('pt-BR')} · ${ago(info.ts)} atrás`));
  const chips = h('div', 'row'); chips.style.margin = '8px 0';
  const copy = h('button', 'chipb', info.short + ' ⧉'); copy.title = 'Copiar o sha completo'; copy.onclick = () => { navigator.clipboard?.writeText(info.sha); toast('sha copiado'); }; chips.append(copy);
  info.parents.forEach((/** @type {string} */ p) => { const b = h('button', 'chipb', 'pai ' + p.slice(0, 7)); b.title = 'Abrir o commit pai'; b.onclick = () => cb.select(p); chips.append(b); });
  info.branches.forEach((/** @type {string} */ b) => chips.append(h('span', 'tag ref', b)));
  if (info.parents.length > 1) chips.append(h('span', 'tag ai1', 'merge'));
  box.append(chips);
  if (info.body) { const m = md(info.body); m.classList.add('cbody'); box.append(m); }
  const dv = diffView(d.diff, { open: 2, loadLines: blobLines(info.sha) });
  box.append(h('div', 'ctx-h', `${info.files.length} arquivo(s) alterado(s)`), filesTree(info.files, p => pick(dv, p)));
  const acts = h('div', 'row'); acts.style.margin = '10px 0';
  const rv = h('button', 'btn p sm', 'Pedir revisão ao revisor'); rv.title = 'Gasta tokens (teto US$ 0,50)'; rv.onclick = guard(() => cb.review(info.sha));
  const at = h('button', 'btn sm', 'Anexar ao contexto'); at.onclick = () => { S.draft.push({ type: 'commit', sha: info.sha }); toast('commit anexado'); };
  const tl = h('button', 'btn sm', 'Linha do tempo'); tl.onclick = cb.timeline; acts.append(rv, at, tl);
  box.append(acts, dv); if (d.truncated) box.append(h('div', 'hint', 'diff truncado (muito grande)'));
  S.timers.push(diffKeys(dv)); box.scrollTop = 0;
}

/**
 * Alterações não commitadas, separadas em staged / não staged / novos, com o diff de cada arquivo.
 * @param {HTMLElement} box @param {{ branch: string, ahead: number, behind: number, groups: Record<'staged' | 'unstaged' | 'untracked', any[]> }} wt
 */
export async function renderWip(box, wt) {
  const mine = ++seq; box.replaceChildren(); box.append(h('h3', '', 'Alterações não commitadas'));
  box.append(h('div', 'hint', wt.branch + (wt.ahead ? ' · ↑' + wt.ahead : '') + (wt.behind ? ' · ↓' + wt.behind : '')));
  const dd = h('div'), lists = h('div', 'ftree');
  const titles = { staged: 'Preparadas (staged)', unstaged: 'Não preparadas', untracked: 'Novas (não rastreadas)' };
  /** @type {HTMLElement | null} */ let first = null;
  (/** @type {const} */ (['staged', 'unstaged', 'untracked'])).forEach(kind => {
    const list = wt.groups[kind]; if (!list.length) return;
    lists.append(h('div', 'fdir', `${titles[kind]} (${list.length})`));
    list.forEach(f => {
      const r = h('div', 'frow'); r.append(h('span', 'nm', f.path), h('span', 'tag ai2', f.status), h('span', 'pm', `+${f.add} −${f.del}`)); r.title = f.path;
      r.onclick = guard(async () => {
        lists.querySelectorAll('.frow.on').forEach(x => x.classList.remove('on')); r.classList.add('on'); dd.replaceChildren(skeleton(4));
        const x = await api(`worktree/diff?path=${enc(f.path)}&kind=${kind}`); if (mine !== seq) return;
        const dv = diffView(x.diff, { open: 1, loadLines: kind === 'untracked' ? undefined : p => api('file?path=' + enc(p)).then(t => toLines(t.text)) }); dd.replaceChildren(dv); S.timers.push(diffKeys(dv));
      });
      lists.append(r); first ??= r;
    });
  });
  box.append(lists, dd); first?.click();
}

/**
 * Comparar dois pontos (branch, tag ou sha): commits que B tem a mais e o diff `A...B`.
 * @param {HTMLElement} box @param {string[]} refs @param {{ select: (sha: string) => void }} cb @param {{ a?: string, b?: string }} [pre]
 */
export function renderCompare(box, refs, cb, pre = {}) {
  box.replaceChildren(); box.append(h('h3', '', 'Comparar'), h('div', 'hint', 'Mostra o que B tem a mais que A, a partir do ancestral comum (git diff A...B).'));
  const form = h('div', 'row'); form.style.margin = '10px 0';
  const dl = h('datalist'); dl.id = 'cmp-refs'; refs.forEach(r => dl.append(Object.assign(h('option'), { value: r })));
  /** @param {string} label @param {string} v */
  const field = (label, v) => { const i = h('input'); i.type = 'text'; i.setAttribute('list', 'cmp-refs'); i.value = v; i.placeholder = label; i.style.width = '170px'; i.setAttribute('aria-label', label); return i; };
  const a = field('A (base)', pre.a || 'origin/main'), b = field('B (comparado)', pre.b || 'main'), go = h('button', 'btn p sm', 'Comparar');
  const out = h('div'); form.append(a, h('span', 'dim', '...'), b, go, dl); box.append(form, out);
  const run = guard(async () => {
    out.replaceChildren(skeleton(4)); const r = await api(`compare?a=${enc(a.value.trim())}&b=${enc(b.value.trim())}`);
    out.replaceChildren(h('div', 'hint', `${r.commits.length} commit(s) em ${r.b} que não estão em ${r.a}`));
    r.commits.forEach((/** @type {any} */ c) => { const row = h('button', 'hrow'); row.append(h('b', '', c.subject), h('span', '', `${c.short} · ${c.author} · ${ago(c.ts)}`)); row.onclick = () => cb.select(c.sha); out.append(row); });
    if (!r.commits.length && !r.diff.trim()) { out.append(emptyState('Sem diferenças', 'Os dois pontos têm o mesmo conteúdo.')); return; }
    const dv = diffView(r.diff, { open: 2, loadLines: blobLines(r.b_sha) }); out.append(dv); S.timers.push(diffKeys(dv));
  });
  go.onclick = run; if (pre.a && pre.b) run();
}
