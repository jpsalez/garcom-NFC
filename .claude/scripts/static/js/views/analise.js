// @ts-check
import { api } from '../api.js';
import { $, h } from '../lib/dom.js';
import { fmtDur, fmtN } from '../lib/format.js';
import { S } from '../store.js';
import { badge } from '../ui/badge.js';
import { button } from '../ui/button.js';
import { rotulado } from '../ui/obs-common.js';
import { section, stats } from '../ui/section.js';
import { table } from '../ui/table.js';
import { guard } from '../ui/toast.js';

const TOM_ACHADO = /** @type {Record<string, 'err' | 'warn' | 'ok' | 'neutral'>} */ ({ alta: 'err', media: 'warn', baixa: 'neutral', ok: 'ok' });

/** Barras horizontais simples: rótulo, barra proporcional e valor. @param {{ label: string, value: number, text: string }[]} rows */
function barras(rows) {
  const mx = Math.max(1, ...rows.map(r => r.value)), box = h('div', 'hbars');
  rows.forEach(r => { const row = h('div', 'bar-row'), tr = h('div', 'bar-track'), b = h('i'); b.style.width = (r.value / mx * 100) + '%'; tr.append(b); row.append(h('span', 'ellipsis', r.label), tr, h('span', 'num muted small', r.text)); box.append(row); });
  return box;
}

/* ---------- Análise: custo e qualidade da orquestração de uma sessão ---------- */
export async function renderAnalise() {
  const main = $('#main'); main.className = ''; main.replaceChildren();
  const sel = h('select'); sel.setAttribute('aria-label', 'Sessão');
  const top = h('div', 'row'); top.append(rotulado('Sessão', sel), button('Atualizar', { small: true, onClick: () => load() })); main.append(top);
  const body = h('div', 'stack'); body.style.marginTop = 'var(--s5)'; main.append(body);
  const ss = await api('sessions'); ss.forEach((/** @type {any} */ x) => sel.append(new Option(x.title.slice(0, 44) + ' · ' + x.mtime + (x.panel ? ' (painel)' : ''), x.id))); if (S.anSession) sel.value = S.anSession; else S.anSession = sel.value;
  const load = guard(async () => {
    const a = await api('analysis?session=' + S.anSession); body.replaceChildren(); const K = a.kpis;
    body.append(stats([{ label: 'subagentes', value: K.agents, sub: a.orch.batches + ' lote(s) de delegação' }, { label: 'tokens novos', value: fmtN(K.tokens), sub: 'cache lido: ' + fmtN(K.cache_read) }, { label: 'duração da sessão', value: fmtDur(K.duration * 1000), sub: 'inclui pausas suas' }]));
    const o = section('Orquestrador');
    const linhas = [['delegações', a.orch.spawns], ['lotes (agentes lançados juntos)', a.orch.batches], ['briefing médio', a.orch.avg_briefing + ' caracteres'],
      ['1ª delegação após', a.orch.first_delegation_s == null ? '—' : fmtDur(a.orch.first_delegation_s * 1000)], ['mensagens a agentes (SendMessage)', a.orch.send_message], ['chamadas do principal', a.orch.main_calls],
      ['tokens novos: principal / subagentes', fmtN(a.orch.main_tokens) + ' / ' + fmtN(a.orch.sub_tokens)], ['paralelismo máximo', K.max_parallel + ' (' + K.parallel_time + ' s com 2+ agentes)'],
      ['arquivos editados', K.edited], ['erros de ferramenta', K.errors + ' de ' + K.calls + ' chamadas (' + (K.calls ? (100 * K.errors / K.calls).toFixed(1) : 0) + '%)']];
    o.body.append(table({ columns: [{ key: 'k', label: 'Medida' }, { key: 'v', label: 'Valor', align: 'r' }], rows: linhas.map(([k, v]) => ({ k, v })) })); body.append(o.el);
    if (a.findings.length) {
      const f = section('Achados (heurísticas)'), lista = h('div', 'list');
      a.findings.forEach((/** @type {any} */ x) => { const it = h('div', 'item achado'); const t = h('div', 'grow'); t.append(h('b', '', x.title), h('div', 'muted small', x.detail)); it.append(badge(x.sev, TOM_ACHADO[x.sev] || 'neutral'), t); lista.append(it); });
      f.body.append(lista); body.append(f.el);
    }
    const comTempo = a.agents.filter((/** @type {any} */ ag) => ag.start);
    if (comTempo.length) {
      const span = Math.max(1, a.t1 - a.t0), g = section('Linha do tempo dos subagentes'), gg = h('div', 'hbars');
      comTempo.forEach((/** @type {any} */ ag) => { const row = h('div', 'bar-row'), tr = h('div', 'bar-track'), b = h('i'); b.style.marginLeft = ((ag.start - a.t0) / span * 100) + '%'; b.style.width = Math.max(0.6, (ag.end - ag.start) / span * 100) + '%'; tr.append(b); row.append(h('span', 'ellipsis', ag.name), tr, h('span', 'num muted small', fmtDur((ag.end - ag.start) * 1000))); gg.append(row); });
      g.body.append(gg); body.append(g.el);
    }
    if (a.agents.length) {
      const tk = section('Quem custou o quê', { meta: 'tokens novos · chamadas' });
      tk.body.append(barras(a.agents.map((/** @type {any} */ ag) => { const v = (ag.usage.in || 0) + (ag.usage.out || 0) + (ag.usage.cache_w || 0); return { label: ag.name, value: v, text: fmtN(v) + ' · ' + ag.calls + ' ch.' }; }))); body.append(tk.el);
    }
    const ferr = Object.entries(a.tools);
    if (ferr.length) { const t = section('Ferramentas mais usadas'); t.body.append(barras(ferr.map(([k, v]) => ({ label: k, value: /** @type {number} */ (v), text: String(v) })))); body.append(t.el); }
    if (a.hot_files.length) {
      const hf = section('Arquivos mais lidos', { meta: 'contexto repetido custa tokens' });
      hf.body.append(table({ columns: [{ key: 'path', label: 'Arquivo', render: (/** @type {any} */ f) => { const c = h('span', 'mono small', f.path); return c; } }, { key: 'reads', label: 'Leituras', align: 'r' },
        { key: 'agents', label: 'Agentes', render: (/** @type {any} */ f) => f.agents.length + ' — ' + f.agents.slice(0, 3).join(', ') }], rows: a.hot_files })); body.append(hf.el);
    }
  });
  sel.onchange = () => { S.anSession = sel.value; load(); }; await load();
}
