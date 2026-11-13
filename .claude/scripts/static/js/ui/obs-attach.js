// @ts-check
import { api } from '../api.js';
import { $, h } from '../lib/dom.js';
import { fmtN } from '../lib/format.js';
import { S } from '../store.js';
import { button } from './button.js';
import { guard } from './toast.js';

/** Mostra no rodapé do menu quantos anexos estão em preparo. */
export function updFoot() { const f = $('#foot'); if (f) f.textContent = S.draft.length ? S.draft.length + ' anexo(s) em preparo' : 'garcom-NFC'; }

/** Texto do chip de um anexo (arquivo, nota, commit ou tarefa). @param {any} a */
function attachLabel(a) {
  if (a.type === 'file') return a.path;
  if (a.type === 'note') return 'nota: ' + String(a.text).slice(0, 40);
  if (a.type === 'commit') return 'commit ' + String(a.sha).slice(0, 7);
  if (a.type === 'task') return 'tarefa ' + a.id;
  return String(a.type);
}

/**
 * Anexos do próximo envio: chips, busca de arquivo, documentação, nota e a estimativa de tokens.
 * @param {() => void} [onChange] avisado a cada mudança (o compositor atualiza o contador de "Opções")
 */
export function attachPanel(onChange) {
  const wrap = h('div', 'attach'), chips = h('div', 'attach-chips'), bar = h('div', 'attach-bar'), est = h('span', 'muted small');
  const paint = async () => {
    chips.replaceChildren();
    S.draft.forEach((a, i) => {
      const c = h('span', 'chipf', attachLabel(a)); const x = h('button', '', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remover anexo'); x.onclick = () => { S.draft.splice(i, 1); paint(); }; c.append(x); chips.append(c);
    });
    est.textContent = '';
    if (S.draft.length) { try { const e = await api('estimate', 'POST', { attach: S.draft }); est.textContent = '≈ ' + fmtN(e.tokens) + ' tokens anexados'; } catch (e) { est.textContent = ''; } }
    updFoot(); onChange?.();
  };
  const pop = h('div', 'popup'); pop.hidden = true; pop.setAttribute('role', 'listbox');
  /** @param {string[]} items @param {(p: string) => void} pick */
  const open = (items, pick) => {
    pop.replaceChildren(); items.forEach(p => { const d = h('button', '', p); d.type = 'button'; d.setAttribute('role', 'option'); d.onclick = () => { pick(p); pop.hidden = true; }; pop.append(d); }); pop.hidden = !items.length;
  };
  const fileIn = h('input'); fileIn.type = 'text'; fileIn.placeholder = 'Anexar arquivo…'; fileIn.setAttribute('aria-label', 'Anexar arquivo do projeto');
  fileIn.oninput = guard(async () => {
    if (fileIn.value.length < 2) { pop.hidden = true; return; }
    open(await api('files?q=' + encodeURIComponent(fileIn.value)), p => { S.draft.push({ type: 'file', path: p }); fileIn.value = ''; paint(); });
  });
  fileIn.onkeydown = e => { if (e.key === 'Escape') pop.hidden = true; };
  const kn = h('select'); kn.setAttribute('aria-label', 'Anexar documentação'); kn.append(new Option('Documentação…', ''));
  (S.cat ? S.cat.knowledge : []).forEach((/** @type {string} */ p) => kn.append(new Option(p.split('/').pop().replace('.md', ''), p)));
  kn.onchange = () => { if (kn.value) { S.draft.push({ type: 'file', path: kn.value }); kn.value = ''; paint(); } };
  const note = button('Nota', { small: true, onClick: () => { const t = prompt('Nota de contexto para o agente:'); if (t && t.trim()) { S.draft.push({ type: 'note', text: t.trim() }); paint(); } } });
  const box = h('div', 'attach-find'); box.append(fileIn, pop);
  bar.append(box, kn, note, est); wrap.append(chips, bar); paint(); return wrap;
}
