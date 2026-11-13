// @ts-check
import { h, svgEl } from '../lib/dom.js';
import { LANE_COLORS as BASE } from './commit-graph.js';
import { hideTip, showTip } from './tooltip.js';

const LANE_COLORS = [...BASE, '#c9d1d9', '#e5c07b'];  // 10 arquivos = 10 cores

/** @typedef {{ path: string, cc_now: number, series: { sha: string, short: string, t: string, ts: number, cc_max: number, loc: number }[] }} TFile */

/**
 * Evolução da complexidade máxima (CC) dos piores arquivos, um traço por arquivo. Linhas tracejadas: 10 (atenção) e 20 (alto).
 * @param {{ files: TFile[] }} data @param {{ onOpen: (path: string) => void }} o
 */
export function trendView(data, { onOpen }) {
  const box = h('div', 'trend');
  const files = data.files.filter(f => f.series.length);
  const longest = Math.max(0, ...files.map(f => f.series.length));
  if (!files.length) { box.append(h('div', 'hint', 'Nenhum arquivo com histórico para mostrar.')); return box; }
  if (longest < 2) box.append(h('div', 'hint short', 'Histórico curto: cada arquivo tem uma única versão commitada, então ainda não há evolução para desenhar. Os pontos mostram a complexidade atual e a linha aparece conforme os arquivos forem alterados.'));
  const W = 760, H = 250, L = 34, R = 12, T = 12, B = 24;
  const ts = files.flatMap(f => f.series.map(s => s.ts)), t0 = Math.min(...ts), t1 = Math.max(...ts, t0 + 1), dots = longest < 2;
  const ymax = Math.max(24, ...files.flatMap(f => f.series.map(s => s.cc_max))), X = (/** @type {number} */ t, /** @type {number} */ col = 0) => L + (dots ? (col + 0.5) / files.length : (t - t0) / (t1 - t0)) * (W - L - R), Y = (/** @type {number} */ v) => H - B - (v / ymax) * (H - B - T);
  const svg = svgEl('svg', { class: 'trend-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Evolução da complexidade de ${files.length} arquivos` });
  [0, 10, 20].forEach(v => { svg.append(svgEl('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), class: v ? 'tr-th th' + v : 'tr-ax' })); const tx = svgEl('text', { x: L - 6, y: Y(v) + 3, class: 'tr-lb', 'text-anchor': 'end' }); tx.textContent = String(v); svg.append(tx); });
  if (!dots) [t0, t1].forEach((t, i) => { const tx = svgEl('text', { x: i ? W - R : L, y: H - 6, class: 'tr-lb', 'text-anchor': i ? 'end' : 'start' }); tx.textContent = new Date(t * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); svg.append(tx); });
  /** @type {Map<string, SVGElement[]>} */ const byFile = new Map();
  files.forEach((f, i) => {
    const color = LANE_COLORS[i % LANE_COLORS.length], els = [];
    const pts = f.series.map(s => `${X(s.ts, i).toFixed(1)},${Y(s.cc_max).toFixed(1)}`).join(' ');
    if (f.series.length > 1) { const pl = svgEl('polyline', { points: pts, fill: 'none', stroke: color, 'stroke-width': 2, class: 'tr-line', 'stroke-linejoin': 'round' }); pl.addEventListener('click', () => onOpen(f.path)); svg.append(pl); els.push(pl); }
    f.series.forEach(s => {
      const c = svgEl('circle', { cx: X(s.ts, i), cy: Y(s.cc_max), r: dots ? 5 : 4, fill: color, class: 'tr-pt', tabindex: 0, role: 'button', 'aria-label': `${f.path} em ${s.short}: complexidade ${s.cc_max}` });
      const lines = [f.path, `${s.short} · ${new Date(s.t).toLocaleDateString('pt-BR')}`, `complexidade máx. ${s.cc_max} · ${s.loc} linhas`];
      c.addEventListener('mousemove', e => showTip(/** @type {MouseEvent} */ (e), lines)); c.addEventListener('mouseleave', hideTip); c.addEventListener('click', () => onOpen(f.path));
      c.addEventListener('keydown', e => { if (e.key === 'Enter') onOpen(f.path); }); svg.append(c); els.push(c);
    });
    byFile.set(f.path, els);
  });
  const leg = h('div', 'tr-leg');
  files.forEach((f, i) => {
    const b = h('button', 'tr-item'); b.title = 'Clique para abrir o arquivo'; const dot = h('i'); dot.style.background = LANE_COLORS[i % LANE_COLORS.length];
    b.append(dot, h('span', 'nm', f.path.split('/').slice(-2).join('/')), h('span', 'mono dim', 'CC ' + f.cc_now));
    b.onclick = () => onOpen(f.path);
    const dim = (/** @type {boolean} */ on) => byFile.forEach((els, p) => els.forEach(e => { e.style.opacity = on && p !== f.path ? '0.15' : ''; }));
    b.onmouseenter = () => dim(true); b.onmouseleave = () => dim(false); b.onfocus = () => dim(true); b.onblur = () => dim(false);
    leg.append(b);
  });
  box.append(svg, leg);
  return box;
}
