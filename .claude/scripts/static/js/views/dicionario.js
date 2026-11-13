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
  const D = /** @type {{ categorias: string[], termos: Term[] }} */ (await api('dictionary'));
  const wrap = h('div'); main.append(wrap);

  const tools = h('div', 'dtools'), q = h('input'), cat = h('select'), cnt = h('span', 'muted small');
  q.type = 'text'; q.placeholder = 'Buscar um termo ou uma ideia'; q.value = S.dictQ || ''; q.setAttribute('aria-label', 'Buscar termo');
  cat.setAttribute('aria-label', 'Filtrar por categoria'); cat.append(new Option('Todas as categorias', '')); D.categorias.forEach(c => cat.append(new Option(c, c)));
  tools.append(q, cat, cnt);
  const index = h('div', 'dindex'); index.setAttribute('role', 'navigation'); index.setAttribute('aria-label', 'Índice de A a Z');
  const list = h('div'); wrap.append(tools, index, list);
  const byName = /** @type {Record<string, Term>} */ ({}); D.termos.forEach(t => { byName[norm(t.t)] = t; });

  /** @param {string} letter */
  const jump = letter => list.querySelector(`[data-l="${letter}"]`)?.scrollIntoView({ behavior: behavior(), block: 'start' });

  /** Vai até o termo (limpando os filtros) e o destaca por um instante. @param {Term} t */
  function goTo(t) {
    q.value = ''; S.dictQ = ''; cat.value = ''; draw();
    const el = list.querySelector('[data-t="' + norm(t.t).replace(/"/g, '') + '"]');
    if (el) { el.scrollIntoView({ behavior: behavior(), block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1700); }
  }

  /** @param {Term} t */
  function termo(t) {
    const row = h('div', 'dterm'); row.dataset.t = norm(t.t);
    const nome = h('h4', '', t.t); nome.append(h('span', 'cat', t.c));
    const corpo = h('div'); corpo.append(h('p', '', t.d));
    if (t.o && t.o !== '—') corpo.append(h('p', 'small muted', 'Onde aparece: ' + t.o));
    if (t.v && t.v.length) {
      const see = h('div', 'see'); see.append(document.createTextNode('Veja também:'));
      t.v.forEach(v => {
        const alvo = byName[norm(v)] || D.termos.find(x => norm(x.t).startsWith(norm(v))), b = h('button', 'btn ghost sm', v);
        b.type = 'button'; b.disabled = !alvo; b.onclick = () => { if (alvo) goTo(alvo); }; see.append(b);
      });
      corpo.append(see);
    }
    row.append(nome, corpo); return row;
  }

  function draw() {
    const k = norm(q.value), c = cat.value; list.replaceChildren();
    const achados = D.termos.filter(t => (!c || t.c === c) && (!k || norm(t.t + ' ' + t.d + ' ' + (t.o || '')).includes(k))).sort((a, b) => a.t.localeCompare(b.t, 'pt-BR'));
    const presentes = new Set(achados.map(t => letterOf(t.t))); let ultima = '';
    achados.forEach(t => {
      const l = letterOf(t.t);
      if (l !== ultima) { ultima = l; const d = h('h3', 'dletter', l); d.dataset.l = l; list.append(d); }
      list.append(termo(t));
    });
    index.replaceChildren(...LETTERS.map(l => { const b = h('button', 'dl-btn', l); b.type = 'button'; b.disabled = !presentes.has(l); b.setAttribute('aria-label', 'Ir para a letra ' + l); b.onclick = () => jump(l); return b; }));
    cnt.textContent = achados.length + ' de ' + D.termos.length + ' termos';
    if (!achados.length) list.append(h('p', 'muted', 'Nenhum termo encontrado. Tente outra palavra ou escolha “Todas as categorias”.'));
  }
  q.oninput = () => { S.dictQ = q.value; draw(); }; cat.onchange = draw; draw(); q.focus();
}
