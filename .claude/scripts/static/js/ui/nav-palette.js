// @ts-check
import { api } from '../api.js';
import { $, h } from '../lib/dom.js';
import { norm } from '../lib/format.js';
import { go, ROUTES } from '../router.js';
import { S } from '../store.js';
import { showHelp } from './nav-help.js';
import { openModal } from './nav-modal.js';

/** @typedef {{ id: string, group: string, title: string, hint?: string, run: () => void }} Item */

const GROUP_ORDER = ['Telas', 'Ações', 'Arquivos', 'Commits', 'Tarefas', 'Pull requests', 'Dicionário'];
const PER_GROUP = { Arquivos: 8 };
const enc = encodeURIComponent;

/** Pontuação: 0 não casa; maior é melhor (início > contém > letras em sequência). @param {string} text @param {string} q */
function score(text, q) {
  const t = norm(text);
  if (t.startsWith(q)) return 4;
  if (t.split(/[\s/._-]+/).some(w => w.startsWith(q))) return 3;
  if (t.includes(q)) return 2;
  let i = 0; for (const c of t) if (c === q[i]) i++;
  return i === q.length && q.length > 2 ? 1 : 0;
}

/** Fontes que não mudam a cada tecla: buscadas uma vez (e de novo depois de 60 s). */
const cache = /** @type {Record<string, { t: number, v: any }>} */ ({});
/** @param {string} key @param {() => Promise<any>} fn */
async function cached(key, fn) {
  const c = cache[key]; if (c && Date.now() - c.t < 60_000) return c.v;
  const v = await fn().catch(() => null); cache[key] = { t: Date.now(), v }; return v;
}

const screens = () => ROUTES.map(r => /** @type {Item} */ ({ id: 'tela:' + r.hash, group: 'Telas', title: r.label, hint: r.sub, run: () => { go(r.hash); } }));
const actions = () => /** @type {Item[]} */ ([
  { id: 'a:verify', group: 'Ações', title: 'Rodar a verificação (typecheck, lint e testes)', run: () => { go('verificar').then(() => /** @type {HTMLElement | null} */ ($('#main .btn.sm'))?.click()); } },
  { id: 'a:chat', group: 'Ações', title: 'Nova conversa com o orquestrador', run: () => { S.sel = null; S.selTeam = null; go('conversa'); } },
  { id: 'a:theme', group: 'Ações', title: 'Alternar tema claro/escuro', run: () => /** @type {HTMLElement | null} */ ($('#theme'))?.click() },
  { id: 'a:help', group: 'Ações', title: 'Ver atalhos de teclado', hint: '?', run: showHelp },
  { id: 'a:search', group: 'Ações', title: 'Buscar texto dentro dos arquivos', hint: 'tela Arquivos', run: () => { go('arquivos'); } },
]);

/** @param {string} q @returns {Promise<Item[]>} */
async function dynamic(q) {
  const out = /** @type {Item[]} */ ([]);
  const [files, graph, tasks, decisoes, dict, over] = await Promise.all([
    q.length >= 2 ? api('files?q=' + enc(q)).catch(() => []) : [],
    cached('graph', () => api('graph?limit=200')), cached('tasks', () => api('tasks')), cached('decisoes', () => api('decisoes')), cached('dict', () => api('dictionary')), cached('gh', () => api('gh/overview')),
  ]);
  /** @type {string[]} */ (files).forEach(p => out.push({ id: 'f:' + p, group: 'Arquivos', title: p.split('/').pop() || p, hint: p, run: () => { go('arquivos', '', 'path=' + enc(p).replace(/%2F/g, '/')); } }));
  (graph?.commits || []).forEach((/** @type {any} */ c) => out.push({ id: 'c:' + c.sha, group: 'Commits', title: c.subject, hint: `${c.short} · ${c.author}`, run: () => { S.commitSel = c.sha; go('commits'); } }));
  (tasks?.tasks || []).filter((/** @type {any} */ t) => t.status !== 'arquivada').forEach((/** @type {any} */ t) => out.push({ id: 't:' + t.id, group: 'Tarefas', title: `${t.id} · ${t.titulo}`, hint: `${t.status} · ${t.fase}`, run: () => { go('tarefas', '', 'abrir=' + enc(t.id)); } }));
  (decisoes?.pendentes || []).forEach((/** @type {any} */ d) => out.push({ id: 'dec:' + d.id, group: 'Decisões', title: `${d.id} · ${d.titulo}`, hint: d.bloqueia.length ? `bloqueia ${d.bloqueia.length}` : 'pendente', run: () => { go('decisoes'); } }));
  (dict?.termos || []).forEach((/** @type {any} */ t) => out.push({ id: 'd:' + t.t, group: 'Dicionário', title: t.t, hint: t.c, run: () => { S.dictQ = t.t; go('dicionario'); } }));
  if (over && !over.unavailable) (over.open_prs || []).forEach((/** @type {any} */ p) => out.push({ id: 'p:' + p.number, group: 'Pull requests', title: `#${p.number} ${p.title}`, hint: p.branch, run: () => { if (p.url) window.open(p.url, '_blank', 'noopener'); else go('github'); } }));
  return out;
}

