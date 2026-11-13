# 4. Modelo de dados 

O modelo de dados é a parte mais completa do repositório: as seis tabelas previstas na v0.3 existem no schema do Prisma e na migration inicial. Este capítulo descreve cada tabela, campo e enum, as relações, os índices, as regras de integridade e as diferenças entre a documentação e o schema real. Convenções: [Especificado] vem de v0.2/v0.3; [Implementado] vem de `schema.prisma` e da migration `20261111232558_init`. 

## 4.1 Visão geral 

[Implementado] O banco é PostgreSQL, acessado pelo Prisma. O modelo tem seis tabelas organizadas em três domínios, segundo a v0.3: **Restaurante** (`restaurants`, `users`, `tables`), **Atendimento** (`table_sessions`, `session_tokens`) e **Chamados** (`calls`). Na terminologia de negócio, "atendimento" corresponde à tabela `table_sessions`, "token" a `session_tokens` e "chamado" a `calls`. 

_Figura: **Figura 4.1** – Relacionamentos entre as seis tabelas; linhas tracejadas indicam referências opcionais a `users`. (Ver seção 4.4)_ 

Leitura do diagrama: um restaurante possui usuários, mesas, atendimentos e chamados; uma mesa abre vários atendimentos ao longo do tempo, mas no máximo um ativo por vez; um atendimento emite vários tokens (um por aparelho) e agrupa vários chamados; cada token origina vários chamados; um atendimento pode apontar o usuário que o encerrou e um chamado pode apontar o usuário que o finalizou. 

## 4.2 Tabelas e campos 

Todas as chaves primárias são identificadores textuais gerados pela aplicação (função `uuid()` do Prisma). No banco o tipo é texto (`TEXT`), sem valor padrão no PostgreSQL; ver divergência DV-26. Campos de data e hora usam `TIMESTAMP(3)` (precisão de milissegundos) sem fuso explícito. 

### 4.2.1 restaurants 

Representa o tenant. [Implementado]  
| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|  ``
| id | texto | Chave primária | Identificador gerado pela aplicação. | ``
| name | texto | Obrigatório | Nome do restaurante. | ``
| slug | texto | Obrigatório, único | Nome em formato de URL. | ``
| created_at | data/hora | Padrão: instante atual | Criação do registro. |   

### 4.2.2 users 

Usuários autenticados (SUPER_ADMIN, OWNER e STAFF). [Implementado, atualizado 12/11/2026: 4 migrations; colunas active e category; job_title removido; CHECKs users_category_only_staff (category só para STAFF) e users_restaurant_by_role (SUPER_ADMIN sem restaurante; OWNER e STAFF com).]  
| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|  ``
| id | texto | Chave primária | Identificador. | ``
| name | texto | Obrigatório | Nome do usuário. | ``****``
| restaurant_id | texto | [Implementado] Nulo só para SUPER_ADMIN (CHECK users_restaurant_by_role); chave estrangeira para restaurants | Restaurante do usuário. O register preenche (fluxo B). Também existem `active` (boolean, padrão true) e `category` (staff_category anulável: WAITER, MANAGER, CLEANING, KITCHEN, OTHER; só STAFF). restaurants também tem `active` e `slug` único. | ``
| email | texto | Obrigatório, único global | Login. | ``
| password_hash | texto | Obrigatório | Hash scrypt, no formato sal e hash em hexadecimal; nunca devolvido nas respostas. | ````````
| role | enum role | Obrigatório, sem valor padrão | [Implementado] SUPER_ADMIN, OWNER (substitui o antigo ADMIN) ou STAFF; restaurant_id nulo só para SUPER_ADMIN (DV-48 resolvida). |   

### 4.2.3 tables 

