// @ts-check
import { api } from '../api.js';
import { $, h } from '../lib/dom.js';
import { hashParams, setHashParams } from '../router.js';
import { ghLink, unavailableCard } from '../ui/gh-common.js';
import { issuesPanel } from '../ui/gh-issues.js';
import { prsPanel } from '../ui/gh-prs.js';
import { runsPanel } from '../ui/gh-runs.js';
import { skeleton } from '../ui/skeleton.js';

const TABS = /** @type {const} */ ([['prs', 'Pull requests', prsPanel], ['actions', 'Actions', runsPanel], ['issues', 'Issues', issuesPanel]]);

/** Tela GitHub: PRs, Actions e Issues pelo `gh`. Sem gh instalado/autenticado mostra o passo a passo e o painel segue normal. @param {boolean} [fresh] */
export async function renderGithub(fresh = false) {
  const main = $('#main'); main.className = ''; main.replaceChildren(skeleton(4));
  const st = await api('gh/status' + (fresh ? '?refresh=1' : ''));
  if (!st.installed || !st.authenticated || !st.repo) { main.replaceChildren(unavailableCard({ ...st, reason: st.installed ? 'not_authenticated' : 'not_installed' }, () => renderGithub(true))); return; }
  main.replaceChildren();
  const bar = h('div', 'row'); bar.style.cssText = 'gap:12px;margin-bottom:14px';
  const seg = h('div', 'seg'), body = h('div');
  let tab = hashParams().get('tab') || 'prs'; if (!TABS.some(t => t[0] === tab)) tab = 'prs';
  /** @param {string} key @param {boolean} refresh */
  const show = (key, refresh) => { tab = key; seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', /** @type {HTMLElement} */ (b).dataset.tab === key)); setHashParams({ tab: key === 'prs' ? '' : key }); const t = TABS.find(x => x[0] === key) || TABS[0]; return t[2](body, { fresh: refresh }); };
  TABS.forEach(([k, label]) => { const b = h('button', k === tab ? 'on' : '', label); b.dataset.tab = k; b.onclick = () => { setHashParams({ pr: '', run: '' }); show(k, false); }; seg.append(b); });
  const refresh = h('button', 'btn sm', 'Atualizar'); refresh.title = 'Ignora o cache de 60 s'; refresh.onclick = () => show(tab, true);
  bar.append(seg, h('span', 'grow'), h('span', 'hint', st.user ? `@${st.user} em ` : ''), ghLink('https://github.com/' + st.repo, st.repo, 'chipb'), refresh);
  main.append(bar, body); await show(tab, false);
}