/** Paleta de comandos (Ctrl/Cmd+K): uma busca para telas, ações, arquivos, commits, tarefas, PRs e termos. */
export function showPalette() {
  const { box, close } = openModal({ label: 'Paleta de comandos', cls: 'nm-pal' });
  const input = h('input'); input.type = 'text'; input.placeholder = 'Ir para… (tela, arquivo, commit, tarefa, termo)'; input.autocomplete = 'off'; input.spellcheck = false;
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-controls', 'pal-list'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-label', 'Buscar na paleta');
  const list = h('div', 'nm-list'); list.id = 'pal-list'; list.setAttribute('role', 'listbox');
  const live = h('div', 'sr-only'); live.setAttribute('aria-live', 'polite');
  const foot = h('div', 'nm-foot'); foot.append(h('kbd', '', '↑'), h('kbd', '', '↓'), document.createTextNode(' navegar  '), h('kbd', '', 'Enter'), document.createTextNode(' abrir  '), h('kbd', '', 'Esc'), document.createTextNode(' fechar'));
  box.append(input, list, live, foot);
  /** @type {Item[]} */ let shown = []; let cur = 0, seq = 0;

  function paint() {
    list.replaceChildren(); let lastGroup = '';
    shown.forEach((it, i) => {
      if (it.group !== lastGroup) { lastGroup = it.group; const g = h('div', 'nm-g', it.group); g.setAttribute('role', 'presentation'); list.append(g); }
      const r = h('div', 'nm-item' + (i === cur ? ' on' : '')); r.id = 'pal-' + i; r.setAttribute('role', 'option'); r.setAttribute('aria-selected', String(i === cur));
      r.append(h('span', 'nm-t', it.title)); if (it.hint) r.append(h('span', 'nm-h', it.hint));
      r.onmousemove = () => { if (cur !== i) { cur = i; paint(); } }; r.onclick = () => run(it); list.append(r);
    });
    input.setAttribute('aria-activedescendant', shown.length ? 'pal-' + cur : '');
    if (!shown.length) list.append(h('div', 'nm-empty', 'Nada encontrado'));
    list.querySelector('.nm-item.on')?.scrollIntoView({ block: 'nearest' });
    live.textContent = shown.length + ' resultado(s)';
  }
  /** @param {Item} it */
  function run(it) { close(); setTimeout(() => it.run(), 0); }

  /** @param {Item[]} pool @param {string} q */
  function rank(pool, q) {
    if (!q) return pool.filter(i => i.group === 'Telas' || i.group === 'Ações');
    /** @type {Item[]} */ const res = [];
    GROUP_ORDER.forEach(g => {
      const max = /** @type {Record<string, number>} */ (PER_GROUP)[g] || 6;
      res.push(...pool.filter(i => i.group === g).map(i => ({ i, s: Math.max(score(i.title, q), g === 'Arquivos' || g === 'Commits' ? score(i.hint || '', q) : 0) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, max).map(x => x.i));
    });
    return res;
  }
  async function refresh() {
    const q = norm(input.value.trim()), my = ++seq, base = [...screens(), ...actions()];
    shown = rank(base, q); cur = 0; paint();
    if (!q) { dynamic('').catch(() => []); return; }
    const more = await dynamic(q).catch(() => /** @type {Item[]} */ ([])); if (my !== seq) return;
    shown = rank([...base, ...more], q); cur = Math.min(cur, Math.max(0, shown.length - 1)); paint();
  }
  input.oninput = refresh;
  input.onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (shown.length) { cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; paint(); } }
    else if (e.key === 'Enter' && shown[cur]) { e.preventDefault(); run(shown[cur]); }
  };
  input.focus(); refresh();
}
