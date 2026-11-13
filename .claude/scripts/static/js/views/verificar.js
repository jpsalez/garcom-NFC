import { api, isAbort } from '../api.js';
import { $, h } from '../lib/dom.js';
import { ago } from '../lib/format.js';
import { go } from '../router.js';
import { S } from '../store.js';
import { badge } from '../ui/badge.js';
import { button } from '../ui/button.js';
import { section } from '../ui/section.js';
import { guard } from '../ui/toast.js';
const STATUS={M:'modificado',A:'novo',D:'apagado','?':'não rastreado'};
export const CHECKS=[
 {id:'verify',title:'Validar o back-end',description:'Executa typecheck e, quando configurados, lint e testes do back-end. Mostra o resultado de cada etapa.',requirements:'Node, dependências instaladas e banco de testes disponível para testes que usam PostgreSQL.',effect:'Não corrige código. Testes podem escrever no banco de testes e gerar relatórios.'},
 {id:'check_tenant',title:'Conferir isolamento por restaurante',description:'Procura padrões de restaurant_id nos repositories. É uma checagem estática; não comprova ausência de vazamentos.',requirements:'Python e arquivos do projeto.',effect:'Somente leitura. O resultado indica trechos para revisão.'},
 {id:'doc_drift',title:'Comparar documentação e rotas',description:'Compara rotas documentadas com as rotas encontradas no back-end para apontar divergências.',requirements:'Python e documentação do projeto.',effect:'Somente leitura. Não atualiza a documentação automaticamente.'},
 {id:'routes',title:'Listar rotas da API',description:'Gera uma lista das rotas reconhecidas nos arquivos de código. Ajuda a conferir endpoints e documentação.',requirements:'Python. Não precisa da API no ar.',effect:'Somente leitura; não chama os endpoints.'},
 {id:'repo_map',title:'Listar a estrutura do código',description:'Mostra a organização de arquivos do back-end para orientar a navegação.',requirements:'Python e arquivos do projeto.',effect:'Somente leitura; não reorganiza pastas.'},
 {id:'ai_mode',title:'Consultar o modo IA',description:'Mostra a configuração local de modo IA e seus limites operacionais.',requirements:'Python e configuração local.',effect:'Consulta apenas. Não altera o modo e não inicia agentes.'}
];
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


export async function renderVerificar(){
 const main=$('#main');main.className='utility-page';main.replaceChildren();let selected=CHECKS[0],busy=false,alive=true;S.timers.push({remove(){alive=false}});
 const intro=h('div','ov-intro'),title=h('div');title.append(h('span','ov-kicker','Projeto / validação sob demanda'),h('h2','','Verificar'),h('p','','Execute uma checagem específica e entenda seu resultado antes de corrigir ou commitar.'));intro.append(title);main.append(intro);
 const layout=h('div','utility-grid'),list=h('section','utility-card'),workspace=h('section','utility-card');list.append(h('h3','','O que você quer conferir?'));const details=h('div'),status=h('p','utility-status','Nenhuma checagem foi executada nesta visita.'),out=h('pre','vout');out.textContent='A saída completa aparecerá aqui.';out.tabIndex=0;out.setAttribute('aria-label','Saída da checagem');status.setAttribute('role','status');
 const run=button('Executar checagem',{onClick:async()=>{if(busy)return;busy=true;draw();status.textContent='Executando '+selected.title.toLowerCase()+'… Você pode sair da tela; isso não interrompe o processo.';out.textContent='Aguardando o script local…';try{const r=await api('script/'+selected.id,'POST',{});if(!alive)return;status.textContent=(r.code===0?'Script terminou com código 0. Leia os resultados abaixo.':'Script terminou com falha · código '+r.code+'.')+' '+new Date().toLocaleTimeString('pt-BR');out.textContent=r.out||'Sem saída.'}catch(err){if(alive&&!isAbort(err)){status.textContent='Não foi possível concluir.';out.textContent=err.message}}finally{busy=false;if(alive)draw()}}});
 const buttons=[];CHECKS.forEach(check=>{const b=button('',{onClick:()=>{if(busy)return;selected=check;status.textContent='Pronto para executar. Esta checagem ainda não foi rodada nesta seleção.';out.textContent='A saída aparecerá após a execução.';draw()}});b.className='utility-choice';b.append(h('b','',check.title),h('span','',check.description));buttons.push([b,check]);list.append(b)});
 function draw(){buttons.forEach(([b,c])=>{b.classList.toggle('active',c===selected);b.disabled=busy});run.disabled=busy;run.textContent=busy?'Executando…':'Executar: '+selected.title;details.replaceChildren(h('span','ov-kicker','Checagem selecionada'),h('h3','',selected.title),h('p','',selected.description),h('p','utility-note','Precisa de: '+selected.requirements),h('p','utility-note','Efeito: '+selected.effect));}
 workspace.append(details,run,status,out);layout.append(list,workspace);main.append(layout);draw();
 const gitBox=h('details','utility-card utility-secondary');gitBox.append(h('summary','','Estado do Git · branch, alterações e últimos commits'));let loaded=false;gitBox.ontoggle=()=>{if(gitBox.open&&!loaded){loaded=true;gitBox.append(gitDoMonorepo())}};main.append(gitBox,h('p','utility-note','Nada é executado automaticamente. As checagens usam a lista fixa de scripts do painel e não chamam modelos de IA. Código 0 não significa cobertura completa nem ausência de problemas.'));
}
