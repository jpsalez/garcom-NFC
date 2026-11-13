// @ts-check
import { api } from '../api.js';
import { $, h, stagger } from '../lib/dom.js';
import { ago } from '../lib/format.js';
import { go } from '../router.js';
import { S } from '../store.js';
import { guard } from '../ui/toast.js';

/* ---------- Verificar / Decisões ---------- */
export async function renderVerificar() {
  const main = $('#main'); main.className = ''; main.replaceChildren(); const g = h('div', 'bento'); main.append(g); const a = h('div', 'card s6'), b = h('div', 'card s6'); g.append(a, b);
  a.append(h('h3', '', 'Verificações')); const row = h('div', 'row'); const out = h('pre', '', 'Escolha uma verificação.'); out.style.marginTop = '12px';
  [['verify', 'Typecheck + lint + testes'], ['check_tenant', 'Isolamento por restaurante'], ['routes', 'Rotas'], ['doc_drift', 'Documentação x código'], ['repo_map', 'Mapa do código'], ['ai_mode', 'Modo IA']].forEach(([k, l]) => { const bt = h('button', 'btn sm', l); bt.onclick = guard(async () => { bt.disabled = true; out.textContent = 'executando…'; try { const r = await api('script/' + k, 'POST', {}); out.textContent = (r.code === 0 ? '✔ ' : '✖ código ' + r.code + '\n') + r.out; } finally { bt.disabled = false; } }); row.append(bt); });
  a.append(row, out, h('div', 'hint', 'Só roda os scripts de .claude/scripts (lista fixa). Testes com banco precisam do Docker.'));
  b.classList.add('gsum'); b.append(h('h3', '', 'Git do monorepo'));
  const gbox = h('div'); const rf = h('button', 'btn sm', 'Atualizar'); b.append(rf, gbox);
  const load = guard(async () => {
    const x = await api('gitsummary'); gbox.replaceChildren();
    const sync = x.upstream ? `${x.branch} → ${x.upstream}` : `${x.branch} (sem remoto configurado)`;
    const line = h('div', 'row'); line.style.margin = '10px 0'; line.append(h('b', 'mono', sync), x.ahead ? h('span', 'tag ai1', '↑ ' + x.ahead + ' a enviar') : h('span'), x.behind ? h('span', 'tag ai2', '↓ ' + x.behind + ' a receber') : h('span'), x.clean ? h('span', 'tag tst', 'árvore limpa') : h('span', 'tag ai2', 'há alterações'));
    const areas = h('div', 'areas');
    ['back-end', 'front-end', 'raiz'].forEach(k => { const c = x.areas[k], n = Object.values(c).reduce((a, v) => a + /** @type {number} */ (v), 0), box = h('div', 'garea'); box.append(h('b', '', k), h('div', 'n', String(n)));
      const cs = h('div', 'cs'); Object.entries(c).forEach(([code, v]) => cs.append(h('span', 'c' + code, `${{ M: 'modificado', A: 'novo', D: 'apagado', '?': 'não rastreado' }[/** @type {'M'} */ (code)] || code} ${v}`))); box.append(cs); areas.append(box); });
    gbox.append(line, areas, h('div', 'hint', 'Últimos commits (clique para abrir em Commits)'));
    x.recent.forEach((/** @type {any} */ c) => { const r = h('button', 'grec'); r.append(h('span', 't', c.subject), h('span', 'm', c.short + ' · ' + ago(c.ts))); r.onclick = () => { S.commitSel = c.sha; go('commits'); }; gbox.append(r); });
  }); rf.onclick = load; load(); stagger(g);
}
