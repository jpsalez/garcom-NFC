# 1. Visão geral e escopo 

## 1.1 O que é o Garçom NFC 

O Garçom NFC é uma plataforma SaaS multi-restaurante de atendimento de mesa por toque. Cada mesa recebe uma plaquinha com um QR Code e, opcionalmente, uma tag NFC que gravam a mesma URL pública. O cliente aproxima o celular (ou lê o QR Code), abre a página da mesa no navegador, sem instalar aplicativo e sem fazer login, e aciona o garçom ou pede a conta com um toque. O restaurante vê esses chamados em tempo real numa tela de balcão. O slogan da documentação v0.3 resume a proposta: o cliente chama pelo QR Code e o pedido aparece na tela do balcão. 

O produto é documentado em duas versões de arquitetura, ambas marcadas como "Em validação" e atualizadas em 08/11/2026: a v0.2, mais ampla (cardápio, comanda, cozinha, avaliações, setores), e a v0.3, que reduz o escopo a um MVP focado em chamados. Complementam essas fontes dois guias internos (o documento de módulos do back-end e o guia de estudos) e o código real do back-end. A decisão de precedência adotada neste documento, em caso de conflito, é: código (comportamento atual) > v0.3 > v0.2 (ver seção 1.8). 

### 1.1.1 Pilha e equipe 

[Especificado] Front-end em Next.js; API em Node.js, Express e TypeScript; PostgreSQL; ambiente com Docker Compose. A equipe prevista é de duas pessoas: um desenvolvedor de front-end e um de back-end. [Implementado] Apenas o back-end existe no repositório (Express 5, Prisma 6, Zod 4, jsonwebtoken, tsyringe); não há front-end, Docker Compose, Dockerfile nem testes (ver capítulo 9). 

## 1.2 Objetivo e problema resolvido 

O objetivo do MVP (v0.3) é eliminar a espera "no aceno": o cliente que precisa do garçom ou da conta hoje procura o garçom com o olhar. Com o sistema, o chamado vira um card na tela do balcão, ordenado por chegada, e permanece visível até que um garçom o finalize depois de atender a mesa. O objetivo de longo prazo (v0.2) inclui ainda o lançamento de pedidos pelo garçom com envio direto à cozinha (KDS), avaliações de atendimento e relatórios para o gestor, descritos como "próximas fases" na v0.3.  
| Situação sem o sistema | Situação com o sistema | Versão em que é entregue |
|---|---|---|  
| Cliente acena ou espera o garçom passar | Chamado chega na hora ao balcão (v0.3) ou ao garçom do setor (v0.2) | MVP v0.3, Fase 2 [Especificado] | 
| Pedido da conta depende de abordar o garçom | Cliente pede a conta com um toque; vira card do tipo Conta | MVP v0.3, Fase 2 [Especificado] | 
| Pedido anotado e levado manualmente à cozinha | Comanda do celular do garçom direto ao KDS | Depois do MVP (v0.2 fases 3-4) [Especificado, futuro] | 
| Nenhum dado de qualidade do atendimento | Avaliações de atendimento, comida e restaurante; relatórios | Depois do MVP [Especificado, futuro] |   

## 1.3 Atores 

[Especificado, 12/11/2026, não implementado] Decisão do usuário: papéis SUPER_ADMIN (dono da plataforma), OWNER (substitui o ADMIN; dono de um restaurante) e STAFF; onde este capítulo diz Admin/ADMIN, leia OWNER como alvo (DV-48; `decisoes.md`). Hoje o código tem ADMIN/STAFF.

