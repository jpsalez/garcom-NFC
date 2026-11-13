export const defaults=[{id:'cc',title:'Complexidade por função',limit:10,mode:'warn',method:'Estimativa estática · confirmar com parser',why:'Limite escolhido pela equipe; não é uma regra universal de Clean Code.'},{id:'length',title:'Tamanho por função',limit:40,mode:'warn',method:'Linhas da função · estimativa',why:'Sinaliza esforço de leitura; tamanho não prova responsabilidade única.'},{id:'tests',title:'Testes passando',limit:1,min:true,mode:'block',report:true,method:'Relatório de execução do mesmo snapshot',why:'Arquivo de teste existente não comprova execução nem cobertura.'},{id:'coverage',title:'Cobertura por função (%)',limit:80,min:true,mode:'warn',report:true,method:'Relatório instrumentado por função',why:'Cobertura mede execução; não garante a qualidade das verificações.'},{id:'crap',title:'Risco CRAP',limit:12,mode:'warn',report:true,method:'CC² × (1 − cobertura)³ + CC',why:'12 é uma sugestão experimental ajustável. A fórmula exige cobertura e CC da mesma função.'},{id:'mutation',title:'Mutation score (%)',limit:80,min:true,mode:'off',report:true,method:'Relatório de mutação importado',why:'Execução custosa: somente sob demanda. Mutantes sobreviventes precisam de análise.'},{id:'srp',title:'Responsabilidade única',manual:true,mode:'warn',method:'Revisão humana com justificativa',why:'Avaliar motivos de mudança e atores de negócio. Uma regex não confirma SOLID.'},{id:'boundaries',title:'Limites de arquitetura',manual:true,mode:'warn',method:'Grafo de dependências + revisão',why:'Confirmar direção das dependências e contratos, considerando o contexto do projeto.'}];
export function evaluate(rule,fn,report,snapshot){
 if(rule.mode==='off')return {state:'Desativada',value:null};
 if(rule.manual)return {state:'Revisão humana',value:null};
 let value=fn[rule.id];
 if(rule.report){
  if(!report||report.snapshot!==snapshot)return {state:'Não medido',value:null};
  const entry=report.functions?.[fn.id];
  value=rule.id==='tests'?(typeof report.testsPassed==='boolean'?Number(report.testsPassed):null):rule.id==='crap'?entry?.coverage:entry?.[rule.id];
  if(value==null||!Number.isFinite(value))return {state:'Não medido',value:null};
  if(rule.id==='crap')value=fn.cc*fn.cc*(1-value/100)**3+fn.cc;
 }
 if(!Number.isFinite(value))return {state:'Não medido',value:null};
 const fail=rule.min?value<rule.limit:value>rule.limit;
 return {state:fail?(rule.mode==='block'?'Bloqueio':'Atenção'):'Dentro do critério',value};
}
export function validateReport(report){
 if(!report||typeof report.snapshot!=='string'||!/^[a-f0-9]{64}$/.test(report.snapshot))throw Error('Informe o snapshot completo do diagnóstico.');
 if(report.testsPassed!=null&&typeof report.testsPassed!=='boolean')throw Error('testsPassed deve ser true ou false.');
 if(!report.functions||typeof report.functions!=='object'||Array.isArray(report.functions))throw Error('functions deve ser um objeto com os IDs das funções.');
 for(const v of Object.values(report.functions)){if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Entrada de função inválida.');for(const k of ['coverage','mutation'])if(v[k]!=null&&(!Number.isFinite(v[k])||v[k]<0||v[k]>100))throw Error(k+' deve estar entre 0 e 100.');}
 return report;
}
