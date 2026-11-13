// @ts-check
import { watch } from '../lib/realtime.js';
import { api, isAbort } from '../api.js';
import { $, h } from '../lib/dom.js';
import { ago } from '../lib/format.js';
import { highlightLines } from '../lib/highlight.js';
import { LANG_LABEL, langOf } from '../lib/lang.js';
import { go, hashParams, setHashParams } from '../router.js';
import { S } from '../store.js';
import { badge } from '../ui/badge.js';
import { button } from '../ui/button.js';
import { codeView } from '../ui/code-view.js';
import { diffView } from '../ui/diff-view.js';
import { emptyState } from '../ui/empty-state.js';
import { errorState } from '../ui/error-state.js';
import { contextPanel } from '../ui/file-context.js';
import { fileTree } from '../ui/file-tree.js';
import { md } from '../ui/markdown.js';
import { skeleton } from '../ui/skeleton.js';
import { guard, toast } from '../ui/toast.js';
import { updFoot } from './conversa.js';

const STATUS_LABEL = { M: 'modificado', A: 'adicionado', D: 'apagado', '?': 'novo (não rastreado)' };
const enc = encodeURIComponent;

/** "L=42" ou "L=10-20" → [10, 20]. @param {string | null} v */
function parseRange(v) {
  const m = (v || '').match(/^(\d+)(?:-(\d+))?$/); if (!m) return null;
  const a = Number(m[1]), b = m[2] ? Number(m[2]) : a; return /** @type {[number, number]} */ ([Math.min(a, b), Math.max(a, b)]);
}
/** @param {[number, number] | null} r */
const rangeParam = r => (r ? (r[0] === r[1] ? String(r[0]) : r[0] + '-' + r[1]) : '');

/** Lista de commits do arquivo; ao clicar, mostra o diff daquele commit só para este arquivo. @param {string} path */
async function historyPanel(path) {
  const box = h('div', 'hist'), list = h('div', 'hist-list'), diff = h('div', 'hist-diff'); box.append(list, diff);
  const { commits } = await api('filelog?path=' + enc(path));
  if (!commits.length) { diff.append(emptyState('Sem histórico', 'O arquivo ainda não foi commitado.')); return box; }
  /** @type {HTMLElement | null} */ let on = null;
  const open = guard(async (/** @type {any} */ c, /** @type {HTMLElement} */ row) => {
    on?.classList.remove('on'); on = row; row.classList.add('on'); diff.replaceChildren(skeleton(5));
    const d = await api('commit?sha=' + c.sha + '&path=' + enc(path));
    diff.replaceChildren(h('div', 'small muted', `${c.short} · ${c.author} · ${new Date(c.t).toLocaleString('pt-BR')}`), diffView(d.diff, 1));
  });
  commits.forEach((/** @type {any} */ c) => { const r = h('button', 'hrow'); r.append(h('b', '', c.subject), h('span', '', `${c.short} · ${c.author} · ${ago(c.ts)}`)); r.onclick = () => open(c, r); list.append(r); });
  open(commits[0], /** @type {HTMLElement} */ (list.firstElementChild));
  return box;
}

/**
 * Barra superior do arquivo: caminho, linguagem, tamanho, último commit, status git e ações.
 * @param {{ path: string, f: any, meta: any, lines: number, show: (v: 'code' | 'md' | 'history') => void, cv: ReturnType<typeof codeView>, blame: () => Promise<boolean> }} o
 */
function toolbar({ path, f, meta, lines, show, cv, blame }) {
  const bar = h('div', 'fhead');
  const crumb = h('div', 'crumb'); path.split('/').forEach((seg, i, all) => { if (i) crumb.append(h('i', '', '›')); crumb.append(h(i === all.length - 1 ? 'b' : 'span', '', seg)); });
  const info = h('div', 'meta'); const lang = langOf(path);
  info.append(h('span', '', LANG_LABEL[/** @type {keyof typeof LANG_LABEL} */ (lang)] || lang || 'texto'), h('span', 'mono', `${lines} linhas`), h('span', 'mono', (f.size / 1024).toFixed(1) + ' KB'));
  if (meta.status) info.append(badge(STATUS_LABEL[/** @type {'M'} */ (meta.status)], meta.status === 'D' ? 'err' : 'warn'));
  const lc = meta.last_commit;
  if (lc) info.append(button(`${lc.short} · ${ago(Date.parse(lc.t) / 1000)}`, { variant: 'ghost', small: true, title: lc.subject + ' — ' + lc.author, onClick: () => { S.commitSel = lc.sha; go('commits'); } }));
  if (f.truncated) info.append(badge('truncado em 200 KB', 'warn'));
  const acts = h('div', 'acts');
  /** @param {string} label @param {string} icon @param {(b: HTMLElement) => any} fn @param {string} [title] */
  const btn = (label, icon, fn, title) => { const b = button(label, { small: true, icon, title }); b.onclick = guard(() => fn(b)); acts.append(b); return b; };
  btn('Blame', 'person', async b => b.classList.toggle('on', await blame()), 'Quem mexeu em cada linha');
  const hi = btn('Histórico', 'history', b => { const on = !b.classList.contains('on'); b.classList.toggle('on', on); show(on ? 'history' : 'code'); }, 'Commits que mexeram neste arquivo');
  if (lang === 'markdown') { const mdBtn = btn('Renderizado', 'filetext', b => { const on = !b.classList.contains('on'); b.classList.toggle('on', on); hi.classList.remove('on'); show(on ? 'md' : 'code'); }); if (!hashParams().get('L')) { mdBtn.classList.add('on'); show('md'); } }
  const wr = btn('Quebrar linha', 'wrap', b => { const on = cv.setWrap(!b.classList.contains('on')); b.classList.toggle('on', on); }, cv.virtual ? 'indisponível em arquivos muito grandes' : 'Quebra linhas longas');
  if (cv.virtual) wr.setAttribute('disabled', '');
  btn('Copiar caminho', 'copy', () => { navigator.clipboard?.writeText(path); toast('caminho copiado'); });
  btn('Copiar trecho', 'copy', () => { navigator.clipboard?.writeText(cv.selectedText()); toast(cv.range ? 'linhas copiadas' : 'arquivo copiado'); }, 'Copia as linhas selecionadas (ou o arquivo todo)');
  btn('Anexar', 'clip', () => { S.draft.push({ type: 'file', path }); updFoot(); toast('anexado: ' + path); }, 'Anexar ao contexto dos agentes');
  const gh = /** @type {HTMLAnchorElement} */ (button('GitHub', { small: true, icon: 'external', href: '#' })); gh.target = '_blank'; gh.rel = 'noopener noreferrer'; gh.removeAttribute('href');
  const ok = meta.github && !['?', 'A'].includes(meta.status);
  gh.setAttribute('aria-disabled', ok ? 'false' : 'true'); gh.title = ok ? 'Abrir este arquivo no GitHub' : 'O arquivo ainda não está no GitHub';
  if (ok) gh.href = `${meta.github.url}/blob/${meta.github.branch}/${path}`;
  acts.append(gh);
  bar.append(crumb, info, acts);
  return { bar, gh, ghBase: ok ? `${meta.github.url}/blob/${meta.github.branch}/${path}` : '' };
}

