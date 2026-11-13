// @ts-check
import { api } from '../api.js';
import { h, ico } from '../lib/dom.js';
import { guard } from './toast.js';

const ICON_EXT = { ts: ['filecode', 'ft-ts'], tsx: ['filecode', 'ft-ts'], js: ['filecode', 'ft-js'], mjs: ['filecode', 'ft-js'], py: ['filecode', 'ft-py'], sh: ['filecode', 'ft-py'],
  json: ['fileconf', 'ft-cfg'], yml: ['fileconf', 'ft-cfg'], yaml: ['fileconf', 'ft-cfg'], toml: ['fileconf', 'ft-cfg'], example: ['fileconf', 'ft-cfg'], test: ['fileconf', 'ft-cfg'],
  md: ['filetext', 'ft-md'], txt: ['filetext', 'ft-md'], prisma: ['filedb', 'ft-db'], sql: ['filedb', 'ft-db'], css: ['filecode', 'ft-css'], html: ['filecode', 'ft-css'], svg: ['filecode', 'ft-css'] };

/** Ícone e classe de cor pelo tipo do arquivo. @param {string} name @param {boolean} dir @param {boolean} [open] */
export function iconFor(name, dir, open = false) {
  if (dir) return [open ? 'folderopen' : 'folder', 'ft-dir'];
  if (name === 'Dockerfile' || name === 'docker-compose.yml') return ['fileconf', 'ft-docker'];
  return /** @type {Record<string, string[]>} */ (ICON_EXT)[(name.split('.').pop() || '').toLowerCase()] || ['file', 'ft-def'];
}

/** @param {SVGElement} svg @param {string} cls */
const tint = (svg, cls) => { svg.classList.add(cls); return svg; };

/**
 * Árvore de arquivos com status git, contagem por pasta, filtro por nome, busca no conteúdo e teclado.
 * @param {{ onOpen: (path: string, line?: number) => void }} o
 */
