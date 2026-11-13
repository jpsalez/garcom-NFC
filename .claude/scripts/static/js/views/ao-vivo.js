// @ts-check
import { watch } from '../lib/realtime.js';
import { api } from '../api.js';
import { $, h } from '../lib/dom.js';
import { hh } from '../lib/format.js';
import { S } from '../store.js';
import { emptyState } from '../ui/empty-state.js';
import { rotulado } from '../ui/obs-common.js';
import { agentCard } from '../ui/obs-trace.js';
import { section, stats } from '../ui/section.js';
import { table } from '../ui/table.js';
import { guard } from '../ui/toast.js';

/* ---------- Ao vivo: a sua sessão interativa (somente leitura) ---------- */
export async function renderVivo() {
  const main = $('#main'); main.className = ''; main.replaceChildren();
  const sel = h('select'); sel.setAttribute('aria-label', 'Sessão');
  const top = h('div', 'row'); top.append(rotulado('Sessão', sel), h('span', 'muted small grow', 'Somente leitura: o Claude Code não deixa controlar de fora os agentes de uma sessão interativa. Para conversar, pausar ou parar, use a tela Conversa.')); main.append(top);
  const body = h('div', 'stack'); body.style.marginTop = 'var(--s5)'; main.append(body);
  const paintRaw = async () => {
    const s = await api('live' + (S.liveSession ? '?session=' + S.liveSession : ''));
    const ss = await api('sessions'); sel.replaceChildren();
    ss.forEach((/** @type {any} */ x) => sel.append(new Option(x.title.slice(0, 40) + ' · ' + x.mtime + (x.panel ? ' (painel)' : ''), x.id))); sel.value = s.session; sel.onchange = () => { S.liveSession = sel.value; paint(); };
    body.replaceChildren();
    const rodando = s.agents.filter((/** @type {any} */ a) => a.status === 'rodando').length;
    body.append(stats([{ label: 'agentes rodando', value: rodando }, { label: 'agentes na sessão', value: s.agents.length }, { label: 'arquivos editados', value: s.files.length }]));
    const ag = section('Agentes');
    if (!s.agents.length) ag.body.append(emptyState('Nenhum subagente nesta sessão.'));
    s.agents.forEach((/** @type {any} */ a) => {
      const it = { type: 'agent', e: { id: 'live-' + a.id, stype: a.type, desc: a.name }, status: a.status === 'concluido' ? 'ok' : 'rodando', nested: a.events.map((/** @type {any} */ e) => ({ type: 'tool', e: { tool: e.tool, kind: e.kind, target: e.target }, status: 'ok', t0: e.t })), t0: a.first, t1: a.status === 'concluido' ? a.last : null };
      const card = agentCard(it); if (a.status === 'ocioso') card.classList.remove('running'); ag.body.append(card);
    });
    body.append(ag.el);
    if (s.files.length) {
      const f = section('Arquivos editados na sessão');
      f.body.append(table({ columns: [
        { key: 'path', label: 'Arquivo', render: (/** @type {any} */ r) => { const sp = h('span', r.conflict ? 'err-t' : '', (r.conflict ? 'conflito · ' : '') + r.path); return sp; } },
        { key: 'edits', label: 'Edições', align: 'r' },
        { key: 'agents', label: 'Quem', render: (/** @type {any} */ r) => [...new Set(r.agents)].join(', ') },
        { key: 't', label: 'Hora', align: 'r', render: (/** @type {any} */ r) => hh(r.t) },
      ], rows: s.files }));
      body.append(f.el);
    }
  };
  const paint = guard(paintRaw);
  await paint(); S.timers.push(watch('live', paintRaw, 6000));
}
