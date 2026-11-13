## C.2 Endpoints REST e eventos Socket.IO da v0.2 ausentes na v0.3 

A v0.2 define a API sob o prefixo `/api/v1`, em JSON; a equipe se autentica com `Authorization: Bearer` (JWT) e o cliente da mesa envia o cabeçalho `X-Table-Session` com o token. Todos os itens abaixo são **[Especificado] (v0.2, seção 06)** e **[Planejado]** como futuro: nenhum está implementado e nenhum consta na v0.3. Os endpoints de cadastro e login já existentes e os de chamado do MVP estão na seção 8.2. A v0.2 só cita um código de erro padronizado, `SESSION_EXPIRED` (sessão da mesa vencida), no formato com objeto de erro aninhado, e o status 409 para aceite concorrente; os demais erros abaixo seguem o catálogo geral da seção 8.5 e são deduções, marcadas como **[Proposto]**. 

### C.2.1 Equipe, setores e mesas (perfil ADMIN)  
| Método e caminho | Perfil | Finalidade | Regras e erros |
|---|---|---|---|  
| GET e POST /staff | ADMIN | Listar e criar membros da equipe (garçons, cozinha) do restaurante do token (RF02). | Restaurante vem do token, nunca do corpo. E-mail repetido: 409. Papel diferente de ADMIN: 403. | 
| PATCH /staff/:id | ADMIN | Editar e ativar ou desativar um membro. | Membro de outro restaurante: 404 [Proposto]. Desativar preserva histórico. | ``
| PUT /staff/:id/sectors | ADMIN | Definir o conjunto de setores de um garçom (substitui o anterior em user_sectors). | Setores devem ser do mesmo restaurante; setor inexistente: 404 [Proposto]. | 
| GET e POST /sectors | ADMIN | Listar e criar setores (RF03). | Nome obrigatório [Proposto]. | 
| GET e POST /tables | ADMIN | Listar e criar mesas, cada uma obrigatoriamente em um setor (RN02). | O código público é gerado pelo servidor. Na v0.3 a mesa deixa de ter setor (DV-09 e DV-30). | 
| GET /tables/:id/qrcode | ADMIN | QR Code da mesa em PNG ou SVG, para impressão (RF04). | Mesa de outro restaurante: 404 [Proposto]. Ver C.5.7. |   

### C.2.2 Cardápio  
| Método e caminho | Perfil | Finalidade | Regras e erros |
|---|---|---|---|  
| GET e POST /menu/categories | ADMIN | Listar e criar categorias com posição de exibição. | Sempre filtradas pelo restaurante do token. | 
| GET e POST /menu/items | ADMIN | Listar e criar itens: nome, preço, categoria, disponibilidade. | Categoria de outro restaurante: 404 [Proposto]; preço inválido: 400 [Proposto]. | ``
| PATCH e DELETE /menu/items/:id | ADMIN | Editar ou remover um item. | Itens já usados em pedidos tendem a ser marcados indisponíveis em vez de apagados, pois order_items os referencia [Proposto]. | 
| GET /public/tables/:code/menu | Público | Cardápio da mesa sem sessão (RF06, RN08). | Não cria, não altera e não encerra sessão. Acessos ilimitados. Código inexistente: 404 [Proposto]. |   

### C.2.3 Cliente: sessão compartilhada, consumo e avaliação  
| Método e caminho | Perfil | Finalidade | Regras e erros |
|---|---|---|---|  
| POST /public/tables/:code/session | Público | Entrar na sessão ativa da mesa ou criá-la, devolvendo o token (RF07). | Cria sessão com validade de 4 h se não houver ativa; se houver, devolve o mesmo token a todos (modelo da v0.2). Na v0.3 o equivalente é o token por aparelho. | ``
| GET /public/tab | Sessão | Consumo da comanda aberta da mesa, com itens e total (RF10). | Exige sessão; token vencido: erro SESSION_EXPIRED. Sem comanda aberta: resposta vazia [Proposto]. | 
| POST /public/reviews | Sessão | Enviar avaliação com três notas e comentário opcional (RF11). | Resposta 201. Disponível a qualquer momento da sessão (RN07). Notas fora da escala: 400 [Proposto]. |   