A v0.3 define três perfis de usuário humanos e um ator sistêmico. A v0.2 define quatro perfis (Cliente, Garçom, Cozinha/Bar, Admin) com papéis de banco ADMIN, WAITER e KITCHEN; a v0.3 e o código usam apenas ADMIN e STAFF (ver divergência DV-13).  
| Ator | Autenticação | Papel (enum) | O que pode fazer no MVP v0.3 | Observações |
|---|---|---|---|---|  
| Cliente | Nenhuma (sem login). Recebe um token opaco por aparelho ao entrar na mesa | Não é usuário do banco | Abrir a tela da mesa por QR Code ou NFC; chamar garçom; pedir a conta; ver a confirmação do chamado | [Especificado]. Anônimo (LGPD, RNF08) | 
| Balcão (garçons) | Login com JWT, usuário criado pelo Admin | STAFF | Ver cards dos chamados abertos; finalizar chamado; encerrar o atendimento de uma mesa; manter o atendimento aberto | [Especificado]. Tela única num computador do balcão, usada por todos os garçons; ainda não decidido se cada garçom terá login próprio (ponto a validar 2) | 
| Admin | Login com JWT | ADMIN | Autocadastrar o restaurante (quem cadastra vira Admin); cadastrar mesas e imprimir QR Codes; criar o acesso do balcão | [Implementado] só o registro de usuário ADMIN e o login (sem restaurante vinculado, ver DV-15) | 
| Sistema (job) | Interno | Não se aplica | Expirar atendimentos após 4 h quando não estiverem em "manter aberto"; cancelar chamados abertos | [Especificado]; [Não implementado] (só existe a consulta de sessões vencidas no repositório) | 
| Garçom do setor (somente v0.2) | JWT | WAITER (v0.2) | Receber chamados do setor, aceitar (primeiro vence), concluir; abrir comanda, lançar itens, fechar comanda; encerrar a sessão | [Especificado] na v0.2; removido do MVP v0.3 (papel substituído pelo balcão STAFF); app do garçom e setores são o item APP do futuro | 
| Cozinha/Bar (somente v0.2) | JWT | KITCHEN (v0.2) | Operar o KDS: ver fila, marcar preparando e pronto | [Especificado] na v0.2; fora do MVP (item KDS do futuro) |   

_Figura: **Figura 1.1** – Mapa de atores e casos de uso do MVP (v0.3). (Ver seção 1.3)_ 

### 1.3.1 Observações sobre os atores 

O Admin da v0.3 acumula o papel de dono do restaurante: é o único que cria mesas e o acesso do balcão. O "acesso do balcão" é, no desenho atual, um usuário STAFF criado pelo Admin (rota prevista `POST /staff`); não há ainda modelo de login por garçom, e por isso os campos `calls.done_by` e `table_sessions.closed_by` existem no banco, mas dependem da decisão do ponto a validar 2. O Cliente não existe como registro: seu "estado" é o token do aparelho, gravado em `session_tokens` apenas como hash. 

## 1.4 Escopo: MVP versus futuro 

### 1.4.1 O que está no MVP (v0.3, marcado "Agora") 
 
- Autocadastro do restaurante e cadastro de mesas com QR Code (Fase 1). 
- Tela da mesa com os botões Chamar garçom e Pedir a conta; mensagem de confirmação de envio (Fase 2). 
- Tela do balcão com um card por chamado em tempo real; o garçom finaliza e o card sai da tela (Fase 2). 
- Encerrar o atendimento da mesa revogando os tokens dos aparelhos; atendimento expira em 4 h com opção de manter aberto; limite de chamados contra abuso (Fase 3).  

### 1.4.2 O que fica para depois do MVP 

Seis itens, rotulados na v0.3 como "próximas fases" (RF14 a RF19, status Futuro): cardápio digital (CARD); comanda do garçom e tela da cozinha, KDS (KDS); avaliações de atendimento, comida e restaurante (AVAL); app do garçom no celular e chamados por setor (APP); relatórios do restaurante (REL); integração com sistemas de gestão e PDV (INT). Na v0.2 existiam ainda como pontos futuros ou a validar: fila do KDS por estação, registro de pagamento e aviso ao garçom de pedido pronto. 

_Figura: **Figura 1.2** – Escopo por fase: roadmap do MVP e itens posteriores, com o estado atual de cada fase. (Ver seção 1.4)_ 