Mesas físicas, cada uma com um código público usado no QR Code e no NFC. [Implementado]  
| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|  ``
| id | texto | Chave primária | Identificador. | ``
| restaurant_id | texto | Obrigatório; chave estrangeira (exclusão restrita) | Tenant. | ``
| label | texto | Obrigatório | Nome exibido (ex.: "Mesa 12"). | ``
| public_code | texto | Obrigatório, único global | Código na URL gravada no QR e na tag NFC (RN02). | ``
| active | booleano | Padrão: verdadeiro | Mesa ativa ou desativada. Desativar é preferível a excluir, pois sessões e chamados têm chave estrangeira para a mesa. |   

### 4.2.4 table_sessions 

O atendimento: período em que uma mesa está ocupada. [Implementado]  
| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|  ``
| id | texto | Chave primária | Identificador. | ``
| restaurant_id | texto | Obrigatório; chave estrangeira | Tenant. | ````
| table_id | texto | Obrigatório; chave estrangeira para tables | Mesa do atendimento. | ``````````
| status | enum tableStatus | Padrão ACTIVE | ACTIVE ou CLOSED. | ``
| keep_open | booleano | Padrão: falso | Se verdadeiro, o atendimento não expira por tempo (RF11). | ``
| expires_at | data/hora | Obrigatório | Limite de validade (4 h após a abertura, segundo a v0.3). | ````````
| closed_reason | enum reason | Opcional | STAFF (encerrado no balcão) ou TIMEOUT (expirou). | ````
| closed_by | texto | Opcional; chave estrangeira para users (nula ao excluir o usuário) | Quem encerrou; nulo na expiração. |   

A tabela não possui campo de criação ou abertura (por exemplo `created_at`). Ver DV-25. 

### 4.2.5 session_tokens 

Um token por aparelho, ligado ao atendimento. [Implementado]  
| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|  ``
| id | texto | Chave primária | Identificador. | ````
| session_id | texto | Obrigatório; chave estrangeira para table_sessions | Atendimento do aparelho. | ``
| token_hash | texto | Obrigatório, único global | Hash do token; o token em texto existe apenas no aparelho do cliente (RNF05). | ``
| revoked_at | data/hora | Opcional | Preenchido na revogação; token com este campo preenchido é inválido (RN09). |   

Não há `restaurant_id` nem data de criação nesta tabela; o tenant é derivado da sessão. 

### 4.2.6 calls 

Os chamados (Garçom ou Conta). [Implementado]  
| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|  ``
| id | texto | Chave primária | Identificador. | ``
| restaurant_id | texto | Obrigatório; chave estrangeira | Tenant (ausente no diagrama da v0.3). | ``
| session_id | texto | Obrigatório; chave estrangeira | Atendimento do chamado. | ````
| token_id | texto | Obrigatório; chave estrangeira para session_tokens | Aparelho que chamou. | ````````
| type | enum type_call | Obrigatório | WAITER ou BILL. | ````````````
| status | enum call_state | Padrão OPEN | OPEN, DONE ou CANCELLED. | ``
| created_at | data/hora | Padrão: instante atual | Define a ordem de chegada dos cards (RN06). | ``
| done_at | data/hora | Opcional | Quando foi finalizado. | ````
| done_by | texto | Opcional; chave estrangeira para users (nula ao excluir o usuário) | Quem finalizou. Depende da decisão em aberto sobre login individual do garçom. |   

## 4.3 Enums 

[Implementado] O schema define cinco enums, criados como tipos enumerados do PostgreSQL pela migration.  
| Enum (nome no banco) | Valores | Usado em | Significado |
|---|---|---|---|  ````````
| role | SUPER_ADMIN, OWNER, STAFF (antes ADMIN/STAFF) | users.role | Super admin: plataforma. Owner: dono do restaurante. Staff: funcionário. |
| staff_category | WAITER, MANAGER, CLEANING, KITCHEN, OTHER | users.category | Só para STAFF [Implementado]. | ````````
| tableStatus | ACTIVE, CLOSED | table_sessions.status | Atendimento em curso ou encerrado (por balcão ou por tempo). | ````````
| reason | STAFF, TIMEOUT | table_sessions.closed_reason | Motivo do encerramento. | ````````
| type_call | WAITER, BILL | calls.type | Chamar garçom ou pedir a conta (RN03). | ``````````
| call_state | OPEN, DONE, CANCELLED | calls.status | Aberto (card na tela), finalizado no balcão, ou cancelado porque o atendimento terminou. |   

