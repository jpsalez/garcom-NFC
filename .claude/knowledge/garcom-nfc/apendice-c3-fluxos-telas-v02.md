## C.3 Fluxos e telas de longo prazo da v0.2 

Todo o conteúdo desta seção é **[Especificado] (v0.2, seções 01 e 03)** e fora do MVP. O princípio da v0.2: ações do usuário viajam por REST; eventos que outra tela precisa ver na hora viajam por WebSocket. 

### C.3.1 Fluxo geral em quatro etapas 
 
- **Mesa.** O cliente abre o link ou QR Code, vê o cardápio livremente e só entra na sessão ao agir (chamar, pedir conta, ver consumo, avaliar). 
- **Atendimento.** O chamado é criado, os garçons do setor são notificados e o primeiro que aceita vai à mesa; os demais veem o chamado sumir da lista. 
- **Pedido.** O garçom abre a comanda e lança os itens; o pedido aparece no KDS e a cozinha o marca como pronto. O cliente não faz pedidos (RN05); ele apenas acompanha o consumo. 
- **Fechamento.** O garçom fecha a comanda, o cliente recebe o convite de avaliação e a avaliação é gravada para o painel do administrador.  

### C.3.2 Cardápio e acesso à mesa 

Ao abrir o link, a página da mesa mostra o cardápio sem criar sessão: essa visita não interfere em nada (RN08) e pode ser repetida sem limite. Se o cliente aciona qualquer ação que dependa de sessão, o sistema verifica se a mesa tem sessão ativa: se tem, o cliente entra nela; se não tem, cria uma com validade de 4 horas e só então executa a ação. A mesma sessão serve a todos os aparelhos da mesa (RN09). O cardápio é gerido pelo administrador: categorias ordenadas, itens com preço e disponibilidade (RF05). 

### C.3.3 Pedido, comanda e KDS 

Sequência do pedido: o garçom abre a comanda da mesa; a cada rodada, envia uma lista de itens; o servidor grava o pedido com seus itens (copiando o preço), emite o evento para a tela da cozinha e atualiza o consumo visto pelo cliente. A cozinha vê a fila em ordem de chegada, marca o pedido como em preparo e depois como pronto; cada mudança emite um evento ao KDS e ao garçom da comanda, que poderá ser avisado do pedido pronto (RF17, a validar). A entrega ao cliente muda o pedido para entregue. O KDS é uma tela sempre ligada: ao reconectar, recarrega a fila por REST (RNF07). Separar a fila por estação (bar, cozinha, sobremesa) é RF19, a validar. 

**Estados do pedido [Especificado]:** RECEIVED, depois PREPARING (a cozinha inicia), depois READY (a cozinha finaliza), depois DELIVERED (o garçom entrega). Não há estado de cancelamento nem transição de retorno descritos. 

### C.3.4 Avaliação 

A avaliação está disponível durante toda a sessão e é oferecida em destaque quando a comanda é fechada (RN07). O formulário reúne três notas (garçom, comida e restaurante) e um comentário opcional; ao enviar, o registro é gravado e aparece no painel do administrador. Cada cliente pode avaliar; o cliente é anônimo (RNF08, LGPD) e, como a v0.2 usa um token único por sessão, não há como limitar uma avaliação por pessoa (Requer validação). A nota de garçom é associada ao garçom da comanda aberta. 

### C.3.5 Relatórios e painel do administrador 

O painel reúne setores, mesas, QR Codes, equipe, cardápio, avaliações e relatórios (RF20). O resumo é obtido por período; **quais métricas serão exibidas é ponto em aberto** (v0.2). A fase 4 do planejamento entrega apenas avaliações e indicadores no painel. 

### C.3.6 Onboarding do restaurante em sete passos 

Autocadastro (o dono vira administrador); criação de setores (por exemplo salão, varanda e bar); criação de mesas, cada uma em um setor; geração e impressão dos QR Codes; cadastro da equipe, ligando cada garçom a setores; montagem do cardápio; restaurante pronto. 

### C.3.7 Telas por perfil (rotas do front da v0.2)  
| Perfil | Rota do front | Telas e ações |
|---|---|---|  
| Cliente | /m/[code] | Início da mesa, cardápio, consumo e avaliação; chamar garçom, pedir conta e acompanhar o chamado ("Garçom a caminho"). | 
| Garçom | /garcom | Lista de chamados do setor em tempo real; aceitar e concluir; abrir comanda, enviar itens e fechar; encerrar a sessão da mesa vazia e marcar "manter aberta" (tela de detalhe da mesa). | 
| Cozinha | /cozinha | Login e tela KDS com pedidos por ordem de chegada; marcar preparando e pronto. | ````
| Admin | /admin | Autocadastro, setores, mesas, equipe, cardápio, avaliações e relatórios. Rotas /cadastro e /login para autenticação. |   

Camadas do front especificadas: rotas por área, componentes, cliente HTTP tipado, ganchos de eventos de tempo real e estado de servidor com TanStack Query. A v0.3 não traz front-end; o repositório atual também não. 

### C.3.8 Planejamento em quatro fases da v0.2  
| Fase | Entrega | Itens (dependências) |
|---|---|---|  
| 1 Fundação | Restaurante cadastrado com mesas, equipe e cardápio | BE-01 setup; BE-02 cadastro, login, middlewares (depende de BE-01); BE-03 CRUD de setores, mesas com QR, equipe e cardápio (BE-02); FE-01 a FE-03 no front. | 
| 2 Atendimento | Cliente chama e garçom do setor recebe na hora | BE-04 sessão de 4 h, manter aberta, encerrar e job (BE-03); BE-05 chamados e Socket.IO por setor (BE-04); FE-04 e FE-05. | 
| 3 Comanda e cozinha | Pedido sai do garçom e aparece na cozinha | BE-06 comandas, pedidos e itens (BE-03); BE-07 KDS (BE-06); FE-06 a FE-08. | 
| 4 Avaliação e relatórios | Avaliações e indicadores no painel | BE-08 avaliações e convite (BE-06); BE-09 relatórios (BE-08); FE-09 e FE-10. | 
| Depois da v1 | Fora do escopo | NFC (gravar a URL nas tags), integração com sistemas de gestão, fila do KDS por estação, registro de pagamento. |   

Estratégia: o back-end entrega a API de cada fase primeiro; o front começa pelo layout e consome os endpoints quando prontos. Os identificadores BE-xx e FE-xx do MVP da v0.3 são outros (ver seção 9.3).