### 1.4.3 Estado do escopo MVP no código  
| Fase (v0.3) | Entregas | Marco | Estado no código |
|---|---|---|---|  ``
| 1 Fundação | BE-01 setup; BE-02 autocadastro, login JWT, middlewares auth e tenant; BE-03 mesas, QR Code, acesso do balcão; FE-01..FE-03 | Restaurante com mesas e QR Codes impressos | Parcial: BE-01 sem Docker Compose; BE-02 com login e ensureAuthenticated, mas registro sem restaurante e sem tenant; BE-03 e FE-01..03 não iniciados | 
| 2 Chamado | BE-04 atendimento e token por aparelho; BE-05 chamados e Socket.IO; FE-04, FE-05 | Cliente chama; card aparece e some no balcão | Não iniciada: só repositórios de sessões, tokens e chamados | ``````
| 3 Encerramento | BE-06 encerrar e revogar; BE-07 manter aberto, job de 4 h, limite; FE-06, FE-07 | MVP completo rodando via Docker | Não iniciada: existem apenas blocos de repositório (revokeAllBySession, cancelOpenBySession, findExpired) |   

O detalhamento do estado de implementação e do roadmap está no capítulo 9. 

## 1.5 NFC versus QR Code 

Os dois mecanismos são apenas formas físicas de entregar ao celular a mesma URL pública `/m/[code]`, em que `code` é o `public_code` único da mesa. Não há endpoint específico para NFC (RF13 e RN02 da v0.3; "NFC usa a mesma URL"). Isso torna o NFC uma questão de gravação de tag, não de código de aplicação.  
| Aspecto | QR Code | NFC |
|---|---|---|  
| Papel no produto | Mecanismo principal do MVP; gerado pelo sistema | Alternativa equivalente; v0.3 RF13 Definido, v0.2 RF22 Futuro | ``````
| Como é gerado | [Especificado] GET /tables/:id/qrcode (SVG ou PNG) para o Admin imprimir; URL composta por PUBLIC_WEB_URL (v0.3) e o public_code. [Não implementado] (sem biblioteca de QR no projeto) | Gravado fora do sistema, num aplicativo de NFC, com a mesma URL. O sistema só precisa servir a rota | 
| Interação do cliente | Aponta a câmera | Encosta o celular; abre no navegador sem app (iPhone XS ou mais novo, ou Android com NFC ativo e tela desbloqueada, segundo o guia) | 
| Cuidados | Sem restrições especiais além de imprimir com margem | Tags NTAG213 bastam (cerca de 40 caracteres de URL); travar a tag (lock) é permanente e deve ser feito só após testes e com o domínio definitivo; sem travar, qualquer um pode regravar a tag com um link falso | 
| Recomendação do guia | Manter o QR Code junto da tag NFC na plaquinha | Usar tags de teste antes de gravar as definitivas |   
Observação: a v0.3 inclui NFC em RF04, RF13 e nos perfis, mas o quadro "No MVP" da página 1 menciona apenas QR Code. A v0.2 listava NFC como "fase futura" e dizia que seria possível gravar a URL `/m/[code]` em tags "sem mudar código". Ambas as leituras são coerentes com o fato de que o NFC não exige código novo. Ver DV-10. 

## 1.6 Visão de funcionalidades  
| Funcionalidade | v0.2 | v0.3 | Estado atual |
|---|---|---|---|  
| Autocadastro do restaurante (dono vira Admin) | Definida (RF01) | MVP (RF01) | Parcial: registro cria usuário ADMIN sem restaurante | 
| Login da equipe com JWT | Definida (RNF05) | MVP | Implementado | 
| Cadastro de mesas e QR Code | Definida (RF04) | MVP (RF02) | Não implementado (só repositório de mesas) | 
| Acesso do balcão / gestão de equipe | Definida (RF02, equipe completa) | MVP (RF03, acesso único do balcão) | Não implementado | 
| Setores e vínculo garçom-setor | Definida (RF03) | Fora (item APP) | Não existe no schema | 
| Página da mesa por QR/NFC sem login | Definida (RF06) | MVP (RF04) | Não implementado | 
| Chamar garçom / pedir a conta | Definida (RF08, RF09) | MVP (RF05, RF06) | Não implementado (só repositório de chamados) | 
| Cards de chamados em tempo real no balcão | Equivalente: lista do garçom por setor (RF12) | MVP (RF08, RF09) | Implementado no back-end (Socket.IO, etapa A, 14/11/2026); tela do balcão no front ainda não | 
| Atendimento (sessão) de 4 h, manter aberto, encerrar, revogar tokens | Definida (RF07, RF15, RF16); token único por sessão | MVP (RF10, RF11, RF12); token por aparelho | Parcial: schema e repositórios; sem service, rotas, job | 
| Cardápio digital | Definida (RF05, RF06) | Futuro (RF14) | Não existe | 
| Comanda do garçom, KDS, consumo do cliente | Definida (RF10, RF13, RF14, RF18) | Futuro (RF15) | Não existe | 
| Avaliações | Definida (RF11) | Futuro (RF16) | Não existe | 
| Relatórios | Definida (RF20) | Futuro (RF18) | Não existe | 
| App do garçom e chamados por setor | Definida (RF12) | Futuro (RF17) | Não existe | 
| Integração com PDV e gestão | Futuro (RF23) | Futuro (RF19) | Não existe | 
| Pagamento, estação do KDS, aviso de pedido pronto | A validar (RF21, RF19, RF17) | Sem requisito próprio | Não existe |   

