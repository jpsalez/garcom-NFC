// @ts-check
import { svgEl as el } from '../lib/dom.js';
// Grafo de commits: o servidor manda os commits em ordem topológica com `parents`; aqui calculamos as faixas (lanes)
// e desenhamos cada linha em SVG. Cada faixa tem uma cor própria, que acompanha o branch ao longo do histórico.

export const LANE_COLORS = [1, 2, 3, 4, 5, 6, 7, 8].map(n => `var(--viz-${n})`);
const GW = 14, PAD = 10;

/**
 * @typedef {{ k: number, c: number }} Seg  faixa k, cor c
 * @typedef {{ lane: number, color: number, hasTop: boolean, pass: Seg[], merge: Seg[], toParents: Seg[], head: boolean, isMerge: boolean }} GRow
 */

/** @param {({ sha: string, color: number } | null)[]} lanes */
function freeLane(lanes) { const i = lanes.indexOf(null); if (i >= 0) return i; lanes.push(null); return lanes.length - 1; }

/**
 * Calcula, para cada commit, por onde passam as faixas. A lista tem de estar em ordem topológica (pais depois dos filhos).
 * @param {{ sha: string, parents: string[], refs?: { current: boolean }[] }[]} commits
 * @returns {{ rows: GRow[], maxLanes: number }}
 */
export function layoutGraph(commits) {
  /** @type {({ sha: string, color: number } | null)[]} */ const lanes = [];
  let nextColor = 0, maxLanes = 1;
  /** @type {GRow[]} */ const rows = [];
  for (const c of commits) {
    const hits = lanes.flatMap((l, k) => (l && l.sha === c.sha ? [k] : []));
    const pass = lanes.flatMap((l, k) => (l && !hits.includes(k) ? [{ k, c: l.color }] : []));
    let lane = hits[0], color;
    if (lane === undefined) { lane = freeLane(lanes); color = nextColor++; lanes[lane] = { sha: c.sha, color }; }
    else color = /** @type {{ color: number }} */ (lanes[lane]).color;
    const merge = hits.slice(1).map(k => ({ k, c: /** @type {{ color: number }} */ (lanes[k]).color }));
    hits.slice(1).forEach(k => { lanes[k] = null; });
    /** @type {Seg[]} */ const toParents = [];
    if (c.parents.length) {
      lanes[lane] = { sha: c.parents[0], color }; toParents.push({ k: lane, c: color });
      for (const p of c.parents.slice(1)) {
        let k = lanes.findIndex(l => l && l.sha === p);
        if (k < 0) { k = freeLane(lanes); lanes[k] = { sha: p, color: nextColor++ }; }
        toParents.push({ k, c: /** @type {{ color: number }} */ (lanes[k]).color });
      }
    } else lanes[lane] = null;
    maxLanes = Math.max(maxLanes, lanes.length, pass.length + 1, ...hits.map(k => k + 1));
    rows.push({ lane, color, hasTop: hits.length > 0, pass, merge, toParents, head: !!(c.refs && c.refs.some(r => r.current)), isMerge: c.parents.length > 1 });
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
  }
  return { rows, maxLanes };
}

/** SVG de uma linha do grafo (altura H). @param {GRow} r @param {number} maxLanes @param {number} H */
export function graphSvg(r, maxLanes, H) {
  const W = maxLanes * GW + PAD * 2, mid = H / 2, X = (/** @type {number} */ k) => PAD + k * GW;
  const svg = el('svg', { class: 'gr', width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });
  const col = (/** @type {number} */ c) => LANE_COLORS[c % LANE_COLORS.length];
  /** @param {string} d @param {number} c */
  const path = (d, c) => svg.append(el('path', { d, style: `stroke:${col(c)}`, 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }));
  r.pass.forEach(s => path(`M${X(s.k)} 0V${H}`, s.c));
  if (r.hasTop) path(`M${X(r.lane)} 0V${mid}`, r.color);
  r.merge.forEach(s => path(`M${X(s.k)} 0C${X(s.k)} ${mid * 0.9} ${X(r.lane)} ${mid * 0.1} ${X(r.lane)} ${mid}`, s.c));
  r.toParents.forEach(s => path(s.k === r.lane ? `M${X(r.lane)} ${mid}V${H}` : `M${X(r.lane)} ${mid}C${X(r.lane)} ${mid + (H - mid) * 0.9} ${X(s.k)} ${mid + (H - mid) * 0.1} ${X(s.k)} ${H}`, s.c));
  if (r.head) svg.append(el('circle', { cx: X(r.lane), cy: mid, r: 8, fill: 'none', style: `stroke:${col(r.color)}`, 'stroke-width': 1.5, opacity: 0.6 }));
  svg.append(el('circle', { cx: X(r.lane), cy: mid, r: r.isMerge ? 5.5 : 4.5, style: `fill:${r.isMerge ? 'var(--surface)' : col(r.color)};stroke:${col(r.color)}`, 'stroke-width': r.isMerge ? 2.5 : 0 }));
  return svg;
}
