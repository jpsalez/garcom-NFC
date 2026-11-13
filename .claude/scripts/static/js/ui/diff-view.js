// @ts-check
import { h } from '../lib/dom.js';
import { highlightLines } from '../lib/highlight.js';
import { badge } from './badge.js';
import { button } from './button.js';
import { langOf } from '../lib/lang.js';

/**
 * @typedef {{ t: ' ' | '+' | '-', s: string }} DLine
 * @typedef {{ oldStart: number, oldLines: number, newStart: number, newLines: number, header: string, lines: DLine[] }} Hunk
 * @typedef {{ name: string, status: 'modificado' | 'novo' | 'apagado' | 'renomeado', binary: boolean, hunks: Hunk[], add: number, del: number }} DFile
 * @typedef {{ open?: number, loadLines?: (path: string) => Promise<string[] | null> }} DiffOpts
 */

const GENERATED = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$|(^|\/)(dist|build|generated|\.next|coverage)\/|\.min\.(js|css)$|\.map$|\.snap$/;
const MIGRATION = /(^|\/)prisma\/migrations\/.+\/migration\.sql$/;
const MAX_LINES = 1500;  // por arquivo, antes do "mostrar tudo"
const MORE = 20;         // linhas reveladas por clique em "mostrar mais"

/** @param {string} txt @returns {{ head: string, files: DFile[] }} */
function parseDiff(txt) {
  /** @type {DFile[]} */ const files = []; const headLines = [];
  /** @type {DFile | null} */ let f = null; /** @type {Hunk | null} */ let hk = null;
  for (const l of txt.split('\n')) {
    if (l.startsWith('diff --git ')) { f = { name: l.split(' b/').pop() || l, status: 'modificado', binary: false, hunks: [], add: 0, del: 0 }; files.push(f); hk = null; continue; }
    if (!f) { headLines.push(l); continue; }
    const m = l.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)/);
    if (m) { hk = { oldStart: +m[1], oldLines: m[2] === undefined ? 1 : +m[2], newStart: +m[3], newLines: m[4] === undefined ? 1 : +m[4], header: m[5], lines: [] }; f.hunks.push(hk); continue; }
    if (hk) {
      const c = l[0];
      if (c === '+' || c === '-' || c === ' ') { hk.lines.push({ t: c, s: l.slice(1) }); if (c === '+') f.add++; else if (c === '-') f.del++; }
      continue;
    }
    if (l.startsWith('new file')) f.status = 'novo'; else if (l.startsWith('deleted file')) f.status = 'apagado';
    else if (l.startsWith('rename to')) f.status = 'renomeado'; else if (l.startsWith('Binary files') || l.startsWith('GIT binary patch')) f.binary = true;
  }
  return { head: headLines.join('\n').trim(), files };
}

// ---------- diferença dentro da linha (por palavra) ----------
const TOKEN = /\w+|\s+|[^\w\s]/g;
/** Marca as palavras que mudaram entre duas linhas: devolve intervalos (offsets de texto) de cada lado. @param {string} a @param {string} b */
function wordRanges(a, b) {
  const x = a.match(TOKEN) || [], y = b.match(TOKEN) || [];
  if (x.length * y.length > 40_000 || a === b) return null;
  const n = x.length, m = y.length, dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  /** @type {[number, number][]} */ const ra = [], rb = [];
  let i = 0, j = 0, pa = 0, pb = 0;
  /** @param {[number, number][]} r @param {number} s @param {number} len */
  const push = (r, s, len) => { const last = r[r.length - 1]; if (last && last[1] === s) last[1] += len; else r.push([s, s + len]); };
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) { pa += x[i].length; pb += y[j].length; i++; j++; }
    else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { if (y[j].trim()) push(rb, pb, y[j].length); pb += y[j].length; j++; }
    else { if (x[i].trim()) push(ra, pa, x[i].length); pa += x[i].length; i++; }
  }
  return { ra, rb };
}

