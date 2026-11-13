// @ts-check
import { h, svgEl } from '../lib/dom.js';
import { hideTip, showTip } from './tooltip.js';

/** @typedef {{ d: string, commits: number, add: number, del: number }} Day */

const dayName = (/** @type {string} */ d) => new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
const level = (/** @type {number} */ n) => (n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4);

/** Calendário de atividade estilo GitHub: uma coluna por semana, uma linha por dia da semana. @param {Day[]} days */
export function heatmap(days) {
  const cell = 12, gap = 3, first = new Date(days[0].d + 'T12:00').getDay(), cols = Math.ceil((first + days.length) / 7);
  const svg = svgEl('svg', { class: 'heat', width: cols * (cell + gap), height: 7 * (cell + gap), role: 'img', 'aria-label': `Calendário de atividade: ${days.reduce((a, x) => a + x.commits, 0)} commits em ${days.length} dias` });
  days.forEach((x, i) => {
    const idx = first + i, r = svgEl('rect', { x: Math.floor(idx / 7) * (cell + gap), y: (idx % 7) * (cell + gap), width: cell, height: cell, rx: 3, class: 'hc l' + level(x.commits) });
    r.addEventListener('mousemove', e => showTip(/** @type {MouseEvent} */ (e), [dayName(x.d), `${x.commits} commit(s) · +${x.add} −${x.del}`])); r.addEventListener('mouseleave', hideTip);
    svg.append(r);
  });
  return svg;
}

/** Linhas adicionadas (verde) e removidas (vermelho) por dia. @param {Day[]} days */
export function linesChart(days) {
  const W = 320, H = 96, P = 4, max = Math.max(1, ...days.map(x => Math.max(x.add, x.del))), step = (W - P * 2) / Math.max(1, days.length - 1);
  const svg = svgEl('svg', { class: 'lchart', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': `Linhas adicionadas e removidas por dia (máximo ${max})` });
  /** @param {'add' | 'del'} k */
  const pts = k => days.map((x, i) => `${(P + i * step).toFixed(1)},${(H - P - (x[k] / max) * (H - P * 2)).toFixed(1)}`).join(' ');
  svg.append(svgEl('polyline', { points: pts('del'), class: 'ld', fill: 'none', 'stroke-width': 1.6, 'vector-effect': 'non-scaling-stroke' }), svgEl('polyline', { points: pts('add'), class: 'la', fill: 'none', 'stroke-width': 1.6, 'vector-effect': 'non-scaling-stroke' }));
  days.forEach((x, i) => {
    const r = svgEl('rect', { x: Math.max(0, P + i * step - step / 2), y: 0, width: step, height: H, fill: 'transparent' });
    r.addEventListener('mousemove', e => showTip(/** @type {MouseEvent} */ (e), [dayName(x.d), `+${x.add} −${x.del} linhas · ${x.commits} commit(s)`])); r.addEventListener('mouseleave', hideTip); svg.append(r);
  });
  return svg;
}

/** Os três cartões do topo da tela Commits. @param {{ days: Day[], commits: number, with_tests: number, top_files: { path: string, commits: number }[], add: number, del: number }} a */
export function activityCards(a) {
  const c1 = h('div', 'card s5'), c2 = h('div', 'card s4'), c3 = h('div', 'card s3');
  c1.append(h('div', 'hint', 'Atividade (12 semanas)'), Object.assign(h('div', 'kpi-n'), { textContent: String(a.commits) }), heatmap(a.days), h('div', 'hint', 'commits por dia (todos os branches)'));
  c2.append(h('div', 'hint', 'Linhas por dia'), linesChart(a.days));
  const lg = h('div', 'lleg'); lg.append(h('span', 'la-t', '+' + a.add.toLocaleString('pt-BR')), h('span', 'ld-t', '−' + a.del.toLocaleString('pt-BR'))); c2.append(lg);
  c3.append(h('div', 'hint', 'Arquivos mais alterados'));
  a.top_files.slice(0, 3).forEach(f => { const r = h('div', 'row'); r.style.cssText = 'gap:8px;font:12px var(--mono);margin-top:6px'; r.append(h('span', 'grow', f.path.split('/').pop()), h('span', 'dim', f.commits + '×')); r.title = f.path; c3.append(r); });
  c3.append(h('div', 'hint', a.commits ? `${Math.round(a.with_tests / a.commits * 100)}% dos commits tocam em testes` : ''));
  return [c1, c2, c3];
}
