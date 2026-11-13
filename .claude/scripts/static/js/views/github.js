// @ts-check
import { $, h } from '../lib/dom.js';
import { ghLink } from '../ui/gh-common.js';

/** Vínculo local solicitado; não autentica, consulta ou modifica o GitHub. */
export async function renderGithub() {
  const main = $('#main'); main.className = 'github-page'; main.replaceChildren();
  const intro = h('div', 'ov-intro'), text = h('div'); text.append(h('span', 'ov-kicker', 'Workspace / repositório'), h('h2', '', 'GitHub'), h('p', '', 'Repositório associado a este projeto.')); intro.append(text); main.append(intro);
  const card = h('section', 'github-repository'); card.append(h('span', 'ov-label', 'Repositório do projeto'), h('h3', '', 'jpsalez / garcom-NFC'), h('p', '', 'O vínculo com o repositório está disponível. A integração de pull requests, Actions, issues e credenciais fica para uma próxima etapa.'), ghLink('https://github.com/jpsalez/garcom-NFC', 'Abrir repositório no GitHub', 'btn'));
  card.append(h('p', 'ov-note', 'Esta tela não solicita credenciais e não faz chamadas à API do GitHub.')); main.append(card);
}