export function fileTree({ onOpen }) {
  const el = h('div', 'ft');
  const bar = h('div', 'ft-bar'), q = h('input'); q.type = 'text'; q.placeholder = 'Filtrar por nome · Enter busca no conteúdo'; q.setAttribute('aria-label', 'Filtrar arquivos por nome ou buscar no conteúdo');
  const hint = h('div', 'hint ft-hint'); bar.append(q, hint);
  const tree = h('div', 'ft-list'); tree.tabIndex = 0; tree.setAttribute('role', 'tree'); tree.setAttribute('aria-label', 'Arquivos do projeto');
  const res = h('div', 'ft-res'); res.hidden = true; res.setAttribute('role', 'listbox');
  el.append(bar, tree, res);
  /** @type {Record<string, string>} */ let status = {};
  let selected = '', cur = /** @type {HTMLElement | null} */ (null);

  const rows = () => /** @type {HTMLElement[]} */ ([...(res.hidden ? tree : res).querySelectorAll('.tn, .hitrow')]);
  /** @param {HTMLElement | null} r */
  function focusRow(r) { cur?.classList.remove('foc'); cur = r; if (r) { r.classList.add('foc'); r.scrollIntoView({ block: 'nearest' }); } }

  function paintStatus() {
    tree.querySelectorAll('.tn').forEach(node => {
      const r = /** @type {HTMLElement} */ (node), p = r.dataset.path || '', mark = r.querySelector('.st'); if (!mark) return;
      if (r.dataset.dir) { const n = Object.keys(status).filter(k => k.startsWith(p + '/')).length; mark.textContent = n ? String(n) : ''; mark.className = 'st dirn'; mark.setAttribute('title', n ? n + ' alteração(ões) aqui dentro' : ''); }
      else { const c = status[p] || ''; mark.textContent = c; mark.className = 'st s' + (c === '?' ? 'N' : c); mark.setAttribute('title', { M: 'modificado', A: 'adicionado', D: 'apagado', '?': 'novo (não rastreado)' }[/** @type {'M'} */ (c)] || ''); }
    });
  }

  /** @param {string} dir @param {HTMLElement} box @param {number} level */
  async function expand(dir, box, level) {
    const items = await api('tree?path=' + encodeURIComponent(dir));
    items.forEach((/** @type {{name: string, dir: boolean, path: string}} */ it) => {
      const r = h('div', 'tn'); r.setAttribute('role', 'treeitem'); r.dataset.path = it.path; if (it.dir) { r.dataset.dir = '1'; r.setAttribute('aria-expanded', 'false'); }
      r.style.paddingLeft = 8 + level * 14 + 'px'; r.title = it.path;
      const [ic, cls] = iconFor(it.name, it.dir); r.append(tint(ico(ic), cls), h('span', 'nm', it.name), h('span', 'st'));
      const kids = h('div', 'ft-kids'); box.append(r); if (it.dir) box.append(kids);
      r.onclick = guard(() => { focusRow(r); return it.dir ? toggle(r, kids, it, level) : onOpen(it.path); });
    });
    paintStatus();
  }

  /** @param {HTMLElement} r @param {HTMLElement} kids @param {{name: string, path: string}} it @param {number} level @param {boolean} [force] */
  async function toggle(r, kids, it, level, force) {
    const open = force ?? !r.dataset.open;
    if (!open) { kids.replaceChildren(); delete r.dataset.open; r.setAttribute('aria-expanded', 'false'); r.replaceChild(tint(ico('folder'), 'ft-dir'), r.firstChild); return; }
    if (r.dataset.open) return;
    r.dataset.open = '1'; r.setAttribute('aria-expanded', 'true'); r.replaceChild(tint(ico('folderopen'), 'ft-dir'), r.firstChild);
    await expand(it.path, kids, level + 1);
  }

  /** Abre as pastas até o arquivo e o marca como selecionado. @param {string} path */
  async function reveal(path) {
    selected = path; const parts = path.split('/'); let box = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts.slice(0, i + 1).join('/'), r = /** @type {HTMLElement | null} */ (box.querySelector(`:scope > .tn[data-path="${CSS.escape(dir)}"]`)); if (!r) break;
      const kids = /** @type {HTMLElement} */ (r.nextElementSibling);
      if (!r.dataset.open) await toggle(r, kids, { name: parts[i], path: dir }, i, true);
      box = kids;
    }
    mark();
  }
  function mark() {
    tree.querySelectorAll('.tn.on').forEach(x => x.classList.remove('on'));
    const r = /** @type {HTMLElement | null} */ (tree.querySelector(`.tn[data-path="${CSS.escape(selected)}"]`)); if (r) { r.classList.add('on'); r.setAttribute('aria-selected', 'true'); r.scrollIntoView({ block: 'nearest' }); }
  }

  /** Teclado: ↑↓ navegam, → abre pasta, ← fecha, Enter abre o arquivo. */
  tree.onkeydown = guard(async e => {
    const list = rows(), i = cur ? list.indexOf(cur) : -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); focusRow(list[Math.max(0, Math.min(list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]); }
    else if (cur && (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Enter')) {
      e.preventDefault();
      const dir = !!cur.dataset.dir, isOpen = !!cur.dataset.open;
      if (e.key === 'Enter') cur.click();
      else if (e.key === 'ArrowRight' && dir && !isOpen) cur.click();
      else if (e.key === 'ArrowRight' && dir && isOpen) focusRow(/** @type {HTMLElement | null} */ (cur.nextElementSibling?.querySelector('.tn')) || cur);
      else if (e.key === 'ArrowLeft' && dir && isOpen) cur.click();
      else if (e.key === 'ArrowLeft') { const up = cur.parentElement?.previousElementSibling; if (up?.classList.contains('tn')) focusRow(/** @type {HTMLElement} */ (up)); }
    }
  });
  tree.onfocus = () => { if (!cur) focusRow(tree.querySelector('.tn.on') || tree.querySelector('.tn')); };

  // ----- filtro por nome e busca no conteúdo -----
  res.onkeydown = tree.onkeydown;
  const closeResults = () => { res.hidden = true; tree.hidden = false; hint.textContent = ''; cur = null; };
  /** @param {string} text @param {number} col @param {number} len */
  const snippet = (text, col, len) => { const s = h('span', 'snip'); s.append(document.createTextNode(text.slice(0, col)), h('mark', '', text.slice(col, col + len)), document.createTextNode(text.slice(col + len))); return s; };

  /** @param {string} term */
  async function byName(term) {
    const paths = await api('files?q=' + encodeURIComponent(term));
    res.replaceChildren(); tree.hidden = true; res.hidden = false; hint.textContent = paths.length + ' arquivo(s) · Enter para buscar no conteúdo';
    paths.forEach((/** @type {string} */ p) => { const name = p.split('/').pop() || p, [ic, cls] = iconFor(name, false); const r = h('div', 'hitrow'); r.tabIndex = -1; r.dataset.path = p; r.append(tint(ico(ic), cls), h('span', 'nm', name), h('span', 'dim dirp', p.slice(0, p.length - name.length))); r.onclick = () => onOpen(p); r.onkeydown = ev => { if (ev.key === 'Enter') r.click(); }; res.append(r); });
  }

  /** Resultados do conteúdo agrupados por arquivo. @param {string} term */
  async function byContent(term) {
    const hits = await api('search?q=' + encodeURIComponent(term));
    res.replaceChildren(); tree.hidden = true; res.hidden = false;
    /** @type {Map<string, any[]>} */ const g = new Map(); hits.forEach((/** @type {any} */ x) => { if (!g.has(x.path)) g.set(x.path, []); /** @type {any[]} */ (g.get(x.path)).push(x); });
    hint.textContent = `${hits.length} ocorrência(s) em ${g.size} arquivo(s)`;
    g.forEach((list, p) => {
      const name = p.split('/').pop() || p, [ic, cls] = iconFor(name, false), head = h('div', 'hit-file'); head.append(tint(ico(ic), cls), h('b', '', name), h('span', 'dim', p), h('span', 'badge', String(list.length))); res.append(head);
      list.forEach(x => { const r = h('div', 'hitrow'); r.tabIndex = -1; r.append(h('span', 'ln', String(x.line)), snippet(x.text, x.col, x.len)); r.onclick = () => onOpen(p, x.line); r.onkeydown = ev => { if (ev.key === 'Enter') r.click(); }; res.append(r); });
    });
  }

  let timer = 0;
  q.oninput = () => { clearTimeout(timer); timer = window.setTimeout(guard(async () => { if (q.value.trim().length < 2) closeResults(); else await byName(q.value.trim()); }), 180); };
  q.onkeydown = guard(async e => {
    if (e.key === 'Enter' && q.value.trim().length > 1) { clearTimeout(timer); await byContent(q.value.trim()); }
    else if (e.key === 'Escape') { q.value = ''; closeResults(); }
    else if (e.key === 'ArrowDown' && !res.hidden) { e.preventDefault(); focusRow(rows()[0]); /** @type {HTMLElement} */ (res).focus(); }
  });
  res.tabIndex = 0;

  /** @param {Record<string, string>} map */
  const setStatus = map => { status = map; paintStatus(); };
  return { el, load: () => expand('', tree, 0), reveal, setStatus, select: (/** @type {string} */ p) => { selected = p; mark(); } };
}
