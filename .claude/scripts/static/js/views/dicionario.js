// @ts-check
import { api } from '../api.js';
import { $, h } from '../lib/dom.js';
import { norm } from '../lib/format.js';
import { S } from '../store.js';

const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
const letterOf = (/** @type {string} */ t) => { const c = norm(t).charAt(0).toUpperCase(); return c >= 'A' && c <= 'Z' ? c : '#'; };
const behavior = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

/** @typedef {{ t: string, c: string, d: string, o?: string, v?: string[] }} Term */

export async function renderDicionario() {
  const main = $('#main'); main.className = ''; main.replaceChildren();
  const D = /** @type {{ categorias: string[], termos: Term[] }} */ (await api('dictionary')); let cat = '';
  const top = h('div', 'row'), q = h('input'); q.type = 'text'; q.placeholder = 'buscar um termo ou uma ideia…'; q.style.width = '320px'; q.value = S.dictQ || ''; q.setAttribute('aria-label', 'Buscar termo');
  const cnt = h('span', 'hint'); top.append(q, cnt); main.append(top);
  const chips = h('div', 'row'); chips.style.cssText = 'gap:6px;margin:12px 0';
  const mk = (/** @type {string} */ label, /** @type {string} */ val) => { const b = h('button', 'chipb' + (val === cat ? ' on' : ''), label); b.dataset.v = val; b.onclick = () => { cat = val; chips.querySelectorAll('.chipb').forEach(x => x.classList.toggle('on', /** @type {HTMLElement} */ (x).dataset.v === val)); draw(); }; chips.append(b); };
  mk('todas', ''); D.categorias.forEach(c => mk(c, c)); main.append(chips);
  const index = h('div', 'dindex'); index.setAttribute('role', 'navigation'); index.setAttribute('aria-label', 'Índice de A a Z'); main.append(index);
  const box = h('div', 'dgrid'); main.append(box);
  const byName = /** @type {Record<string, Term>} */ ({}); D.termos.forEach(t => { byName[norm(t.t)] = t; });

  /** @param {string} letter */
  const jump = letter => box.querySelector(`[data-l="${letter}"]`)?.scrollIntoView({ behavior: behavior(), block: 'start' });

  /** @param {Term} t @param {number} i */
  function termCard(t, i) {
    const c = h('div', 'card dcard rise'); c.dataset.t = norm(t.t); c.style.animationDelay = Math.min(i, 12) * 25 + 'ms';
    const hd = h('h4'); hd.append(document.createTextNode(t.t), h('span', 'cat', t.c)); c.append(hd, h('p', '', t.d));
    if (t.o && t.o !== '—') c.append(h('div', 'hint', 'Onde aparece: ' + t.o));
    if (t.v && t.v.length) {
      const sv = h('div', 'see'); sv.append(document.createTextNode('Veja também:'));
      t.v.forEach(v => {
        const tg = byName[norm(v)] || D.termos.find(x => norm(x.t).startsWith(norm(v))), b = h('button', 'chipb', v);
        b.onclick = () => { if (!tg) return; q.value = ''; cat = ''; chips.querySelectorAll('.chipb').forEach(x => x.classList.toggle('on', /** @type {HTMLElement} */ (x).dataset.v === '')); draw(); const el = box.querySelector('[data-t="' + norm(tg.t).replace(/"/g, '') + '"]'); if (el) { el.scrollIntoView({ behavior: behavior(), block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1700); } };
        sv.append(b);
      });
      c.append(sv);
    }
    return c;
  }

  function draw() {
    const k = norm(q.value); box.replaceChildren();
    const list = D.termos.filter(t => (!cat || t.c === cat) && (!k || norm(t.t + ' ' + t.d + ' ' + (t.o || '')).includes(k))).sort((a, b) => a.t.localeCompare(b.t, 'pt-BR'));
    const present = new Set(list.map(t => letterOf(t.t))); let last = '';
    list.forEach((t, i) => {
      const l = letterOf(t.t);
      if (l !== last) { last = l; const d = h('div', 'dletter', l); d.dataset.l = l; d.setAttribute('role', 'heading'); d.setAttribute('aria-level', '3'); box.append(d); }
      box.append(termCard(t, i));
    });
    index.replaceChildren(...LETTERS.map(l => { const b = h('button', 'dl-btn', l); b.type = 'button'; b.disabled = !present.has(l); b.setAttribute('aria-label', 'Ir para a letra ' + l); b.onclick = () => jump(l); return b; }));
    cnt.textContent = list.length + ' de ' + D.termos.length + ' termos';
    if (!list.length) box.append(h('div', 'hint', 'Nenhum termo encontrado. Tente outra palavra ou escolha “todas”.'));
  }
  q.oninput = () => { S.dictQ = q.value; draw(); }; draw(); q.focus();
}