Observação de nomenclatura: os nomes dos enums não seguem um padrão único (`tableStatus` em camelCase; `call_state` e `type_call` em snake_case; `role` e `reason` genéricos). Os valores `STAFF` e `TIMEOUT` existem em dois enums distintos com sentidos diferentes (papel e motivo de encerramento). Não há impacto funcional, mas convém padronizar. 

Diferenças em relação à v0.2 [Especificado, histórico]: papéis `ADMIN`, `WAITER`, `KITCHEN`; motivo `WAITER` em vez de `STAFF`; status do chamado `OPEN`, `ACCEPTED`, `DONE`, `EXPIRED`. A v0.3 e o código eliminaram o aceite do chamado por um único garçom (RN04 da v0.2) e trocaram `EXPIRED` por `CANCELLED`. 

## 4.4 Relacionamentos  
| Relação | Cardinalidade | Chave estrangeira | Ao excluir o pai |
|---|---|---|---|  ``
| restaurante para usuários | 1:N (restaurante obrigatório para OWNER e STAFF) | users.restaurant_id | Ver migrations atuais (confirmar regra de exclusão no schema) | ``
| restaurante para mesas | 1:N | tables.restaurant_id | Bloqueado | ``
| restaurante para atendimentos | 1:N | table_sessions.restaurant_id | Bloqueado | ``
| restaurante para chamados | 1:N | calls.restaurant_id | Bloqueado | ``
| mesa para atendimentos | 1:N; no máximo 1 ativo (1:0..1) | table_sessions.table_id | Bloqueado | ``
| atendimento para tokens | 1:N | session_tokens.session_id | Bloqueado | ``
| atendimento para chamados | 1:N | calls.session_id | Bloqueado | ``
| token para chamados | 1:N | calls.token_id | Bloqueado | ``
| usuário para atendimentos encerrados | 0..1 por atendimento | table_sessions.closed_by | Campo vira nulo | ``
| usuário para chamados finalizados | 0..1 por chamado | calls.done_by | Campo vira nulo |   

"Bloqueado" significa exclusão restrita: o banco recusa excluir um registro pai que ainda tenha filhos. Na prática, o modelo preserva o histórico (restaurantes, mesas, atendimentos e tokens não podem ser removidos enquanto houver dependentes). Exceção: as referências a `users` são anuladas ao excluir o usuário, preservando o atendimento e o chamado. Atualizações de chaves em cascata são permitidas, o que na prática não ocorre com identificadores fixos. 

## 4.5 Índices e unicidade  
| Índice / restrição | Tabela e colunas | Tipo | Objetivo | Situação |
|---|---|---|---|---|  ``
| Chaves primárias | Todas as tabelas, coluna id | Único | Identidade. | [Implementado] | ````
| restaurants_slug_key | restaurants.slug | Único | Slug exclusivo. | [Implementado] | ````
| users_email_key | users.email | Único global | Login por e-mail; duplicidade vira 409. | [Implementado] | ````
| tables_public_code_key | tables.public_code | Único global | Código público de cada mesa (RN02). | [Implementado] | ````
| session_tokens_token_hash_key | session_tokens.token_hash | Único | Busca do token pelo hash. | [Implementado] | ````
| calls_restaurant_id_status_idx | calls (restaurant_id, status) | Composto, não único | Carregar rapidamente os cards abertos do balcão. | [Implementado] | ````````****
| table_sessions_one_active | table_sessions (table_id) onde status é ACTIVE | Único parcial | No máximo um atendimento ativo por mesa. | [Implementado] só na migration | ````````****
| calls_one_open_per_type | calls (session_id, type) onde status é OPEN | Único parcial (proposto) | Impedir dois chamados abertos do mesmo tipo no mesmo atendimento. | [Planejado/Não implementado]; ausente da migration |   

