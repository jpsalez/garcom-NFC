// @ts-check
import { watch } from '../lib/realtime.js';
import { api } from '../api.js';
import { $, h } from '../lib/dom.js';
import { hh } from '../lib/format.js';
import { S } from '../store.js';
import { guard } from '../ui/toast.js';
import { agentCard } from './conversa.js';

/* ---------- Ao vivo ---------- */
export async function renderVivo() {
  const main = $('#main'); main.className = ''; main.replaceChildren();
  const top = h('div', 'row'); const sel = h('select'); top.append(h('span', 'mut', 'Sessão'), sel, h('span', 'hint', 'somente leitura: o Claude Code não permite controlar de fora os agentes de uma sessão interativa. Para conversar, pausar ou parar, use a aba Conversa.')); main.append(top);
  const body = h('div'); body.style.marginTop = '16px'; main.append(body);
  const paintRaw = async () => {
    const s = await api('live' + (S.liveSession ? '?session=' + S.liveSession : ''));
    const ss = await api('sessions'); sel.replaceChildren(); ss.forEach(x => sel.append(new Option(x.title.slice(0, 40) + ' · ' + x.mtime + (x.panel ? ' (painel)' : ''), x.id))); sel.value = s.session; sel.onchange = () => { S.liveSession = sel.value; paint(); };
    body.replaceChildren(); const col = h('div', 'col'); col.style.cssText = 'max-width:900px;margin:0;padding:0'; body.append(col);
    s.agents.forEach(a => { const it = { type: 'agent', e: { id: 'live-' + a.id, stype: a.type, desc: a.name }, status: a.status === 'concluido' ? 'ok' : 'rodando', nested: a.events.map(e => ({ type: 'tool', e: { tool: e.tool, kind: e.kind, target: e.target }, status: 'ok', t0: e.t })), t0: a.first, t1: a.status === 'concluido' ? a.last : null };
      const card = agentCard(it); card.style.marginLeft = '0'; if (a.status === 'ocioso') card.classList.remove('rodando'); col.append(card); });
    if (s.files.length) { const c = h('div', 'card'); c.style.marginTop = '16px'; c.append(h('h3', '', 'Arquivos editados na sessão')); const t = h('table'); const hr = h('tr'); ['Arquivo', 'Edições', 'Quem', 'Hora'].forEach(x => hr.append(h('th', '', x))); t.append(hr); s.files.forEach(f => { const r = h('tr'); r.append(h('td', f.conflict ? 'st-erro' : '', (f.conflict ? '⚠ ' : '') + f.path), h('td', 'mono', f.edits), h('td', '', [...new Set(f.agents)].join(', ')), h('td', 'mono', hh(f.t))); t.append(r); }); c.append(t); body.append(c); }
  };
  const paint = guard(paintRaw);
  await paint(); S.timers.push(watch('live', paintRaw, 6000));
}
