## C.1 Modelo de dados completo da v0.2 de longo prazo 

A v0.2 descreve treze tabelas, em três grupos: estrutura do restaurante (sete tabelas: `restaurants`, `users`, `sectors`, `user_sectors`, `tables`, `menu_categories`, `menu_items`), sessão, chamados e avaliações (`table_sessions`, `calls`, `reviews`) e comanda e pedidos (`tabs`, `orders`, `order_items`). Todo o modelo é **[Especificado]** (v0.2, seção 05). O capítulo 4 documenta apenas o que existe no schema real (seis tabelas). Oito das treze tabelas da v0.2 não existem no banco: `sectors`, `user_sectors`, `menu_categories`, `menu_items`, `reviews`, `tabs`, `orders` e `order_items`; as demais existem com diferenças (ver DV-30 e DV-31). 

_Figura: **Figura C.1** – Modelo de dados da v0.2 de longo prazo (treze tabelas, três grupos). Linhas tracejadas indicam referências a `users`. (Ver seção C.1)_ 

### C.1.1 Estrutura do restaurante  
| Tabela | Campo | Tipo conceitual | Chave e relação | Regras |
|---|---|---|---|---|  ``
| restaurants | id | identificador único universal | chave primária | Raiz do isolamento entre clientes do SaaS. | 
| name | texto | — | Nome exibido ao cliente. | 
| slug | texto | único | Forma do nome adequada a URL; o documento não detalha como é gerado (ver C.5.1). | ``
| users | id | identificador | chave primária | — | ``
| restaurant_id | identificador | chave estrangeira para restaurants | Todo usuário pertence a um restaurante (no código atual o campo é opcional; DV-15). | 
| email | texto | único | Login da equipe. | 
| password_hash | texto | — | Hash da senha (a v0.2 cita argon2 ou bcrypt; o código usa scrypt). | ``
| role | enumeração | ADMIN, WAITER, KITCHEN | Perfil. O diagrama da v0.2 não traz o campo de nome; o código tem name e os papéis ADMIN e STAFF (DV-13). | ``
| sectors | id | identificador | chave primária | Ex.: salão, varanda, bar. | ``
| restaurant_id | identificador | estrangeira para restaurants | Setores são do restaurante. | 
| name | texto | — | Nome do setor. | ````
| user_sectors | user_id | identificador | estrangeira para users | Tabela de ligação N:N entre garçom e setor; sem chave própria descrita. | ``
| sector_id | identificador | estrangeira para sectors | Um garçom pode atender vários setores; um setor tem vários garçons. | ``
| tables | id | identificador | chave primária | — | ````````
| sector_id | identificador | estrangeira para sectors | RN02: toda mesa pertence a um setor. O diagrama não mostra restaurant_id aqui (o código real tem restaurant_id e não tem sector_id). | 
| label | texto | — | Nome da mesa, por exemplo "Mesa 12". | ``
| public_code | texto | único | Código da URL do QR Code (/m/[code] no front). | ``
| menu_categories | id | identificador | chave primária | — | ``
| restaurant_id | identificador | estrangeira para restaurants | Categorias do cardápio do restaurante. | ``
| name, position | texto; inteiro | — | position define a ordem de exibição. | ``
| menu_items | id | identificador | chave primária | — | ``
| category_id | identificador | estrangeira para menu_categories | O item herda o restaurante pela categoria. | 
| name | texto | — | — | 
| price, available | decimal; booleano | — | Preço atual e disponibilidade; item indisponível permanece cadastrado (RF05). |   