### 4.5.1 Índice parcial table_sessions_one_active 

[Implementado] Este índice é criado manualmente ao final da migration inicial (a migration foi editada, pois o schema do Prisma não expressa índices parciais). Ele faz o próprio banco garantir que só exista uma linha com status ativo por mesa; atendimentos encerrados não contam, de modo que o histórico é ilimitado. O comentário no `schema.prisma` registra a existência do índice. A função dele é fechar a condição de corrida do tipo "verificar e depois agir": dois pedidos simultâneos podem ambos constatar que não há atendimento ativo e tentar criar um; o banco aceita apenas um e rejeita o outro com violação de unicidade (código Prisma P2002), que o tratador global converte em resposta 409. A verificação no código (`findActiveByTable`) serve para dar uma mensagem clara; a garantia é do índice. 
Cuidado de manutenção: uma nova geração de migration em modo de desenvolvimento do Prisma, baseada apenas no schema pode tentar remover um índice que o schema desconhece. Por isso o fluxo recomendado é criar a migration em modo "somente criar", editar o SQL e só então aplicá-la. 

### 4.5.2 Índice calls_one_open_per_type (ausente) 

[Planejado/Não implementado] O guia de estudos e o documento de módulos propõem um índice único parcial análogo para chamados: no máximo um chamado aberto por tipo em cada atendimento, de modo que um toque duplo gere violação de unicidade e resposta 409, enquanto `WAITER` e `BILL` possam coexistir abertos. Esse índice **não existe** na migration nem é mencionado no schema. Ele só faz sentido se a regra "bloquear chamado repetido do mesmo tipo" for adotada; porém a v0.3 afirma em RN08 que "cada novo chamado gera um novo card" e deixa RN12 (novo card ou agrupar) e o ponto a validar 3 em aberto. Portanto o índice proposto conflita com a regra definida RN08 se for aplicado sem decisão de negócio. Requer validação (DV-02). 

### 4.5.3 Observações sobre índices ausentes 

Requer validação (otimização, sem impacto funcional no MVP): o PostgreSQL não cria índice automático para colunas de chave estrangeira, e o modelo só declara os índices acima. Consultas previstas, como a busca de chamados por `session_id` (cancelamento de abertos ao encerrar), a de tokens por `session_id` (contagem de aparelhos e revogação) e a de atendimentos vencidos (`findExpired`, que filtra por status, `keep_open` e `expires_at`), não têm índice dedicado. Com volumes pequenos isso é aceitável. 

## 4.6 Migration 

[Implementado] Existe uma única migration, `20261111232558_init`, mais o arquivo de trava de provedor (PostgreSQL). Ela cria, nesta ordem: os cinco tipos enumerados; as seis tabelas; os índices únicos de `slug`, `email`, `public_code` e `token_hash`; o índice composto de `calls`; as chaves estrangeiras; e, por último, o índice parcial de atendimento ativo (com um comentário "Uma sessão ACTIVE por mesa"). O `prisma.config.ts` define a pasta de migrations e a fonte da URL do banco. O fluxo de trabalho: alterar o schema, gerar a migration, aplicar; o client é regenerado em `generated/prisma`. Na implantação planejada, as migrations seriam aplicadas por a aplicação de migrations em modo de implantação do Prisma. 

A migration é da versão do schema vigente; quaisquer ajustes futuros previstos (índice de chamados, campos de data de abertura, colunas de restaurante em usuários obrigatórias) exigirão novas migrations. 

## 4.7 Regras de integridade e tenant 