/** Envolve em <mark class="wd"> os trechos [início, fim) do texto puro de um HTML já destacado, sem quebrar o aninhamento. @param {string} html @param {[number, number][]} ranges */
function markRanges(html, ranges) {
  if (!ranges.length) return html;
  let pos = 0, out = '';
  for (const m of html.matchAll(/<[^>]*>|&(?:amp|lt|gt|quot|#39);|[^<&]+|&/g)) {
    const t = m[0];
    if (t[0] === '<') { out += t; continue; }
    const len = t[0] === '&' && t.length > 1 ? 1 : t.length;
    if (len === 1 && t.length > 1) { out += ranges.some(([s, e]) => pos >= s && pos < e) ? `<mark class="wd">${t}</mark>` : t; pos++; continue; }
    let k = 0;
    while (k < len) {
      const inR = ranges.find(([s, e]) => pos + k >= s && pos + k < e);
      const end = inR ? Math.min(len, inR[1] - pos) : Math.min(len, Math.min(...ranges.filter(([s]) => s > pos + k).map(([s]) => s - pos), len));
      const piece = t.slice(k, end);
      out += inR ? `<mark class="wd">${piece}</mark>` : piece; k = end;
    }
    pos += len;
  }
  return out;
}

const esc = (/** @type {string} */ s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Linhas de um hunk prontas para desenhar: HTML destacado por lado e pares remoção/adição com diferença por palavra.
 * @param {Hunk} hk @param {string} lang
 */
async function prepareHunk(hk, lang) {
  const olds = hk.lines.filter(l => l.t !== '+').map(l => l.s), news = hk.lines.filter(l => l.t !== '-').map(l => l.s);
  const [ho, hn] = await Promise.all([highlightLines(olds.join('\n'), lang), highlightLines(news.join('\n'), lang)]);
  let io = 0, in_ = 0;
  const rows = hk.lines.map(l => {
    const o = l.t === '+' ? -1 : io++, n = l.t === '-' ? -1 : in_++;
    const html = l.t === '-' ? (ho ? ho[o] : esc(l.s)) : (hn ? hn[n] : esc(l.s));
    return { ...l, html: html ?? esc(l.s), oldNo: o < 0 ? 0 : hk.oldStart + o, newNo: n < 0 ? 0 : hk.newStart + n };
  });
  // pares dentro de cada bloco "- - - + + +": a i-ésima remoção com a i-ésima adição
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].t !== '-') continue;
    let j = i; while (j < rows.length && rows[j].t === '-') j++;
    let k = j; while (k < rows.length && rows[k].t === '+') k++;
    for (let d = 0; d < Math.min(j - i, k - j); d++) {
      const a = rows[i + d], b = rows[j + d], r = a.s.length < 400 && b.s.length < 400 ? wordRanges(a.s, b.s) : null;
      if (r) { a.html = markRanges(a.html, r.ra); b.html = markRanges(b.html, r.rb); }
    }
    i = k - 1;
  }
  return rows;
}

/** @typedef {Awaited<ReturnType<typeof prepareHunk>>[number]} Row */

/** @param {Row} r */
function unifiedRow(r) {
  const el = h('div', 'dr ' + (r.t === '+' ? 'a' : r.t === '-' ? 'd' : 'c'));
  const tx = h('span', 'tx'); tx.innerHTML = r.html || ' ';
  el.append(h('span', 'ln', r.oldNo ? String(r.oldNo) : ''), h('span', 'ln', r.newNo ? String(r.newNo) : ''), h('span', 'mk', r.t === ' ' ? '' : r.t), tx);
  return el;
}

/** Lado a lado: pareia remoções com adições; o que sobra de um lado fica vazio no outro. @param {Row[]} rows */
function sideRows(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.t === ' ') { out.push([r, r]); continue; }
    if (r.t === '+') { out.push([null, r]); continue; }
    let j = i; while (j < rows.length && rows[j].t === '-') j++;
    let k = j; while (k < rows.length && rows[k].t === '+') k++;
    const nd = j - i, na = k - j;
    for (let d = 0; d < Math.max(nd, na); d++) out.push([d < nd ? rows[i + d] : null, d < na ? rows[j + d] : null]);
    i = k - 1;
  }
  return out;
}