export async function renderProjeto() {
  const main = $('#main'); main.className = 'flush files-premium'; main.replaceChildren();
  const grid = h('div', 'files3'), treeCol = h('aside', 'pane'), codeCol = h('section', 'pane'), ctxCol = h('aside', 'pane ctxpane');
  treeCol.setAttribute('aria-label', 'Árvore de arquivos'); ctxCol.setAttribute('aria-label', 'Contexto do arquivo');
  grid.append(treeCol, codeCol, ctxCol); main.append(grid);
  codeCol.append(h('div', 'fempty', ''));
  const tree = fileTree({ onOpen: (p, line) => openFile(p, line ? [line, line] : null) });
  treeCol.append(tree.el);
  let token = 0;

  /** @param {string} path @param {[number, number] | null} [range] */
  async function openFile(path, range = null) {
    const mine = ++token;
    codeCol.replaceChildren(skeleton(8)); ctxCol.replaceChildren(); tree.select(path); setHashParams({ path, L: rangeParam(range) });
    /** @type {any[]} */ let r;
    try { r = await Promise.all([api('file?path=' + enc(path)), api('file/meta?path=' + enc(path))]); } catch (e) {
      if (isAbort(e) || mine !== token) return;
      const msg = e instanceof Error ? e.message : String(e);
      codeCol.replaceChildren(msg.includes('não é texto') ? emptyState('Arquivo não é texto', 'Binários e tipos desconhecidos não têm visualização.') : errorState(e, () => openFile(path, range))); return;
    }
    const [f, meta] = r; if (mine !== token) return;
    const lines = f.text.split('\n'); if (lines.length && lines[lines.length - 1] === '') lines.pop();
    const html = await highlightLines(f.text, langOf(path)); if (mine !== token) return;
    /** @type {{ bar: HTMLElement, gh: HTMLAnchorElement, ghBase: string }} */ let tb;
    const cv = codeView({ lines, html, path, href: n => `#arquivos?path=${path}&L=${n}`, onCommit: sha => { S.commitSel = sha; go('commits'); },
      onRange: (a, b) => { setHashParams({ path, L: rangeParam([a, b]) }); if (tb.ghBase) tb.gh.href = tb.ghBase + `#L${a}` + (b > a ? `-L${b}` : ''); } });
    const area = h('div', 'fbody');
    /** @type {HTMLElement | null} */ let extra = null;
    /** @param {'code' | 'md' | 'history'} v */
    const show = async v => {
      extra?.remove(); extra = null; cv.el.hidden = v !== 'code';
      if (v === 'md') extra = /** @type {HTMLElement} */ (md(f.text));
      if (v === 'history') extra = await historyPanel(path);
      if (extra) area.append(extra);
    };
    let blamed = false;
    const blame = async () => { if (blamed) { cv.setBlame(null); blamed = false; return false; } cv.setBlame((await api('blame?path=' + enc(path))).groups); blamed = true; return true; };
    tb = toolbar({ path, f, meta, lines: lines.length, show, cv, blame });
    area.append(cv.el);
    codeCol.replaceChildren(tb.bar, area);
    if (range) { cv.setRange(range[0], range[1]); requestAnimationFrame(() => cv.reveal(range[0])); }
    ctxCol.replaceChildren(contextPanel(meta, { open: p => openFile(p), goTasks: () => go('tarefas') }));
    tree.reveal(path);
  }

  const refresh = async () => tree.setStatus((await api('gitstatus')).files);
  await tree.load(); await refresh(); S.timers.push(watch('git', refresh, 20_000));
  const prm = hashParams(), start = prm.get('path');
  if (start) await openFile(start, parseRange(prm.get('L')));
  else codeCol.replaceChildren(emptyState('Escolha um arquivo', 'Use a árvore ou o filtro. Enter no filtro busca dentro dos arquivos. Setas ↑ ↓ → ← navegam na árvore.'));
}
