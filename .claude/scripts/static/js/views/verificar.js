// @ts-check
import { api } from '../api.js';
import { $, h } from '../lib/dom.js';
import { ago } from '../lib/format.js';
import { go } from '../router.js';
import { S } from '../store.js';
import { badge } from '../ui/badge.js';
import { button } from '../ui/button.js';
import { section } from '../ui/section.js';
import { guard } from '../ui/toast.js';

const CHECKS = [['verify', 'Typecheck + lint + testes'], ['check_tenant', 'Isolamento por restaurante'], ['routes', 'Rotas'], ['doc_drift', 'Documentação x código'], ['repo_map', 'Mapa do código'], ['ai_mode', 'Modo IA']];
const STATUS = /** @type {Record<string, string>} */ ({ M: 'modificado', A: 'novo', D: 'apagado', '?': 'não rastreado' });

/** Coluna "Verificações": um botão por script (lista fixa do servidor) e a saída embaixo. */
function verificacoes() {
  const s = section('Verificações'), row = h('div', 'row'), out = h('pre', 'vout'); out.textContent = 'Escolha uma verificação.';
  CHECKS.forEach(([k, label]) => {
    const b = button(label, { small: true });
    b.onclick = guard(async () => {
      b.setAttribute('disabled', ''); out.textContent = 'executando…';
      try { const r = await api('script/' + k, 'POST', {}); out.textContent = (r.code === 0 ? '✔ ' : '✖ código ' + r.code + '\n') + r.out; } finally { b.removeAttribute('disabled'); }
    });
    row.append(b);
  });
  s.body.append(row, out, h('p', 'small muted', 'Só roda os scripts de .claude/scripts (lista fixa). Testes com banco precisam do Docker.'));
  return s.el;
}

/** Coluna "Git do monorepo": branch, à frente/atrás, alterações por pasta e os últimos commits. */
function gitDoMonorepo() {
  const s = section('Git do monorepo'), box = h('div');
  const load = guard(async () => {
    const x = await api('gitsummary'); box.replaceChildren();
    const line = h('div', 'row'); line.append(h('b', 'mono', x.upstream ? `${x.branch} → ${x.upstream}` : `${x.branch} (sem remoto configurado)`));
    if (x.ahead) line.append(badge('↑ ' + x.ahead + ' a enviar', 'accent'));
    if (x.behind) line.append(badge('↓ ' + x.behind + ' a receber', 'warn'));
    if (!x.ahead && !x.behind) line.append(badge(x.clean ? 'árvore limpa' : 'há alterações', x.clean ? 'ok' : 'warn'));
    const areas = h('div', 'areas');
    ['back-end', 'front-end', 'raiz'].forEach(k => {
      const c = x.areas[k], n = Object.values(c).reduce((a, v) => a + /** @type {number} */ (v), 0), a = h('div', 'area'), cs = h('div', 'cs');
      Object.entries(c).forEach(([code, v]) => cs.append(h('span', 'c' + code, `${STATUS[code] || code} ${v}`)));
      a.append(h('b', '', k), h('div', 'n', String(n)), cs); areas.append(a);
    });
    const rec = h('div'); rec.append(h('div', 'small muted', 'Últimos commits (clique para abrir em Commits)'));
    x.recent.forEach((/** @type {any} */ c) => { const r = h('button', 'grec'); r.append(h('span', 't', c.subject), h('span', 'm', c.short + ' · ' + ago(c.ts))); r.onclick = () => { S.commitSel = c.sha; go('commits'); }; rec.append(r); });
    box.append(line, areas, rec);
  });
  s.el.querySelector('.head')?.append(button('Atualizar', { variant: 'ghost', small: true, onClick: load }));
  s.body.append(box); load();
  return s.el;
}

export async function renderVerificar() {
  const main = $('#main'); main.className = ''; main.replaceChildren();
  const g = h('div', 'vgrid'); g.append(verificacoes(), gitDoMonorepo()); main.append(g);
}