### 4.7.1 Regras garantidas pelo banco [Implementado] 
 
- Unicidade global de slug, e-mail, código público da mesa e hash de token. 
- No máximo um atendimento ativo por mesa (índice parcial). 
- Integridade referencial: não há atendimento sem mesa e restaurante, token sem atendimento, nem chamado sem atendimento, token e restaurante. 
- Valores restritos pelos enums (papel, status, tipo e motivo). 
- Padrões: status do atendimento `ACTIVE`, status do chamado `OPEN`, `keep_open` falso, mesa ativa.  

### 4.7.2 Regras que dependem do código (hoje não implementadas em fluxo) 
 
- Prazo de 4 horas (`expires_at` calculado na abertura), expiração por job e `closed_reason` igual a `TIMEOUT` com `closed_by` nulo. 
- Encerramento atômico: atendimento fechado, `revoked_at` preenchido em todos os tokens ainda não revogados e chamados abertos cancelados, numa única transação. Os blocos existem nos repositories (`revokeAllBySession`, `cancelOpenBySession`), prontos para uso dentro de `$transaction` por meio do `DbClient`; falta o service. 
- Token guardado só como hash: o gerador e o validador não existem; a coluna está pronta. 
- Papel do usuário fixado pelo service (hoje `ADMIN` no registro).  

### 4.7.3 Tenant no modelo 

[Implementado] `tables`, `table_sessions` e `calls` possuem `restaurant_id` obrigatório; `users` tem opcional; `session_tokens` não tem. Os filtros por tenant são aplicados nos repositories, não por regra do banco (não há segurança em nível de linha). O banco também **não** garante que o `restaurant_id` de um atendimento ou chamado seja o mesmo da mesa ou do atendimento a que se ligam, pois as chaves estrangeiras são simples (não compostas); a consistência depende de os services preencherem o tenant a partir da sessão. Requer validação (DV-32). 

## 4.8 Diferenças entre a documentação e o schema real  
| Item | v0.2 | v0.3 | Schema/migration real |
|---|---|---|---|  
| Número de tabelas | 13 (7 + 3 + 3) | 6 | 6 | 
| Tipo do identificador | uuid | uuid | Texto gerado pela aplicação | ``
| users.name | Ausente | Presente | Presente | ````````````````
| users.role | ADMIN, WAITER, KITCHEN | ADMIN, STAFF | ADMIN, STAFF | ``
| users.restaurant_id | Chave estrangeira | Chave estrangeira | Opcional | 
| Setores e vínculo garçom-setor | Previstos | Removidos | Ausentes | 
| Cardápio, comandas, pedidos, avaliações | Previstos | Futuro | Ausentes | ````````````
| tables | Com sector_id, sem restaurant_id | Com restaurant_id | Com restaurant_id e active (campo não listado nos diagramas) | ``````
| Token | Campo único em table_sessions | Tabela session_tokens | Tabela session_tokens | ``
| table_sessions.restaurant_id | Ausente | Presente | Presente | ``````````````
| closed_reason | TIMEOUT, WAITER | TIMEOUT, STAFF | STAFF, TIMEOUT | ``
| calls.restaurant_id | Ausente (mas índice previsto) | Ausente no diagrama (mas índice previsto) | Presente | ``````````````````````
| calls.status | OPEN, ACCEPTED, DONE, EXPIRED | OPEN, DONE, CANCELLED | OPEN, DONE, CANCELLED | ````````````
| Quem trata o chamado | accepted_by, accepted_at | done_by, done_at | done_by, done_at | 
| Índice parcial de atendimento ativo | Previsto | Previsto | Implementado | ``
| Índice composto em calls | Previsto | Previsto | Implementado | 
| Índice parcial de chamado aberto por tipo | Não previsto | Não previsto | Ausente (só proposto nos guias) |   

Esses pontos são consolidados abaixo e no Apêndice A.