### C.2.4 Garçom: aceite de chamados, sessão e comanda  
| Método e caminho | Perfil | Finalidade | Regras e erros |
|---|---|---|---|  
| GET /calls?status=OPEN | WAITER | Chamados abertos dos setores do garçom. | Filtra pelos setores vinculados (RN03). | ``
| PATCH /calls/:id/accept | WAITER | Aceitar o chamado; o primeiro garçom assume (RN04, RF12). | Atualização condicional ao estado aberto. Se outro já aceitou: 409. Sucesso emite call.accepted; o chamado some da lista dos outros garçons. | 
| PATCH /calls/:id/resolve | WAITER | Concluir o chamado aceito (estado concluído). | Possível regra: só quem aceitou conclui [Proposto]; estado inválido: 409 [Proposto]. | ``
| PATCH /tables/:id/session | WAITER | Ação sobre a sessão da mesa: manter aberta ou encerrar (RF15, RF16). | Ação enviada no corpo (KEEP_OPEN ou CLOSE). Encerrar expira os chamados em aberto e emite session.closed. | 
| POST /tabs | WAITER | Abrir comanda para uma mesa (RF13). | Se já há comanda aberta na mesa: RN13 (a validar), provável 409. | 
| GET /tabs/:id | WAITER | Comanda com pedidos e total. | Comanda de outro restaurante: 404 [Proposto]. | ````
| POST /tabs/:id/orders | WAITER | Enviar pedido com itens (identificador do item, quantidade, observação opcional). | Resposta 201 com identificador e estado RECEIVED. Copia o preço atual para o item. Emite order.created e tab.updated. | ``
| PATCH /tabs/:id/close | WAITER | Fechar a comanda (RF14). | Dispara o convite de avaliação (tab.closed). Não encerra a sessão (RN12). |   

### C.2.5 Cozinha e gestão  
| Método e caminho | Perfil | Finalidade | Regras e erros |
|---|---|---|---|  
| GET /kds/orders?status= | KITCHEN | Fila do KDS, por ordem de chegada, filtrável por status (RF18). | Chamada de recuperação quando a tela reconecta (RNF07). | ``
| PATCH /kds/orders/:id/status | KITCHEN | Mudar o pedido para PREPARING ou READY. | Transição inválida: 409 [Proposto]. Emite order.status_changed. A entrega (DELIVERED) é do garçom. | 
| GET /reviews | ADMIN | Avaliações do restaurante (RF20). | Filtro por período. | 
| GET /reports/summary | ADMIN | Indicadores do período (parâmetros de início e fim). | As métricas são ponto em aberto "a validar" (ver C.3.5). | ``
| GET /auth/me | Equipe | Usuário e restaurante atuais. | Não implementado; requer o restaurantId no pedido (DV-17). |   

### C.2.6 Eventos Socket.IO da v0.2 

[Especificado] (v0.2). O servidor emite para salas por setor, cozinha e sessão. A v0.3 reduz o conjunto a quatro eventos do balcão (seção 8.3).  
| Evento | Sala | Destinatário | Conteúdo |
|---|---|---|---|  
| call.created | setor | Garçons do setor da mesa | Identificador, tipo e mesa. | 
| call.accepted | setor e sessão | Garçons do setor e clientes da mesa | Identificador e nome do garçom ("Garçom a caminho"). | 
| order.created | cozinha do restaurante | Tela KDS | Identificador, mesa e itens. | 
| order.status_changed | cozinha e usuário do garçom | KDS e garçom da comanda | Identificador e novo status; base do aviso "pedido pronto" (RF17, a validar). | 
| tab.updated | sessão | Clientes da mesa | Itens e total atualizados. | 
| tab.closed | sessão | Clientes da mesa | Identificador da comanda; mostra o convite de avaliação. | 
| session.closed | sessão | Todos os clientes da mesa | Motivo do encerramento. |   

**[Planejado] Extensão (v0.2).** Os services de pedidos e comandas emitiriam eventos internos que um módulo de integrações poderia consumir, sem alterar o núcleo; o adaptador Redis do Socket.IO só é necessário com mais de uma instância da API. A leitura de NFC futura apenas grava a URL `/m/[code]` nas tags, sem mudança de código.
