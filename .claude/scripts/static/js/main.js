// @ts-check
import './ui/theme.js';
import { api } from './api.js';
import { $, h, ico } from './lib/dom.js';
import { buildNav, openFromHash } from './router.js';
import { S } from './store.js';
import { refreshStatus, renderChips, startStatus } from './status.js';
import { watchLabels } from './ui/a11y.js';
import { installKeys } from './ui/nav-keys.js';
import { showHelp } from './ui/nav-help.js';
import { showPalette } from './ui/nav-palette.js';
import { button } from './ui/button.js';

window.onerror = (m, s, l) => { document.body.dataset.err = m + ' @' + l; };
$('#logoi').append(ico('spark'));
buildNav($('#menu')); watchLabels($('#main')); renderChips();
addEventListener('popstate', openFromHash);

// botão "Ctrl K" no topo, antes do botão de tema (texto, sem ícone)
const mac = /Mac|iPhone|iPad/.test(navigator.platform);
const kb = button(mac ? '⌘ K' : 'Ctrl K', { variant: 'ghost', small: true, title: 'Paleta de comandos (? mostra todos os atalhos)', onClick: () => showPalette() });
kb.setAttribute('aria-label', 'Abrir a paleta de comandos'); kb.classList.add('mono');
$('#theme').before(kb);

// menu recolhível: o estado fica no navegador
const toggle = $('#navtoggle');
/** @param {boolean} min */
function setNav(min) {
  document.body.dataset.nav = min ? 'min' : ''; toggle.setAttribute('aria-pressed', String(min)); toggle.setAttribute('aria-label', min ? 'Expandir o menu' : 'Recolher o menu'); toggle.title = toggle.getAttribute('aria-label') || '';
  try { localStorage.setItem('nav', min ? 'min' : ''); } catch (e) { /* sem storage */ }
}
toggle.append(ico('chev'), h('span', 'lbl', 'Recolher menu'));
toggle.onclick = () => setNav(document.body.dataset.nav !== 'min');
try { setNav(localStorage.getItem('nav') === 'min'); } catch (e) { setNav(false); }
installKeys({ palette: showPalette, help: showHelp });

(async () => {
  try { S.cat = await api('catalog', 'GET', undefined, { global: true }); } catch (e) { S.cat = { agents: [], knowledge: [] }; }
  try { await refreshStatus(); } catch (e) { /* o Socket.IO tenta de novo */ }
  startStatus();
  openFromHash();
})();
