// @ts-check
import { api } from '../api.js';
import { $, countUp, h, stagger } from '../lib/dom.js';
import { fmtDur, fmtN } from '../lib/format.js';
import { S } from '../store.js';
import { guard } from '../ui/toast.js';

/* ---------- Análise ---------- */
export async function renderAnalise() {
  const main = $('#main'); main.className = ''; main.replaceChildren(); const top = h('div', 'row'); const sel = h('select'); top.append(h('span', 'mut', 'Sessão'), sel); const rf = h('button', 'btn sm', 'Atualizar'); top.append(rf); main.append(top);
  const body = h('div', 'bento'); body.style.marginTop = '16px'; main.append(body);
  const ss = await api('sessions'); ss.forEach(x => sel.append(new Option(x.title.slice(0, 44) + ' · ' + x.mtime + (x.panel ? ' (painel)' : ''), x.id))); if (S.anSession) sel.value = S.anSession; else S.anSession = sel.value;
  const load = guard(async () => {
    body.replaceChildren(); for (let i = 0; i < 4; i++) { const c = h('div', 'card s3'); c.append(h('div', 'skel'), h('div', 'skel')); body.append(c); }
    const a = await api('analysis?session=' + S.anSession); body.replaceChildren(); const K = a.kpis;
    const kp = (label, v, fmt, sub) => { const c = h('div', 'card kpi hov s2'); const n = h('div', 'n', '0'); c.append(n, h('div', 'l', label), h('small', '', sub || '')); body.append(c); countUp(n, v, fmt); };
    kp('subagentes', K.agents, undefined, a.orch.batches + ' lote(s) de delegação'); kp('duração da sessão', K.duration, v => fmtDur(v * 1000), 'inclui pausas suas');
    kp('tokens novos', K.tokens, v => fmtN(Math.round(v)), 'cache lido: ' + fmtN(K.cache_read)); kp('paralelismo máximo', K.max_parallel, undefined, K.parallel_time + 's com 2+ agentes');
    kp('arquivos editados', K.edited, undefined, K.calls + ' chamadas de ferramenta'); kp('erros de ferramenta', K.errors, undefined, 'taxa ' + (K.calls ? (100 * K.errors / K.calls).toFixed(1) : 0) + '%');
    const o = h('div', 'card s6'); o.append(h('h3', '', 'Orquestrador')); const ot = h('table'); [['delegações', a.orch.spawns], ['lotes (agentes lançados juntos)', a.orch.batches], ['briefing médio', a.orch.avg_briefing + ' caracteres'], ['1ª delegação após', a.orch.first_delegation_s == null ? '—' : fmtDur(a.orch.first_delegation_s * 1000)], ['mensagens a agentes (SendMessage)', a.orch.send_message], ['chamadas do principal', a.orch.main_calls], ['tokens novos: principal / subagentes', fmtN(a.orch.main_tokens) + ' / ' + fmtN(a.orch.sub_tokens)]].forEach(([k, v]) => { const r = h('tr'); r.append(h('td', 'mut', k), h('td', 'mono', v)); ot.append(r); }); o.append(ot); body.append(o);
    const fd = h('div', 'card s6'); fd.append(h('h3', '', 'Achados (heurísticas)')); a.findings.forEach(x => { const r = h('div', 'find'); const d = h('div'); d.append(h('b', '', x.title), h('div', 'hint', x.detail)); r.append(h('span', 'sev ' + x.sev, x.sev), d); fd.append(r); }); body.append(fd);
    const g = h('div', 'card s12'); g.append(h('h3', '', 'Linha do tempo dos subagentes')); const span = Math.max(1, a.t1 - a.t0), gg = h('div', 'gantt');
    a.agents.forEach((ag, i) => { if (!ag.start) return; const r = h('div', 'gr'); const tr = h('div', 'tr'), br = h('div', 'br'); br.style.left = ((ag.start - a.t0) / span * 100) + '%'; br.style.width = Math.max(0.6, (ag.end - ag.start) / span * 100) + '%'; br.style.setProperty('--i', i); tr.append(br); r.append(h('span', 'lb', ag.name), tr, h('span', 'mono dim', fmtDur((ag.end - ag.start) * 1000))); gg.append(r); }); g.append(gg); if (gg.children.length) body.append(g);
    const tk = h('div', 'card s7'); tk.append(h('h3', '', 'Delegação: quem custou o quê (tokens novos · chamadas)')); const mx = Math.max(1, ...a.agents.map(x => (x.usage.in || 0) + (x.usage.out || 0) + (x.usage.cache_w || 0)));
    const tp = h('div', 'gantt bars'); a.agents.forEach((ag, i) => { const v = (ag.usage.in || 0) + (ag.usage.out || 0) + (ag.usage.cache_w || 0); const r = h('div', 'gr'); const t = h('div', 'tr'), b = h('div', 'br'); b.style.width = (v / mx * 100) + '%'; b.style.setProperty('--i', i); t.append(b); r.append(h('span', 'lb', ag.name), t, h('span', 'mono dim', fmtN(v) + ' · ' + ag.calls + 'c')); tp.append(r); }); tk.append(tp); body.append(tk);
    const tl = h('div', 'card s5'); tl.append(h('h3', '', 'Ferramentas mais usadas')); const tmx = Math.max(1, ...Object.values(a.tools)); const tb = h('div', 'gantt bars ed'); Object.entries(a.tools).forEach(([k, v], i) => { const r = h('div', 'gr'); const t = h('div', 'tr'), b = h('div', 'br'); b.style.width = (v / tmx * 100) + '%'; b.style.setProperty('--i', i); t.append(b); r.append(h('span', 'lb', k), t, h('span', 'mono dim', v)); tb.append(r); }); tl.append(tb); body.append(tl);
    const hf = h('div', 'card s12'); hf.append(h('h3', '', 'Arquivos mais lidos (contexto repetido custa tokens)')); const ht = h('table'); const hr = h('tr'); ['Arquivo', 'Leituras', 'Agentes'].forEach(x => hr.append(h('th', '', x))); ht.append(hr); a.hot_files.forEach(f => { const r = h('tr'); r.append(h('td', 'mono', f.path), h('td', 'mono', f.reads), h('td', f.agents.length >= 3 ? 'st-pausado' : '', f.agents.length + ' — ' + f.agents.slice(0, 3).join(', '))); ht.append(r); }); hf.append(ht); body.append(hf);
    stagger(body); });
  sel.onchange = () => { S.anSession = sel.value; load(); }; rf.onclick = load; await load();
}
