// @ts-check
import { api } from '../api.js';
import { $, h } from '../lib/dom.js';
import { go } from '../router.js';
import { watch } from '../lib/realtime.js';
import { S } from '../store.js';
import { badge } from '../ui/badge.js';
import { button } from '../ui/button.js';
import { section } from '../ui/section.js';
import { guard, toast } from '../ui/toast.js';
import { updFoot } from './conversa.js';

/** @typedef {{ id: string, titulo: string, detalhes: string[], nota: string, bloqueia: string[] }} Decisao */

const DEC_MD = '.claude/knowledge/garcom-nfc/decisoes.md';

/**
 * Uma decisão: caixa de marcar (só confirma depois do "Confirmar", nunca ao clicar), detalhes recolhíveis e o que ela bloqueia.
 * @param {Decisao} d @param {boolean} resolvida @param {() => void} recarregar
 */
function linha(d, resolvida, recarregar) {
  const box = h('div', 'dec'), head = h('div', 'dec-head'), cb = h('input'); cb.type = 'checkbox'; cb.checked = resolvida;
  cb.setAttribute('aria-label', (resolvida ? 'Reabrir ' : 'Marcar como decidida a ') + d.id);
  const t = h('div', 'dec-title'); t.append(h('span', 'id', d.id), h('b', '', d.titulo));
  if (d.bloqueia.length) t.append(document.createTextNode(' '), badge(`bloqueia ${d.bloqueia.length} tarefa${d.bloqueia.length === 1 ? '' : 's'}`, 'warn', d.bloqueia.join(', ')));
  cb.hidden=true;const decide=button(resolvida?'Reabrir decisão':'Registrar decisão',{small:true,onClick:()=>{cb.checked=!resolvida;cb.onchange();}});head.append(t,decide,cb); box.append(head);
  const notaSua = d.detalhes.find(x => x.startsWith('Nota sua:')), detalhes = d.detalhes.filter(x => x !== notaSua);  // a nota fica em destaque, fora do recolhível
  const nota = resolvida ? d.nota && 'Decidida: ' + d.nota : d.nota ? 'Nota sua: ' + d.nota : notaSua;
  if (nota) { const n = h('div', resolvida ? 'meta' : 'note'); n.textContent = nota; box.append(n); }
  if (detalhes.length) { const det = h('details'), ul = h('ul'); det.append(h('summary', '', 'Entender a decisão e suas alternativas')); detalhes.forEach(x => ul.append(h('li', '', x))); det.append(ul); box.append(det); }
  if (d.bloqueia.length) { const m = h('div', 'meta'); m.append(document.createTextNode('Tarefas bloqueadas: '));
    d.bloqueia.forEach((id, i) => { if (i) m.append(document.createTextNode(', ')); const a = h('a', 'mono', id); a.href = '#tarefas?q=' + id; a.onclick = e => { e.preventDefault(); go('tarefas', '', 'q=' + id); }; m.append(a); }); box.append(m); }

  // a caixa só pede confirmação: quem decide é você
  cb.onchange = () => {
    const quer = cb.checked; cb.checked = resolvida;
    const c = h('div', 'confirm'), nota = h('input'); nota.type = 'text'; nota.placeholder = quer ? 'O que ficou decidido e por quê?' : 'Motivo (opcional)'; nota.setAttribute('aria-label', 'Nota da decisão');
    const ok = button(quer ? 'Confirmar decisão' : 'Reabrir', { variant: 'primary', small: true, onClick: guard(async () => { await api('decisoes/' + d.id, 'PUT', { resolvida: quer, nota: nota.value }); toast(quer ? d.id + ' marcada como decidida' : d.id + ' reaberta'); c.remove(); recarregar(); }) });
    const no = button('Cancelar', { variant: 'ghost', small: true, onClick: () => { c.remove(); decide.focus(); } });
    c.append(nota, ok, no); box.querySelector('.confirm')?.remove(); box.append(c); nota.focus();
  };
  return box;
}

export async function renderDecisoes() {
  const main = $('#main'); main.className = 'utility-page decisions-page'; main.replaceChildren();
  const intro=h('div','ov-intro'),heading=h('div');heading.append(h('span','ov-kicker','Projeto / registro de escolhas'),h('h2','','Decisões'),h('p','','Registre suas escolhas para orientar os agentes e resolver pendências que bloqueiam tarefas.'));intro.append(heading);main.append(intro);const guide=h('div','utility-card decision-guide');guide.append(h('b','','Como usar'),h('p','','1. Leia o assunto e as tarefas afetadas.  2. Registre o que você decidiu.  3. Confirme para marcar como resolvida. Você pode reabrir depois.'),h('p','utility-note','Marcar como decidida registra a escolha; não implementa código nem conclui tarefas. O desbloqueio também depende das demais pendências da tarefa.'));main.append(guide);const wrap = h('div'); main.append(wrap);
  let editando = false;

  async function pintar() {
    if (editando || wrap.querySelector('.confirm')) return;
    const d = /** @type {{ pendentes: Decisao[], resolvidas: Decisao[], tarefas_bloqueadas: string[] }} */ (await api('decisoes'));
    const top = h('div', 'row'); top.append(h('p', 'grow muted small', 'As decisões ficam em decisoes.md, lido pelos agentes. Confirme apenas escolhas que você já fez; inclua uma nota para deixar claro o resultado.'),
      button('Editar registro completo', { onClick: editar }), button('Anexar ao contexto', { variant: 'ghost', icon: 'clip', onClick: () => { S.draft.push({ type: 'file', path: DEC_MD }); updFoot(); toast('anexado'); } }));
    const p = section(`Pendentes (${d.pendentes.length})`, { meta: d.tarefas_bloqueadas.length ? `${d.tarefas_bloqueadas.length} tarefas bloqueadas` : '' });
    if (d.pendentes.length) d.pendentes.forEach(x => p.body.append(linha(x, false, pintar))); else p.body.append(h('p', 'muted', 'Nenhuma decisão pendente.'));
    const r = section(`Resolvidas (${d.resolvidas.length})`);
    if (d.resolvidas.length) d.resolvidas.forEach(x => r.body.append(linha(x, true, pintar))); else r.body.append(h('p', 'muted', 'Ainda nenhuma.'));
    wrap.replaceChildren(top, p.el, r.el);
  }

  /** Editor do arquivo inteiro: só aparece aqui, e avisa que salvar substitui tudo. */
  async function editar() {
    editando = true;
    let txt;try{txt=(await api('decisions')).text}catch(err){editando=false;throw err}const ta = h('textarea', 'editor'); ta.setAttribute('aria-label', 'Texto do registro de decisões'); ta.value = txt;
    const sair = guard(async () => { editando = false; await pintar(); });
    const salvar = button('Salvar', { variant: 'primary', onClick: guard(async () => { await api('decisions', 'PUT', { text: ta.value }); toast('salvo'); await sair(); }) });
    wrap.replaceChildren(h('p', 'muted small', 'Salvar substitui o decisoes.md inteiro. Mexer na primeira linha das decisões (- [ ] DEC-NN · título) muda o que as telas mostram.'), ta, Object.assign(h('div', 'row'), {}));
    wrap.lastChild?.append(salvar, button('Cancelar', { onClick: sair })); ta.focus();
  }

  await pintar();
  S.timers.push(watch('decisions', pintar, 20_000));
}
