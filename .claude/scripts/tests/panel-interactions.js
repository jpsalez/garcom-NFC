/* Executado pelo smoke.mjs --eval-file. Valida sem alterar tarefas ou decisões do usuário. */
(async()=>{
 const check=(v,msg)=>{if(!v)throw Error(msg)},sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const text=()=>document.querySelector('#main').textContent;
 const click=async label=>{const b=[...document.querySelectorAll('#main button')].find(x=>x.textContent.trim()===label);check(b,'Botão ausente: '+label);b.click();await sleep(100)};
 const route=location.hash.split('?')[0];
 if(route==='#saude-do-codigo'){
  check(text().includes('Avaliação inconclusiva'),'Relatório ausente não pode aprovar');
  const id=document.querySelector('.hp-file-picker').value;
  await click('Regras e critérios');
  check(text().includes('Até 40 linhas · equilibrado'),'Limite sem explicação');
  check(!document.querySelector('[aria-label="Limite personalizado: Testes passando"]'),'Testes não devem ter limite numérico');
  await click('IA supervisionada');await click('Salvar política');
  const config=JSON.parse(localStorage.getItem('garcom-nfc:quality:v1'));check(config.policy.find(r=>r.id==='coverage').mode==='block','Política não persistiu');
  await click('Histórico e relatórios');const snapshot=text().match(/Snapshot: ([a-f0-9]{64})/)[1];
  const report={snapshot,testsPassed:true,functions:{[id]:{coverage:92,mutation:88}}};
  document.querySelector('[aria-label="Relatório JSON"]').value=JSON.stringify(report);await click('Importar relatório');await click('Diagnóstico');
  check(!text().includes('Avaliação inconclusiva'),'Relatório atual não aplicado');
  await click('Histórico e relatórios');report.snapshot='0'.repeat(64);document.querySelector('[aria-label="Relatório JSON"]').value=JSON.stringify(report);await click('Importar relatório');await click('Diagnóstico');
  check(text().includes('Avaliação inconclusiva'),'Relatório antigo foi aceito');
  await click('Explorar código');await click('Abrir código nesta linha →');await sleep(1500);check(location.hash.startsWith('#arquivos?path='),'Arquivo não abriu');check(document.querySelector('.cv'),'Visualizador não carregou');
  const {go}=await import('/static/js/router.js');await go('saude-do-codigo');
  return 'Política, relatório atual/antigo e vínculo de código passaram';
 }
 if(route==='#verificar'){
  const buttons=[...document.querySelectorAll('.utility-choice')];check(buttons.length===6,'Checagens ausentes');buttons[1].click();await sleep(100);
  check(text().includes('Somente leitura'),'Faltou efeito explicado');await click('Executar: Conferir isolamento por restaurante');
  for(let i=0;i<80&&document.querySelector('.utility-status').textContent.includes('Executando');i++)await sleep(100);
  check(!document.querySelector('.utility-status').textContent.includes('Não foi possível'),'Checagem não executou');
  check(document.querySelector('.vout').textContent.includes('tenant:'),'Saída real ausente');
  return 'Seleção e execução real de checagem passaram';
 }
 if(route==='#faq'){
  const q=document.querySelector('[aria-label="Buscar no FAQ"]');q.value='mutation';q.dispatchEvent(new Event('input'));
  check(document.querySelectorAll('.faq-question').length>0,'Busca sem resultado');check([...document.querySelectorAll('.faq-question')].every(x=>x.open),'Resultados não abertos');
  q.value='termo-que-nao-existe-1234';q.dispatchEvent(new Event('input'));check(text().includes('Nenhuma pergunta encontrada'),'Estado vazio ausente');
  return 'Busca e estado vazio do FAQ passaram';
 }
 if(route==='#decisoes'){
  check(text().includes('não implementa código'),'Efeito da decisão não explicado');
  const all=[...document.querySelectorAll('#main button')];const action=all.find(b=>b.textContent==='Registrar decisão');
  if(action){action.click();check(document.querySelector('.confirm'),'Confirmação não abriu');await click('Cancelar');check(!document.querySelector('.confirm'),'Cancelamento não fechou');}
  return 'Explicação e confirmação sem escrita verificadas';
 }
 return 'Tela sem mutações de teste';
})()
