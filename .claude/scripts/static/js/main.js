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

window.onerror = (m, s, l) => { document.body.dataset.err = m + ' @' + l; };
$('#logoi').append(ico('spark'));
buildNav($('#menu')); watchLabels($('#main')); renderChips();
addEventListener('popstate', openFromHash);

// botão "Ctrl K" no topo, antes do botão de tema
const mac = /Mac|iPhone|iPad/.test(navigator.platform);
const kb = h('button', 'kbdbtn'); kb.type = 'button'; kb.title = 'Paleta de comandos (? mostra todos os atalhos)'; kb.setAttribute('aria-label', 'Abrir a paleta de comandos');
kb.append(h('kbd', '', mac ? '⌘ K' : 'Ctrl K')); kb.onclick = showPalette;
$('#theme').before(kb);
installKeys({ palette: showPalette, help: showHelp });

(async () => {
  try { S.cat = await api('catalog', 'GET', undefined, { global: true }); } catch (e) { S.cat = { agents: [], knowledge: [] }; }
  try { await refreshStatus(); } catch (e) { /* o Socket.IO tenta de novo */ }
  startStatus();
  openFromHash();
})();