/** @param {Row | null} r @param {'o' | 'n'} side */
function cell(r, side) {
  const tx = h('span', 'tx'), ln = h('span', 'ln', r ? String(side === 'o' ? r.oldNo : r.newNo || r.oldNo) : '');
  if (r) tx.innerHTML = r.html || ' ';
  const c = h('div', 'dc ' + (!r ? 'e' : r.t === '-' ? 'd' : r.t === '+' ? 'a' : 'c')); c.append(ln, tx); return c;
}

/**
 * Visualizador de diff: unificado ou lado a lado, sintaxe, diferença por palavra, contexto dobrável,
 * arquivos gerados recolhidos. Atalhos (com o foco fora de campos): j/k arquivos, n/p trechos.
 * @param {string} text saída de `git diff` / `git show`
 * @param {DiffOpts | number} [opts]
 */
export function diffView(text, opts = {}) {
  const o = typeof opts === 'number' ? { open: opts } : opts, openN = o.open ?? 2;
  const { head, files } = parseDiff(text);
  const root = h('div', 'dv'); root.tabIndex = -1;
  let mode = 'unified'; try { mode = localStorage.getItem('diffMode') || 'unified'; } catch (e) { /* sem storage */ }
  /** @type {{ box: HTMLElement, body: HTMLElement, f: DFile, drawn: boolean, mode: string }[]} */ const items = [];

  const bar = h('div', 'dv-bar');
  const totals = h('span', 'small muted', `${files.length} arquivo(s) · +${files.reduce((a, f) => a + f.add, 0)} −${files.reduce((a, f) => a + f.del, 0)}`);
  const seg = h('div', 'seg'); const sBtn = [['unified', 'Unificado'], ['split', 'Lado a lado']].map(([k, label]) => { const b = h('button', mode === k ? 'on' : '', label); b.onclick = () => { mode = k; try { localStorage.setItem('diffMode', k); } catch (e) { /* ok */ } sBtn.forEach(x => x.classList.toggle('on', x === b)); items.forEach(i => { if (i.drawn) { i.drawn = false; draw(i); } }); }; seg.append(b); return b; });
  const all = button('Expandir tudo', { small: true }), none = button('Recolher tudo', { small: true });
  all.onclick = () => items.forEach(i => toggle(i, true)); none.onclick = () => items.forEach(i => toggle(i, false));
  bar.append(totals, seg, all, none); if (files.length) root.append(bar);
  if (head && files.length) { const d = h('details', 'dv-stat'); d.append(h('summary', 'small muted', 'resumo (--stat)'), Object.assign(h('pre'), { textContent: head })); root.append(d); }
  if (!files.length) root.append(h('div', 'small muted', head || 'sem alterações'));

  /** @type {Map<string, Promise<string[] | null>>} */ const cache = new Map();
  const lines = (/** @type {string} */ p) => { if (!o.loadLines) return Promise.resolve(null); if (!cache.has(p)) cache.set(p, o.loadLines(p).catch(() => null)); return /** @type {Promise<string[] | null>} */ (cache.get(p)); };

  /** Desenha uma linha de contexto (usada ao revelar linhas ocultas) no modo atual. @param {Row} r */
  const ctxRow = r => { if (mode !== 'split') return unifiedRow(r); const d = h('div', 'dr2'); d.append(cell(r, 'o'), cell(r, 'n')); return d; };

  /**
   * Linha "N linhas sem alteração" entre trechos: ↓ revela mais a partir de cima, ↑ a partir de baixo, "todas" tudo.
   * Numeração nova [from, to] (to nulo = até o fim do arquivo); delta = número novo − número antigo nessa faixa.
   * @param {DFile} f @param {number} from @param {number | null} to @param {number} delta @param {string} lang @param {{ top: boolean, next: boolean }} pos
   */
  function gapRow(f, from, to, delta, lang, pos) {
    const row = h('div', 'dv-gap'), lab = h('span', 'small muted'); row.append(lab);
    const paint = () => { if (to !== null && to < from) { row.remove(); return; } lab.textContent = to === null ? 'mostrar o restante do arquivo' : `${to - from + 1} linha(s) sem alteração`; };
    /** @param {string[]} src @param {number} a @param {number} b */
    const rowsOf = async (src, a, b) => {
      const chunk = src.slice(a - 1, b), hl = await highlightLines(chunk.join('\n'), lang);
      return chunk.map((s, i) => /** @type {Row} */ ({ t: ' ', s, html: hl ? hl[i] : esc(s), newNo: a + i, oldNo: a + i - delta }));
    };
    /** @param {'up' | 'down' | 'all'} how */
    const reveal = async how => {
      const src = await lines(f.name); if (!src) { lab.textContent = 'não foi possível ler o arquivo'; return; }
      if (to === null) to = src.length;
      if (to < from) { row.remove(); return; }
      if (how === 'up') { const a = Math.max(from, to - MORE + 1); row.after(...(await rowsOf(src, a, to)).map(ctxRow)); to = a - 1; }
      else { const b = how === 'all' ? to : Math.min(to, from + MORE - 1); row.before(...(await rowsOf(src, from, b)).map(ctxRow)); from = b + 1; }
      paint();
    };
    /** @param {string} t @param {'up' | 'down' | 'all'} how */
    const btn = (t, how) => { row.append(button(t, { small: true, onClick: () => reveal(how) })); };
    if (!pos.top) btn('↓ ' + MORE, 'down');
    if (pos.next) btn('↑ ' + MORE, 'up');
    btn('todas', 'all'); paint();
    return row;
  }

  async function draw(/** @type {typeof items[number]} */ it) {
    const { f, body } = it; it.drawn = true; it.mode = mode; body.replaceChildren(h('div', 'small muted pad', 'carregando…'));
    if (f.binary) { body.replaceChildren(h('div', 'small muted pad', 'arquivo binário')); return; }
    const lang = langOf(f.name); let budget = MAX_LINES;
    const frag = document.createDocumentFragment();
    /** @param {Hunk} k */ const newEnd = k => (k.newLines ? k.newStart + k.newLines - 1 : k.newStart), oldEnd = (/** @type {Hunk} */ k) => (k.oldLines ? k.oldStart + k.oldLines - 1 : k.oldStart);
    /** @param {Hunk} k */ const newBegin = k => (k.newLines ? k.newStart : k.newStart + 1), oldBegin = (/** @type {Hunk} */ k) => (k.oldLines ? k.oldStart : k.oldStart + 1);
    const expandable = !!o.loadLines && f.status !== 'novo' && f.status !== 'apagado';
    for (let hi = 0; hi < f.hunks.length; hi++) {
      const hk = f.hunks[hi], prev = f.hunks[hi - 1];
      if (expandable) {
        const from = prev ? newEnd(prev) + 1 : 1, to = newBegin(hk) - 1;
        if (to >= from) frag.append(gapRow(f, from, to, prev ? newEnd(prev) - oldEnd(prev) : newBegin(hk) - oldBegin(hk), lang, { top: !prev, next: true }));
      }
      const hh = h('div', 'dv-hunk', `@@ -${hk.oldStart},${hk.oldLines} +${hk.newStart},${hk.newLines} @@ ${hk.header}`); hh.dataset.hunk = '1'; frag.append(hh);
      const rows = await prepareHunk(hk, lang), use = rows.slice(0, Math.max(0, budget)); budget -= use.length;
      if (mode === 'split') sideRows(use).forEach(([x, y]) => { const r = h('div', 'dr2'); r.append(cell(x, 'o'), cell(y, 'n')); frag.append(r); });
      else use.forEach(r => frag.append(unifiedRow(r)));
      if (use.length < rows.length) { frag.append(button(`mostrar tudo (${f.add + f.del} linhas alteradas)`, { small: true, onClick: () => { budget = Infinity; it.drawn = false; draw(it); } })); break; }
    }
    if (expandable && f.hunks.length) { const last = f.hunks[f.hunks.length - 1]; frag.append(gapRow(f, newEnd(last) + 1, null, newEnd(last) - oldEnd(last), lang, { top: false, next: false })); }
    body.replaceChildren(frag);
    body.classList.toggle('split', mode === 'split');
  }

  function toggle(/** @type {typeof items[number]} */ it, /** @type {boolean} */ open) {
    it.body.hidden = !open; it.box.classList.toggle('open', open); it.box.querySelector('.dv-fh')?.setAttribute('aria-expanded', String(open));
    if (open && !it.drawn) draw(it);
  }

  let opened = 0;
  files.forEach(f => {
    const generated = GENERATED.test(f.name) || (MIGRATION.test(f.name) && f.add + f.del > 150);
    const box = h('div', 'dv-file'), fh = h('button', 'dv-fh'); fh.setAttribute('aria-expanded', 'false');
    const mx = Math.max(1, f.add + f.del), bar_ = h('span', 'dv-bar2'), a = h('i', 'a'), d = h('i', 'd'); a.style.width = f.add / mx * 100 + '%'; d.style.width = f.del / mx * 100 + '%'; bar_.append(a, d);
    fh.append(h('span', 'chev', '▸'), h('span', 'nm', f.name), ...(f.status !== 'modificado' ? [badge(f.status, 'warn')] : []), ...(generated ? [badge('gerado')] : []), h('span', 'pm'), bar_);
    const pm = /** @type {HTMLElement} */ (fh.querySelector('.pm')); pm.append(h('span', 'a', '+' + f.add), document.createTextNode(' '), h('span', 'd', '−' + f.del));
    const body = h('div', 'dv-body'); body.hidden = true;
    const it = { box, body, f, drawn: false, mode }; items.push(it);
    fh.onclick = () => toggle(it, body.hidden);
    box.append(fh, body); root.append(box);
    if (!generated && opened < openN) { opened++; toggle(it, true); }
    else if (generated) body.before(Object.assign(h('div', 'small muted pad gen', 'Arquivo gerado: recolhido por padrão. Clique no nome para ver.')));
  });

  /** j/k: arquivo seguinte/anterior · n/p: trecho seguinte/anterior. */
  root.addEventListener('dv-key', e => {
    const k = /** @type {CustomEvent<string>} */ (e).detail, sel = k === 'j' || k === 'k' ? '.dv-file' : '[data-hunk]';
    const list = /** @type {HTMLElement[]} */ ([...root.querySelectorAll(sel)]).filter(x => !x.closest('[hidden]') || x.matches('.dv-file'));
    if (!list.length) return;
    const top = (root.closest('.dv-scroll') || document.scrollingElement || document.documentElement).getBoundingClientRect().top + 8;
    const forward = k === 'j' || k === 'n';
    const next = forward ? list.find(x => x.getBoundingClientRect().top > top + 4) : [...list].reverse().find(x => x.getBoundingClientRect().top < top - 4);
    const t = next || list[forward ? list.length - 1 : 0]; if (t.matches('.dv-file')) toggle(items.find(i => i.box === t) || items[0], true);
    t.scrollIntoView({ block: 'start' });
  });
  return root;
}

/** Liga os atalhos j/k/n/p ao diff enquanto ele estiver na tela. Devolve algo que `clearTimers` sabe remover. @param {HTMLElement} dv */
export function diffKeys(dv) {
  const fn = (/** @type {KeyboardEvent} */ e) => {
    if (!dv.isConnected || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(/** @type {HTMLElement} */ (e.target).tagName || '')) return;
    if ('jknp'.includes(e.key) && e.key.length === 1) { e.preventDefault(); dv.dispatchEvent(new CustomEvent('dv-key', { detail: e.key })); }
  };
  document.addEventListener('keydown', fn);
  return { remove: () => document.removeEventListener('keydown', fn) };
}
