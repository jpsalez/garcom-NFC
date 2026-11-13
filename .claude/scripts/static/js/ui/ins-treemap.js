// @ts-check
import { h, svgEl } from '../lib/dom.js';
import { hideTip, showTip } from './tooltip.js';

/**
 * @typedef {{ path: string, loc: number, commits: number, cc_max: number, level: string }} TFile
 * @typedef {{ name: string, value: number, file?: TFile, kids: Map<string, TNode> }} TNode
 * @typedef {{ x: number, y: number, w: number, h: number }} Box
 */

const HEAD = 13;

/** Proporção do pior retângulo de uma linha (Bruls et al.): quanto mais perto de 1, mais quadrado. @param {{ a: number }[]} row @param {number} side */
function worst(row, side) {
  const s = row.reduce((t, r) => t + r.a, 0), mx = Math.max(...row.map(r => r.a)), mn = Math.min(...row.map(r => r.a));
  return Math.max(side * side * mx / (s * s), s * s / (side * side * mn));
}

/**
 * Treemap squarified: divide a caixa em retângulos de área proporcional ao valor, o mais quadrados possível.
 * @template T @param {(T & { value: number })[]} items em ordem decrescente de valor @param {Box} box
 * @returns {{ item: T, x: number, y: number, w: number, h: number }[]}
 */
export function squarify(items, { x, y, w, h }) {
  const total = items.reduce((t, i) => t + i.value, 0), out = [];
  if (!total || w <= 0 || h <= 0) return out;
  const scale = (w * h) / total;
  const rest = items.map(i => ({ i, a: i.value * scale }));
  /** @type {typeof rest} */ let row = [];
  const flush = () => {
    const s = row.reduce((t, r) => t + r.a, 0);
    if (w >= h) { const cw = s / h; let yy = y; row.forEach(r => { const ch = r.a / cw; out.push({ item: r.i, x, y: yy, w: cw, h: ch }); yy += ch; }); x += cw; w -= cw; }
    else { const rh = s / w; let xx = x; row.forEach(r => { const cw = r.a / rh; out.push({ item: r.i, x: xx, y, w: cw, h: rh }); xx += cw; }); y += rh; h -= rh; }
    row = [];
  };
  while (rest.length) {
    const next = rest[0], side = Math.min(w, h);
    if (!row.length || worst(row.concat(next), side) <= worst(row, side)) { row.push(next); rest.shift(); } else flush();
  }
  if (row.length) flush();
  return out;
}

/** Árvore de pastas; pastas com um único filho pasta são juntadas (back-end/src/modules vira um rótulo só). @param {TFile[]} files */
export function buildTree(files) {
  /** @type {TNode} */ const root = { name: '', value: 0, kids: new Map() };
  files.forEach(f => {
    let n = root;
    f.path.split('/').forEach(seg => { if (!n.kids.has(seg)) n.kids.set(seg, { name: seg, value: 0, kids: new Map() }); n = /** @type {TNode} */ (n.kids.get(seg)); });
    n.file = f; n.value = Math.max(1, f.loc);
  });
  /** @param {TNode} n @returns {number} */
  const total = n => (n.file ? n.value : (n.value = [...n.kids.values()].reduce((t, k) => t + total(k), 0)));
  total(root);
  /** @param {TNode} n @returns {TNode} */
  const squash = n => {
    n.kids.forEach((k, key) => { n.kids.set(key, squash(k)); });
    if (!n.file && n.kids.size === 1) { const only = /** @type {TNode} */ ([...n.kids.values()][0]); if (!only.file) return { ...only, name: n.name ? n.name + '/' + only.name : only.name }; }
    return n;
  };
  return squash(root);
}

/** Cor por nº de commits: neutro → âmbar → vermelho (legível nos dois temas, sempre sobre o fundo opaco). @param {number} c @param {number} max */
export function heat(c, max) {
  if (!c || !max) return 'color-mix(in srgb, var(--dim) 14%, var(--bg2))';
  const p = Math.min(1, c / max);
  return p < 0.5 ? `color-mix(in srgb, var(--warn) ${Math.round(18 + p * 2 * 52)}%, var(--bg2))` : `color-mix(in srgb, var(--err) ${Math.round(20 + (p - 0.5) * 2 * 55)}%, var(--warn))`;
}

