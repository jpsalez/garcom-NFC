// @ts-check
import { h, svgEl } from '../lib/dom.js';
import { hideTip, showTip } from './tooltip.js';

/**
 * @typedef {{ id: string, files: number, loc: number, fan_in: number, fan_out: number, file_list: { path: string, loc: number }[] }} MNode
 * @typedef {{ nodes: MNode[], edges: { from: string, to: string, weight: number }[], cycles: string[][], high_fan_in: string[] }} MData
 */

/**
 * Mapa de dependências entre módulos (círculo, determinístico). Seta A → B = A importa B. Vermelho = faz parte de um ciclo.
 * Aro âmbar = fan-in alto (muitos módulos dependem dele). Clique no módulo lista seus arquivos.
 * @param {MData} data @param {{ onOpen: (path: string) => void }} o
 */
export function depsView(data, { onOpen }) {
  const box = h('div', 'deps'), side = h('div', 'deps-side');
  const N = data.nodes.length;
  if (!N) { box.append(h('div', 'hint', 'Nenhum módulo encontrado em back-end/src.')); return box; }
  const size = 440, cx = size / 2, cy = size / 2, R = size / 2 - 64;
  const maxLoc = Math.max(1, ...data.nodes.map(n => n.loc)), radius = (/** @type {MNode} */ n) => 14 + 16 * Math.sqrt(n.loc / maxLoc);
  const pos = new Map(data.nodes.map((n, i) => { const a = -Math.PI / 2 + (i / N) * Math.PI * 2; return [n.id, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a, n }]; }));
  const inCycle = new Set(data.cycles.flat()), cycleOf = (/** @type {string} */ a, /** @type {string} */ b) => data.cycles.some(c => c.includes(a) && c.includes(b));
  const svg = svgEl('svg', { class: 'deps-svg', viewBox: `0 0 ${size} ${size}`, role: 'group', 'aria-label': `Dependências entre ${N} módulos` });
  const defs = svgEl('defs');
  [['ok', 'var(--mut)'], ['cy', 'var(--err)']].forEach(([id, color]) => { const m = svgEl('marker', { id: 'dp-' + id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }); m.append(svgEl('path', { d: 'M0 0L10 5L0 10z', fill: color })); defs.append(m); });
  svg.append(defs);
  const mx = Math.max(1, ...data.edges.map(e => e.weight));
  data.edges.forEach(e => {
    const a = pos.get(e.from), b = pos.get(e.to); if (!a || !b) return;
    const cyc = cycleOf(e.from, e.to), dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const ra = radius(a.n) + 2, rb = radius(b.n) + 6, sx = a.x + dx / d * ra, sy = a.y + dy / d * ra, ex = b.x - dx / d * rb, ey = b.y - dy / d * rb;
    const qx = (sx + ex) / 2 + (cx - (sx + ex) / 2) * 0.28 + dy / d * 10, qy = (sy + ey) / 2 + (cy - (sy + ey) / 2) * 0.28 - dx / d * 10;
    const p = svgEl('path', { d: `M${sx} ${sy}Q${qx} ${qy} ${ex} ${ey}`, fill: 'none', class: 'dp-edge' + (cyc ? ' cyc' : ''), 'stroke-width': 1 + 2.2 * e.weight / mx, 'marker-end': `url(#dp-${cyc ? 'cy' : 'ok'})` });
    p.addEventListener('mousemove', ev => showTip(/** @type {MouseEvent} */ (ev), [`${e.from} → ${e.to}`, `${e.weight} import(s)` + (cyc ? ' · parte de um ciclo' : '')])); p.addEventListener('mouseleave', hideTip);
    svg.append(p);
  });
  /** @type {SVGElement | null} */ let selected = null;
  const list = (/** @type {MNode} */ n, /** @type {SVGElement} */ g) => {
    selected?.classList.remove('sel'); selected = g; g.classList.add('sel'); side.replaceChildren();
    side.append(h('h4', '', n.id), h('div', 'hint', `${n.files} arquivo(s) · ${n.loc} linhas lógicas · fan-in ${n.fan_in} · fan-out ${n.fan_out}`));
    n.file_list.forEach(f => { const b = h('button', 'ctx-link', f.path.replace(/^back-end\/src\//, '')); b.title = f.path; b.append(h('span', 'dim', '  ' + f.loc)); b.onclick = () => onOpen(f.path); side.append(b); });
  };
  data.nodes.forEach(n => {
    const p = /** @type {{ x: number, y: number, a: number }} */ (pos.get(n.id)), r = radius(n), high = data.high_fan_in.includes(n.id), cyc = inCycle.has(n.id);
    const g = svgEl('g', { class: 'dp-node' + (cyc ? ' cyc' : '') + (high ? ' high' : ''), tabindex: 0, role: 'button', 'aria-label': `Módulo ${n.id}: ${n.files} arquivos, fan-in ${n.fan_in}, fan-out ${n.fan_out}${cyc ? ', em ciclo' : ''}` });
    g.append(svgEl('circle', { cx: p.x, cy: p.y, r }));
    const lb = svgEl('text', { x: p.x, y: p.y + 3.5, 'text-anchor': 'middle' }); lb.textContent = n.id.length > 12 ? n.id.slice(0, 11) + '…' : n.id; g.append(lb);
    g.addEventListener('click', () => list(n, g)); g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); list(n, g); } });
    g.addEventListener('mousemove', e => showTip(/** @type {MouseEvent} */ (e), [n.id, `${n.files} arquivo(s) · ${n.loc} linhas`, `fan-in ${n.fan_in} (quem depende dele) · fan-out ${n.fan_out}` + (high ? ' · fan-in alto' : '') + (cyc ? ' · em ciclo' : '')])); g.addEventListener('mouseleave', hideTip);
    svg.append(g);
  });
  const top = [...data.nodes].sort((a, b) => b.fan_in - a.fan_in)[0];
  side.append(h('div', 'hint', 'Clique em um módulo para listar os arquivos.'));
  const info = h('div', 'deps-info');
  if (data.cycles.length) {
    info.append(h('div', 'ctx-h', `Ciclos (${data.cycles.length})`));
    data.cycles.forEach(c => info.append(h('div', 'tag cyc-tag', c.join(' ⇄ '))));
    const inside = data.edges.filter(e => cycleOf(e.from, e.to)).sort((a, b) => b.weight - a.weight).slice(0, 6);
    info.append(h('div', 'hint', 'Setas que mais pesam dentro do ciclo: ' + inside.map(e => `${e.from}→${e.to} (${e.weight})`).join(', ')));
  } else info.append(h('div', 'hint ok-line', 'Nenhum ciclo entre módulos.'));
  if (top && top.fan_in > 0) info.append(h('div', 'hint', `Maior fan-in: ${top.id} (${top.fan_in} módulos dependem dele)` + (data.high_fan_in.length ? ` · fan-in alto: ${data.high_fan_in.join(', ')}` : '')));
  box.append(svg, h('div', 'deps-col', ''));
  /** @type {HTMLElement} */ (box.lastElementChild).append(info, side);
  return box;
}