## 1.7 Evolução da v0.2 para a v0.3 

A v0.3 não é uma correção da v0.2, e sim um recorte deliberado do produto. O foco passou de "plataforma completa de atendimento" para "MVP do chamado". As principais mudanças são: 
 
- **Escopo.** A v0.2 tinha 23 requisitos funcionais (18 definidos, 3 a validar, 2 futuros). A v0.3 tem 19: 13 no MVP (12 definidos e 1 proposto) e 6 futuros. Cardápio, comanda, KDS, avaliações e relatórios deixaram de ser requisitos do MVP. 
- **Destinatário do chamado.** Na v0.2 o chamado ia aos garçons do setor da mesa e era assumido pelo primeiro que aceitasse (RN03, RN04). Na v0.3 não há setores nem aceite: todo chamado aparece como card na tela do balcão; o garçom só finaliza. 
- **Papéis.** De ADMIN, WAITER e KITCHEN para ADMIN e STAFF (balcão). 
- **Token.** De um token compartilhado por sessão (cabeçalho `X-Table-Session`) para um token por aparelho (cabeçalho `X-Table-Token`), armazenado como hash e revogável em lote. 
- **Sessão.** Passa a ser chamada "atendimento" na v0.3 (tabela `table_sessions` inalterada no nome). Estados do chamado: de OPEN/ACCEPTED/DONE/EXPIRED para OPEN/DONE/CANCELLED. 
- **Modelo de dados.** De 13 tabelas (v0.2) para 6 (v0.3): restaurants, users, tables, table_sessions, session_tokens, calls. As tabelas de setores, cardápio, comanda, pedidos e avaliações saíram do MVP. O schema do código segue a v0.3. 
- **Eventos em tempo real.** De call.created/accepted, order.*, tab.*, session.closed por salas de setor, KDS e sessão para call.created, call.done, session.updated, session.closed por salas `balcao:{restaurantId}` e `session:{id}`. 
- **Roadmap.** De 4 fases (Fundação, Atendimento, Comanda e cozinha, Avaliação e relatórios) para 3 fases (Fundação, Chamado, Encerramento). 
- **NFC.** De futuro (RF22) para definido (RF13), com a observação de que é só uma segunda forma de entregar a mesma URL.  

## 1.8 Fontes, convenções e precedência 

As informações foram obtidas de quatro documentos (v0.2, v0.3, módulos do back-end e guia de estudos) e do código em `back-end/`. Marcações usadas em todo o documento: 
 
- **[Especificado]**: consta nos documentos de arquitetura ou nos guias, sem confirmação no código. 
- **[Implementado]**: confirmado no código do back-end. 
- **[Não implementado]** ou **[Planejado]**: previsto, mas inexistente no código. 
- **Requer validação**: divergência entre fontes ou ponto declaradamente em aberto; consolidada no apêndice A.  

Em conflito entre fontes, vale a ordem: código (comportamento atual), depois v0.3, depois v0.2. Os guias (módulos e estudo) são tratados como planejamento de implementação, não como requisito: onde eles contradizem a v0.3 (por exemplo, o garçom "abrir a mesa" antes do cliente poder entrar), a divergência é registrada, mas a v0.3 prevalece como especificação de produto.
