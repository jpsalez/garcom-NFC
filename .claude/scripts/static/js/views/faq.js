import { $, h } from '../lib/dom.js';
import { norm } from '../lib/format.js';
import { go } from '../router.js';
import { S } from '../store.js';
import { button } from '../ui/button.js';
import { FAQ } from '../ui/faq-data.js';
import { renderDicionario } from './dicionario.js';

export async function renderFaq(){
 const main=$('#main');main.className='utility-page faq-page';main.replaceChildren();
 const intro=h('div','ov-intro'),title=h('div');title.append(h('span','ov-kicker','Ajuda / como usar o painel'),h('h2','','Perguntas frequentes'),h('p','','Entenda o que cada tela faz, quando usar e o que acontece ao executar uma ação.'));intro.append(title);main.append(intro);
 const tools=h('div','faq-tools'),search=h('input'),category=h('select'),count=h('span','utility-note');search.type='search';search.value=S.dictQ||'';search.placeholder='Buscar uma dúvida: agentes, regras, tarefas…';search.setAttribute('aria-label','Buscar no FAQ');category.setAttribute('aria-label','Categoria do FAQ');category.append(new Option('Todos os assuntos',''));[...new Set(FAQ.map(x=>x.category))].forEach(c=>category.append(new Option(c,c)));tools.append(search,category,count);main.append(tools);
 const list=h('div','faq-list');main.append(list);
 const draw=()=>{const q=norm(search.value),items=FAQ.filter(x=>(!category.value||x.category===category.value)&&(!q||norm(x.q+' '+x.a+' '+x.category).includes(q)));count.textContent=items.length+' perguntas';list.replaceChildren();items.forEach(x=>{const d=h('details','faq-question'),summary=h('summary');summary.append(h('span','faq-category',x.category),h('span','',x.q));d.append(summary,h('p','',x.a),button('Abrir a tela relacionada →',{small:true,variant:'ghost',onClick:()=>go(x.route)}));if(q)d.open=true;list.append(d)});if(!items.length)list.append(h('p','utility-card','Nenhuma pergunta encontrada. Tente outra palavra ou selecione Todos os assuntos.'))};
 search.oninput=()=>{S.dictQ=search.value;draw()};category.onchange=draw;draw();
 const extra=h('section','utility-card utility-secondary');extra.append(h('h3','','Procurando um termo técnico?'),h('p','','As definições anteriores continuam disponíveis como referência complementar.'),button('Consultar glossário técnico',{onClick:async()=>{await renderDicionario();const back=button('← Voltar ao FAQ',{onClick:()=>{S.dictQ='';renderFaq()}});main.prepend(back)}}));main.append(extra);
}