### C.1.2 Sessão, chamados e avaliações  
| Tabela | Campo | Tipo conceitual | Chave e relação | Regras |
|---|---|---|---|---|  ``
| table_sessions | id | identificador | chave primária | — | ``
| table_id | identificador | estrangeira para tables | Uma mesa tem no máximo uma sessão ativa (RN09), garantida por índice único parcial. | ````
| token | texto | único | A v0.2 prevê um único token por sessão, compartilhado por todos os aparelhos (header X-Table-Session). O código real usa tokens por aparelho em session_tokens (DV-24). | 
| status | enumeração | ACTIVE, CLOSED | Nos diagramas aparece como ATIVA e ENCERRADA. | 
| keep_open | booleano | — | RF16: sessão sem expiração, encerrada só pelo garçom. | 
| expires_at | data e hora | — | Criação mais 4 horas (TABLE_SESSION_TTL, 14400 s). | 
| closed_reason | enumeração | TIMEOUT, WAITER | No código, STAFF no lugar de WAITER. | ``
| closed_by | identificador | estrangeira para users | Quem encerrou; vazio quando foi o tempo. | ``
| calls | id | identificador | chave primária | — | ``
| session_id | identificador | estrangeira para table_sessions | Chamado nasce dentro de uma sessão. | 
| type | enumeração | WAITER, BILL | Chamar garçom ou pedir conta; mesmo fluxo. | 
| status | enumeração | OPEN, ACCEPTED, DONE, EXPIRED | O código real tem OPEN, DONE, CANCELLED (DV-29). | ``
| accepted_by | identificador | estrangeira para users | RN04: o primeiro garçom que aceita assume o chamado. | ````
| accepted_at | data e hora | — | No código existem done_at e done_by. | ````
| reviews | id, session_id | identificador | estrangeira para table_sessions | Uma sessão pode ter várias avaliações (uma por cliente, RN07); não há limite descrito por aparelho. | ``
| waiter_id | identificador | estrangeira para users | Preenchido com o garçom da comanda aberta. | 
| rating_service | inteiro | — | Nota do atendimento do garçom. | 
| rating_food | inteiro | — | Nota da comida. | 
| rating_place | inteiro | — | Nota do lugar (restaurante). | 
| comment | texto | — | Opcional. A escala das notas não é definida. |   

### C.1.3 Comanda e pedidos  
| Tabela | Campo | Tipo conceitual | Chave e relação | Regras |
|---|---|---|---|---|  ``
| tabs (comandas) | id | identificador | chave primária | A comanda pertence à mesa: encerrar a sessão não apaga consumo (RN12, proposto). | ``
| table_id | identificador | estrangeira para tables | Sem ligação direta com a sessão; o consumo é achado pela mesa. Uma comanda aberta por mesa é RN13 (a validar). | ``
| waiter_id | identificador | estrangeira para users | Garçom que abriu. | 
| status | enumeração | OPEN, CLOSED | Fechar dispara o convite de avaliação. | 
| closed_at | data e hora | — | Preenchido ao fechar. | ````
| orders (pedidos) | id, tab_id | identificador | estrangeira para tabs | Cada pedido é uma rodada de envio à cozinha. | 
| status | enumeração | RECEIVED, PREPARING, READY, DELIVERED | Nasce RECEIVED (RN06). | 
| sent_at | data e hora | — | Momento do envio; define a ordem da fila do KDS. | ````
| order_items | id, order_id | identificador | estrangeira para orders | — | ``
| menu_item_id | identificador | estrangeira para menu_items | Referência ao item do cardápio. | 
| quantity | inteiro | — | — | 
| unit_price | decimal | — | Cópia do preço no momento do envio, para o histórico não mudar com reajustes. | 
| notes | texto | — | Observação do garçom (opcional). |   

### C.1.4 Cardinalidades, índices e notas de modelagem  
| Relação | Cardinalidade | Observação |
|---|---|---|  
| Restaurante para usuários, setores e cardápio | 1:N | Tenant por coluna. | ``
| Garçom e setor | N:N | Por user_sectors. | 
| Setor para mesas | 1:N | Define quem recebe os chamados da mesa (RN03). | 
| Mesa para sessões e comandas | 1:N | Histórico completo permanece. | 
| Mesa para sessão ativa | 1:0..1 | Índice único parcial por mesa para estado ACTIVE. | 
| Sessão para chamados e avaliações | 1:N | — | 
| Comanda, pedidos e itens | 1:N:N | Itens referenciam o cardápio. | 
| Chamado para garçom que aceitou | N:0..1 | Vazio até aceitar. |   
 
- **[Especificado] (v0.2).** Índices por restaurante e status são previstos em `calls` e `orders`; `public_code` e o token de sessão são únicos; um índice único parcial garante uma sessão ativa por mesa. 
- **[Especificado] (v0.2).** Campos de estação do KDS e de pagamento só entram quando os pontos em aberto correspondentes forem validados (RF19 e RF21). 
- **Lacunas internas da v0.2 (Requer validação).** O diagrama não traz `restaurant_id` em `tables`, `calls`, `orders` e `table_sessions`, embora o requisito RNF01 e o índice citado exijam filtro por restaurante; também falta ligação entre comanda e sessão e falta a regra de limite de avaliações por cliente. O código real corrigiu parte disso (colunas de restaurante em mesas, sessões e chamados).
