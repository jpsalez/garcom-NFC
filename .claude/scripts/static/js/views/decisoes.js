// @ts-check
import { api } from '../api.js';
import { $, h, ico } from '../lib/dom.js';
import { S } from '../store.js';
import { guard, toast } from '../ui/toast.js';
import { updFoot } from './conversa.js';

export async function renderDecisoes() {
  const main = $('#main'); main.className = ''; main.replaceChildren(); const c = h('div', 'card'); main.append(c); c.append(h('h3', '', 'Decisões de produto'), h('div', 'hint', 'Arquivo .claude/knowledge/garcom-nfc/decisoes.md. Os agentes leem isto e deixam de perguntar o que já foi decidido: mova itens de “Pendentes” para “Decididas”.'));
  const ta = h('textarea'); ta.setAttribute('aria-label', 'Texto do registro de decisões'); ta.style.cssText = 'min-height:56vh;font-family:var(--mono);margin-top:12px'; ta.value = (await api('decisions')).text; const sv = h('button', 'btn p', 'Salvar'); sv.onclick = guard(async () => { await api('decisions', 'PUT', { text: ta.value }); toast('salvo'); });
  const at = h('button', 'btn'); at.append(ico('clip'), document.createTextNode('Anexar ao contexto')); at.onclick = () => { S.draft.push({ type: 'file', path: '.claude/knowledge/garcom-nfc/decisoes.md' }); updFoot(); toast('anexado'); }; const r = h('div', 'row'); r.style.marginTop = '12px'; r.append(sv, at); c.append(ta, r);
}
