// @ts-check
import { h } from '../lib/dom.js';
import { ago } from '../lib/format.js';
import { hideTip, showTip } from './tooltip.js';

/**
 * @typedef {{ start: number, n: number, sha: string, short: string, author: string, ts: number, summary: string, uncommitted: boolean }} BlameGroup
 * @typedef {BlameGroup & { age: number }} AgedGroup
 */

const LH = 20;          // altura da linha (px); tem de ser igual a --lh no CSS
const BLOCK = 100;      // linhas por bloco
const VIRTUAL_FROM = 2000; // acima disso, só os blocos visíveis existem no DOM

/**
 * Visualizador de código: números de linha com âncora, seleção de intervalo (clique, Shift+clique),
 * faixa de blame e renderização por blocos para arquivos grandes.
 * @param {{ lines: string[], html?: string[] | null, path?: string, href?: (n: number) => string,
 *           onRange?: (a: number, b: number) => void, onCommit?: (sha: string) => void }} o
 */
export function codeView({ lines, html = null, path = '', href, onRange, onCommit }) {
  const total = lines.length, virtual = total > VIRTUAL_FROM;
  const el = h('div', 'cv'); el.tabIndex = 0; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Código de ' + (path || 'arquivo'));
  const body = h('div', 'cv-body'); el.append(body);
  /** @type {(AgedGroup | undefined)[] | null} */ let byLine = null;
  /** @type {[number, number] | null} */ let range = null;
  let anchor = 0;
  const blocks = Array.from({ length: Math.ceil(total / BLOCK) }, (_, b) => {
    const d = h('div', 'cv-block'); d.dataset.b = String(b);
    if (virtual) d.style.height = Math.min(BLOCK, total - b * BLOCK) * LH + 'px';
    body.append(d); return { d, done: false };
  });

  const inRange = (/** @type {number} */ n) => !!range && n >= range[0] && n <= range[1];

  /** @param {number} n */
  function blameCell(n) {
    const g = byLine && byLine[n];
    const c = h('span', 'cv-bl'); if (!g) return c;
    c.style.setProperty('--age', String(g.age));
    if (g.start === n) c.append(h('span', 'who', g.uncommitted ? 'não commitado' : g.author), h('span', 'sha', g.short), h('span', 'when', ago(g.ts)));
    c.onmousemove = e => showTip(e, [g.summary || '(sem mensagem)', `${g.uncommitted ? 'não commitado' : g.author} · ${g.short} · ${new Date(g.ts * 1000).toLocaleString('pt-BR')}`]);
    c.onmouseleave = hideTip;
    if (!g.uncommitted) c.onclick = () => onCommit && onCommit(g.sha);
    return c;
  }

  /** @param {number} n */
  function row(n) {
    const r = h('div', 'cv-row' + (inRange(n) ? ' sel' : '')); r.dataset.n = String(n);
    const ln = h('a', 'cv-ln', String(n)); ln.href = href ? href(n) : '#'; ln.setAttribute('aria-label', 'linha ' + n);
    ln.onclick = e => { e.preventDefault(); select(n, e.shiftKey); };
    const tx = h('span', 'cv-tx');
    if (html) tx.innerHTML = html[n - 1] || ''; else tx.textContent = lines[n - 1];
    r.append(...(byLine ? [blameCell(n)] : []), ln, tx);
    return r;
  }

  /** @param {{ d: HTMLElement, done: boolean }} blk @param {number} b */
  function paint(blk, b) {
    const frag = document.createDocumentFragment();
    for (let i = b * BLOCK; i < Math.min(total, (b + 1) * BLOCK); i++) frag.append(row(i + 1));
    blk.d.replaceChildren(frag); blk.done = true;
  }

  if (virtual) {
    const io = new IntersectionObserver(es => es.forEach(e => { const b = Number(/** @type {HTMLElement} */ (e.target).dataset.b); if (e.isIntersecting && !blocks[b].done) paint(blocks[b], b); }), { root: el, rootMargin: '900px 0px' });
    blocks.forEach(b => io.observe(b.d));
  } else blocks.forEach((b, i) => paint(b, i));

  /** @param {number} n @param {boolean} extend */
  function select(n, extend) {
    const a = extend && anchor ? anchor : n; if (!extend) anchor = n;
    setRange(a, n); if (onRange) onRange(range ? range[0] : n, range ? range[1] : n);
  }

  /** @param {number} a @param {number} b */
  function setRange(a, b) {
    range = a ? [Math.min(a, b), Math.max(a, b)] : null; if (a && !anchor) anchor = a;
    body.querySelectorAll('.cv-row').forEach(r => r.classList.toggle('sel', inRange(Number(/** @type {HTMLElement} */ (r).dataset.n))));
  }

  /** @param {number} n */
  function reveal(n) {
    if (virtual) { el.scrollTop = Math.max(0, (n - 1) * LH - el.clientHeight / 3); return; }
    body.querySelector(`.cv-row[data-n="${n}"]`)?.scrollIntoView({ block: 'center' });
  }

  /** @param {BlameGroup[] | null} groups */
  function setBlame(groups) {
    if (!groups) byLine = null; else {
      const ts = groups.map(g => g.ts), lo = Math.min(...ts), hi = Math.max(...ts);
      byLine = [];
      groups.forEach(g => { const aged = { ...g, age: hi === lo ? 1 : 0.12 + 0.88 * (g.ts - lo) / (hi - lo) }; for (let i = 0; i < g.n; i++) byLine[g.start + i] = aged; });
    }
    el.classList.toggle('has-blame', !!byLine);
    blocks.forEach((b, i) => { if (b.done) paint(b, i); });
  }

  /** @param {boolean} on */
  function setWrap(on) { if (virtual) return false; el.classList.toggle('wrap', on); return on; }

  const selectedText = () => (range ? lines.slice(range[0] - 1, range[1]) : lines).join('\n');
  return { el, virtual, setBlame, setRange, reveal, setWrap, selectedText, get range() { return range; } };
}