/**
 * Mapa de hotspots: área = linhas lógicas, cor = commits no período. Cada arquivo é focável (Enter abre).
 * @param {{ days: number, files: TFile[], max_commits: number }} data @param {{ onOpen: (path: string) => void, width?: number, height?: number }} o
 */
export function treemapView(data, { onOpen, width = 1000, height = 520 }) {
  const wrap = h('div', 'tm-wrap');
  const svg = svgEl('svg', { class: 'tm', viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': `Mapa de hotspots: ${data.files.length} arquivos` });
  /** @param {TNode} n @param {Box} box @param {number} depth */
  function draw(n, box, depth) {
    const kids = [...n.kids.values()].sort((a, b) => b.value - a.value);
    const inner = depth && box.w > 40 && box.h > HEAD + 16 ? { x: box.x + 1, y: box.y + HEAD, w: box.w - 2, h: box.h - HEAD - 1 } : { x: box.x + 1, y: box.y + 1, w: box.w - 2, h: box.h - 2 };
    squarify(kids, inner).forEach(({ item: k, x, y, w, h: hh }) => {
      if (k.file) leaf(k.file, { x, y, w, h: hh }); else {
        const g = svgEl('g', { class: 'tm-dir' }), r = svgEl('rect', { x, y, width: w, height: hh, rx: 3 });
        g.append(r);
        if (w > 44 && hh > HEAD + 4) { const t = svgEl('text', { x: x + 4, y: y + 10 }); t.textContent = k.name.length * 5.2 > w - 8 ? k.name.slice(-Math.max(2, Math.floor((w - 8) / 5.2))) : k.name; g.append(t); }
        svg.append(g); draw(k, { x, y, w, h: hh }, depth + 1);
      }
    });
  }
  /** @param {TFile} f @param {Box} b */
  function leaf(f, b) {
    const name = f.path.split('/').pop() || f.path;
    const g = svgEl('g', { class: 'tm-leaf lv-' + (f.level === 'atenção' ? 'atencao' : f.level) + (data.max_commits && f.commits / data.max_commits > 0.45 ? ' hot' : ''), tabindex: 0, role: 'button', 'aria-label': `${f.path}: ${f.loc} linhas, ${f.commits} commits em ${data.days} dias, complexidade máxima ${f.cc_max}` });
    const r = svgEl('rect', { x: b.x + 0.5, y: b.y + 0.5, width: Math.max(0, b.w - 1), height: Math.max(0, b.h - 1), rx: 2 });
    r.style.fill = heat(f.commits, data.max_commits); g.append(r);
    if (b.w > 46 && b.h > 15) { const t = svgEl('text', { x: b.x + 4, y: b.y + 11 }); const max = Math.floor((b.w - 8) / 5.3); t.textContent = name.length > max ? name.slice(0, Math.max(1, max - 1)) + '…' : name; g.append(t); }
    const lines = [f.path, `${f.loc} linhas lógicas · ${f.commits} commit(s) em ${data.days} dias`, `complexidade máx. ${f.cc_max} · nível ${f.level}`];
    g.addEventListener('mousemove', e => showTip(/** @type {MouseEvent} */ (e), lines)); g.addEventListener('mouseleave', hideTip);
    g.addEventListener('focus', () => { const rc = g.getBoundingClientRect(); showTip(/** @type {any} */ ({ clientX: rc.left, clientY: rc.bottom - 20 }), lines); }); g.addEventListener('blur', hideTip);
    g.addEventListener('click', () => onOpen(f.path));
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(f.path); } });
    svg.append(g);
  }
  draw(buildTree(data.files), { x: 0, y: 0, w: width, h: height }, 0);
  const legend = h('div', 'tm-legend'), bar = h('i', 'tm-grad');
  legend.append(h('span', 'hint', `commits em ${data.days} dias:`), h('span', 'mono', '0'), bar, h('span', 'mono', String(data.max_commits)), h('span', 'hint', '· área = linhas lógicas · contorno âmbar/vermelho = nível atenção/alto'));
  wrap.append(svg, legend);
  return wrap;
}
