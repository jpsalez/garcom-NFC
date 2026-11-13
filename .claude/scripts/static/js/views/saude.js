// @ts-check
import { api } from '../api.js';
import { $, h } from '../lib/dom.js';
import { fmtN } from '../lib/format.js';
import { go } from '../router.js';
import { S } from '../store.js';
import { button } from '../ui/button.js';
import { arqTab, mapaTab } from '../ui/ins-tabs.js';
import { inline } from '../ui/markdown.js';
import { stats } from '../ui/section.js';
import { table } from '../ui/table.js';
import { tabs } from '../ui/tabs.js';
import { guard, toast } from '../ui/toast.js';
import { updFoot } from './conversa.js';

const LVL = { 'ok': 'ok', 'atenção': 'atencao', 'alto': 'alto' };
const TABS = [['prio', 'Prioridades'], ['mapa', 'Mapa'], ['arq', 'Arquitetura'], ['files', 'Arquivos'], ['funcs', 'Funções'], ['ver', 'Verificações'], ['concept', 'Conceitos']];
const nivel = (/** @type {string} */ l) => h('span', 'lv ' + (/** @type {Record<string, string>} */ (LVL)[l] || l), l);

export async function renderSaude() {
  const main = $('#main'); main.className = ''; main.replaceChildren();
  const [hl, hist] = await Promise.all([api('health'), api('history')]); const sm = hl.summary, B = sm.bands;

  // resumo: uma frase, a barra de níveis e no máximo 4 números
  const head = h('div'); head.style.marginBottom = 'var(--s5)';
  head.append(h('h2', '', hl.all_ok ? 'Nenhum arquivo ultrapassa os limites.' : (B['atenção'] + B.alto) + ' arquivo(s) pedem atenção.'),
    h('p', 'small muted', hl.all_ok ? `Todos os ${sm.files} arquivos estão dentro dos limites de complexidade, tamanho e churn. A aba Prioridades mostra onde acompanhar mesmo assim.` : 'Veja a aba Prioridades: cada item explica o motivo técnico e o que fazer.'));
  const band = h('div', 'band'); [[B.ok, 'ok'], [B['atenção'], 'warn'], [B.alto, 'bad']].forEach(([v, c]) => { const i = h('i', /** @type {string} */ (c)); i.style.width = (/** @type {number} */ (v) / sm.files * 100) + '%'; band.append(i); });
  band.title = `${B.ok} ok · ${B['atenção']} atenção · ${B.alto} alto`; band.style.margin = 'var(--s3) 0 var(--s4)';
  head.append(band, stats([{ label: 'arquivos', value: sm.files }, { label: 'linhas lógicas', value: fmtN(sm.loc) }, { label: 'funções', value: sm.functions }, { label: 'CC máxima', value: sm.max_cc }]));
  main.append(head);

  const body = h('div');
  const show = (/** @type {string} */ k) => { S.saudeTab = k; body.replaceChildren(); VIEWS[k](); };
  const tb = tabs(TABS.map(([id, label]) => ({ id, label })), { active: S.saudeTab || 'prio', onChange: show, label: 'Seções da saúde do código' });
  main.append(tb.el, body);

  const askRefactor = (/** @type {any} */ f, /** @type {string[]} */ why) => guard(async () => {
    const rr = await api('runs', 'POST', { agent: 'garcom-arquiteto', prompt: 'Sugira refatorações pequenas e simples (sem abstração antecipada, sem novas camadas) para o arquivo anexado. Liste em ordem de impacto, cada uma com o motivo e o trecho a mudar. Pontos levantados: ' + (why.join(' ') || 'nenhum, é só acompanhamento.'), attach: [{ type: 'file', path: 'back-end/' + f.path }], budget: 0.4 });
    S.sel = rr.id; S.selTeam = null; go('conversa');
  });
  /** Uma linha com as métricas do arquivo; as fora do limite ficam coloridas. @param {any} f */
  const metricas = f => {
    const l = h('div', 'small muted'), parte = (/** @type {string} */ t, /** @type {'' | 'warn' | 'err'} */ tom) => { const s = h('span', '', t); if (tom) s.style.color = `var(--${tom})`; return s; };
    l.append(parte(`${f.loc} linhas`, f.loc > 400 ? 'err' : f.loc > 250 ? 'warn' : ''), document.createTextNode(' · '), parte(`CC ${f.cc_max}`, f.cc_max > 20 ? 'err' : f.cc_max > 10 ? 'warn' : ''), document.createTextNode(' · '),
      parte(`maior função ${f.longest_fn} linhas`, f.longest_fn > 80 ? 'err' : f.longest_fn > 40 ? 'warn' : ''), document.createTextNode(' · '), parte(`${f.churn.commits} commit(s) em 30 d`, f.churn.commits >= 4 ? 'warn' : ''), document.createTextNode(' · '),
      parte(`hotspot ${f.hotspot}`, f.hotspot >= 45 ? 'err' : f.hotspot >= 20 ? 'warn' : ''), document.createTextNode(` · fan-in ${f.fan_in} / fan-out ${f.fan_out}`));
    return l;
  };

  /** @type {Record<string, () => void>} */
  const VIEWS = {
    mapa() { mapaTab(body); },
    arq() { arqTab(body); },
    prio() {
      if (hl.all_ok) body.append(h('p', 'small muted', 'Dentro dos limites. Abaixo, os 3 arquivos com mais atividade (churn e tamanho) para você acompanhar.'));
      hl.priorities.forEach((/** @type {any} */ pr) => {
        const f = pr.row, c = h('div', 'prio'), t = h('div', 'row'); t.append(h('b', 'grow mono', f.path), nivel(pr.level)); c.append(t, metricas(f));
        if (pr.advice.length) { const ul = h('ul'); pr.advice.forEach((/** @type {string} */ a) => { const li = h('li'); li.append(inline(a)); ul.append(li); }); c.append(ul); } else c.append(h('p', 'small muted', 'Sem ação recomendada: métricas dentro dos limites.'));
        const ac = h('div', 'row'); ac.style.marginTop = 'var(--s3)';
        ac.append(button('Pedir sugestão ao arquiteto', { small: true, title: 'Gasta tokens (teto US$ 0,40)', onClick: askRefactor(f, pr.advice) }),
          button('Anexar', { small: true, variant: 'ghost', icon: 'clip', onClick: () => { S.draft.push({ type: 'file', path: 'back-end/' + f.path }); updFoot(); toast('anexado'); } }));
        c.append(ac); body.append(c);
      });
    },
    files() {
      const bar = h('div', 'row'); bar.style.marginBottom = 'var(--s3)'; const holder = h('div'); let lv = 'todos';
      const draw = () => holder.replaceChildren(table({
        columns: [
          { key: 'path', label: 'Arquivo', sortable: true, render: f => h('span', 'mono', f.path) },
          { key: 'level', label: 'Nível', sortable: true, value: f => ({ ok: 0, 'atenção': 1, alto: 2 })[/** @type {'ok'} */ (f.level)], render: f => nivel(f.level) },
          { key: 'loc', label: 'Linhas', align: 'r', sortable: true }, { key: 'functions', label: 'Funções', align: 'r', sortable: true },
          { key: 'cc_max', label: 'CC', align: 'r', sortable: true }, { key: 'longest_fn', label: 'Maior fn', align: 'r', sortable: true },
          { key: 'commits', label: 'Churn', align: 'r', sortable: true, value: f => f.churn.commits }, { key: 'hotspot', label: 'Hotspot', align: 'r', sortable: true },
          { key: 'fan_in', label: 'Fan-in', align: 'r', sortable: true }, { key: 'fan_out', label: 'Fan-out', align: 'r', sortable: true },
        ],
        rows: hl.files.filter((/** @type {any} */ f) => lv === 'todos' || f.level === lv), sort: { key: 'hotspot', dir: -1 }, empty: 'Nenhum arquivo neste nível.',
      }));
      const seg = h('div', 'seg'); ['todos', 'ok', 'atenção', 'alto'].forEach(k => { const b = h('button', k === 'todos' ? 'on' : '', k); b.onclick = () => { lv = k; seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); draw(); }; seg.append(b); });
      bar.append(seg, h('span', 'small muted', 'Churn = commits em 30 dias · hotspot = churn × CC'));
      draw(); body.append(bar, holder);
    },
    funcs() {
      body.append(h('p', 'small muted', 'Complexidade ciclomática aproximada. Linhas tracejadas na barra: 10 (atenção) e 20 (alto).'));
      const MX = Math.max(25, ...hl.functions.map((/** @type {any} */ f) => f.cc));
      body.append(table({
        columns: [
          { key: 'name', label: 'Função', render: f => { const c = h('div'); c.append(h('b', 'mono', f.name + '()'), h('div', 'small muted mono', f.path + ':' + f.line)); return c; } },
          { key: 'cc', label: 'Complexidade', sortable: true, render: f => { const bar = h('div', 'ccbar'), i = h('i', f.cc > 20 ? 'b' : f.cc > 10 ? 'w' : ''); i.style.width = (f.cc / MX * 100) + '%'; bar.append(i); [10, 20].forEach(t => { const u = h('u'); u.style.left = (t / MX * 100) + '%'; bar.append(u); }); bar.style.minWidth = '160px'; return bar; } },
          { key: 'cc', label: 'CC', align: 'r', sortable: true }, { key: 'lines', label: 'Linhas', align: 'r', sortable: true },
        ], rows: hl.functions, sort: { key: 'cc', dir: -1 },
      }));
    },
    ver() {
      const names = /** @type {Record<string, string>} */ ({ verify: 'typecheck · lint · testes', check_tenant: 'isolamento por restaurante', doc_drift: 'documentação x código' });
      const run = button('Rodar e registrar agora', { variant: 'primary', onClick: guard(async () => {
        run.setAttribute('disabled', '');
        try { for (const k of ['verify', 'check_tenant', 'doc_drift']) { run.textContent = 'rodando ' + k + '…'; await api('script/' + k, 'POST', {}); } toast('verificações registradas'); renderSaude(); } finally { run.removeAttribute('disabled'); run.textContent = 'Rodar e registrar agora'; }
      }) });
      const hv = h('div'); hv.append(h('h3', '', 'Histórico das verificações'));
      Object.keys(names).forEach(n => {
        const rows = hist.filter((/** @type {any} */ x) => x.name === n).slice(-30), blk = h('div'); blk.style.margin = 'var(--s4) 0';
        blk.append(h('div', '', names[n]), h('div', 'small muted', rows.length ? 'última: ' + rows[rows.length - 1].summary : 'nunca rodou'));
        const dots = h('div', 'dots'); dots.style.marginTop = 'var(--s2)'; rows.forEach((/** @type {any} */ x) => { const i = h('i', x.ok ? '' : 'no'); i.title = new Date(x.t * 1000).toLocaleString('pt-BR') + ' · ' + x.summary; dots.append(i); }); blk.append(dots); hv.append(blk);
      });
      hv.append(run);
      const ch = h('div'); ch.style.marginTop = 'var(--s6)'; ch.append(h('h3', '', 'Churn em 30 dias'), h('p', 'small muted', 'Commits por arquivo (só src/). Arquivo que muda muito pode estar instável ou faltar contexto à IA.'));
      const cmx = Math.max(1, ...hl.top_churn.map((/** @type {any} */ x) => x.commits)), bars = h('div', 'bars');
      hl.top_churn.forEach((/** @type {any} */ x) => { const r = h('div', 'barrow'), tr = h('div', 'tr'), b = h('div', 'br'); b.style.width = (x.commits / cmx * 100) + '%'; tr.append(b); r.append(h('span', 'lb', x.path.split('/').pop()), tr, h('span', 'num faint', `${x.commits} · +${x.add} −${x.del}`)); bars.append(r); });
      ch.append(bars); body.append(hv, ch);
    },
    concept() {
      body.append(h('p', 'small muted', hl.note));
      hl.definitions.forEach((/** @type {any} */ d) => { const r = h('div', 'def'); r.append(h('b', '', d.term), h('div', '', d.def), h('div', 'lm', 'limites: ' + d.limit)); body.append(r); });
    },
  };
  show(S.saudeTab || 'prio');
}
