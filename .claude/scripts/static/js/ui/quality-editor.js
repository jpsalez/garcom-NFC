import { h as e } from '../lib/dom.js';
export function ruleEditor(r){
 const row=e('section','hp-rule'),text=e('div');
 const descriptions={cc:'Quantos caminhos independentes existem dentro de uma função. Mais caminhos exigem mais cenários de teste.',length:'Quantas linhas de código uma função concentra. Ajuda a encontrar trechos difíceis de ler; não determina sozinho se estão bem escritos.',tests:'Verifica se a execução dos testes terminou sem falhas. Não exige escolher um número.',coverage:'Quanto do código da função foi executado pelos testes. Não significa que todos os comportamentos foram verificados.',crap:'Combina complexidade e cobertura para sinalizar funções difíceis de manter e pouco testadas. Quanto menor, melhor.',mutation:'Quanto das alterações artificiais no código os testes conseguiram detectar. Só pode ser avaliado com relatório de mutação.',srp:'Uma pessoa avalia se o módulo reúne motivos diferentes para mudar. Não existe nota numérica automática para isso.',boundaries:'Uma pessoa verifica se as dependências respeitam as responsabilidades e os contratos definidos para o projeto.'};
 text.append(e('h3','',r.title),e('p','',descriptions[r.id]));
 const config=e('div','hp-rule-config'),effect=e('p','hp-rule-effect');
 const consequence=()=>r.mode==='off'?'Regra desativada.':r.manual?(r.mode==='block'?'Exigir revisão humana antes da aprovação.':'Solicitar revisão humana, sem bloquear automaticamente.'):(r.id==='tests'?(r.mode==='block'?'Bloquear se algum teste falhar.':'Avisar se algum teste falhar.'):(r.mode==='block'?'Bloquear':'Avisar')+' quando '+({cc:'a complexidade ultrapassar '+r.limit+' caminhos por função.',length:'uma função ultrapassar '+r.limit+' linhas.',coverage:'a cobertura ficar abaixo de '+r.limit+'%.',crap:'o risco CRAP ultrapassar '+r.limit+' pontos.',mutation:'o mutation score ficar abaixo de '+r.limit+'%.'}[r.id]));
 const update=()=>effect.textContent=consequence();
 if(!r.manual&&r.id!=='tests'){
  const presets={cc:[[5,'Até 5 caminhos · mais rigoroso'],[10,'Até 10 caminhos · equilibrado'],[20,'Até 20 caminhos · mais tolerante']],length:[[20,'Até 20 linhas · funções curtas'],[40,'Até 40 linhas · equilibrado'],[80,'Até 80 linhas · mais tolerante']],coverage:[[70,'Pelo menos 70% · adoção gradual'],[80,'Pelo menos 80% · intermediário'],[90,'Pelo menos 90% · mais rigoroso']],crap:[[6,'Até 6 pontos · mais rigoroso'],[12,'Até 12 pontos · intermediário'],[30,'Até 30 pontos · mais tolerante']],mutation:[[60,'Pelo menos 60% · adoção gradual'],[80,'Pelo menos 80% · intermediário'],[90,'Pelo menos 90% · mais rigoroso']]};
  const label=e('label','','Tolerância da equipe'),select=e('select');select.setAttribute('aria-label','Tolerância: '+r.title);
  const options=presets[r.id];if(!options.some(([v])=>v===r.limit))options.push([r.limit,'Personalizado · '+r.limit]);
  options.forEach(([value,title])=>{const option=e('option','',title);option.value=String(value);option.selected=value===r.limit;select.append(option)});
  const advanced=e('details'),summary=e('summary','','Personalizar limite'),input=e('input');input.type='number';input.value=r.limit;input.min='0';input.step='1';if(r.min)input.max='100';input.setAttribute('aria-label','Limite personalizado: '+r.title);
  const unit={cc:'caminhos por função',length:'linhas por função',coverage:'% de cobertura por função',crap:'pontos de risco CRAP',mutation:'% de mutantes detectados'};
  const customLabel=e('label','',unit[r.id]);customLabel.append(input);advanced.append(summary,customLabel);
  select.onchange=()=>{r.limit=Number(select.value);input.value=r.limit;update()};input.oninput=()=>{r.limit=input.value===''?NaN:Number(input.value);update()};
  label.append(select);config.append(label,advanced);
 }else config.append(e('p','hp-muted',r.manual?'Critério qualitativo · revisão com justificativa':'Resultado esperado · todos os testes passando'));
 const behavior=e('label','','Se o critério não for atendido'),mode=e('select');mode.setAttribute('aria-label','Comportamento: '+r.title);
 [['off','Não aplicar esta regra'],['warn',r.manual?'Pedir revisão humana':'Mostrar aviso'],['block',r.manual?'Exigir revisão para aprovar':'Bloquear aprovação']].forEach(([k,v])=>{const o=e('option','',v);o.value=k;o.selected=r.mode===k;mode.append(o)});
 mode.onchange=()=>{r.mode=mode.value;update()};behavior.append(mode);config.append(behavior);text.append(e('small','',r.method));row.append(text,config,effect);update();return row;
}

