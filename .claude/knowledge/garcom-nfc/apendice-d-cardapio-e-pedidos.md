# Apêndice D. Cardápio, mídia e pedidos — implementação atual

Backend e frontend implementados para esta etapa: catálogo editável, publicação, mídia local, cardápio da mesa, envio e acompanhamento de pedidos, auditoria e eventos autorizados. Contratos detalhados a seguir e no Swagger de desenvolvimento. PDV e Amazon S3 continuam como evoluções futuras.

Implantação, logs, backup e restauração são detalhados neste apêndice.

## Implementado

- `back-end/prisma/schema.prisma` com 18 tabelas novas para catálogo, publicações, mídia, pedidos e auditoria.
- `back-end/prisma/migrations/20261119100000_menu_and_orders_foundation/migration.sql` aditiva, transacional, com relações entre tenants, checks monetários/quantidades, imutabilidade e backfill.
- Cadastro pelo próprio dono e criação pela plataforma geram restaurante, rascunho vazio, configuração com pedidos desabilitados e evento SYSTEM na mesma escrita transacional.
- Seed de demonstração usa os mesmos valores de inicialização para restaurantes novos.
- Preços/nomes do pedido são snapshots históricos; publicações e eventos são imutáveis, com preservação do tenant quando a referência de usuário removido fica nula.
- Dono e gerente editam/publicam e habilitam pedidos; garçom/cozinha acompanham, preparam, entregam e cancelam unidades elegíveis, com motivo e auditoria.
- Catálogo usa repositories/services/controllers/interfaces e validação Zod. Rascunho tem versão esperada; revisão pública é imutável; disponibilidade e habilitação têm efeito imediato.
- Envio valida atendimento, revisão e escolhas, calcula preço no servidor e impede duplicação. Contadores permitem preparo/entrega/cancelamento parciais.
- Desativação, scan, fechamento, publicação e pedidos compartilham coordenação transacional; fechamento manual recusa pendências, sem apagar pedidos ao expirar/desativar.
- Upload limitado, reencodificação WebP, imagens privadas antes da publicação, quotas, proteção de referências e limpeza horária. Volume persistente configurado em Compose.
- Eventos order:created/order:updated ficam na sala autorizada de pedidos e carregam só ID/versão; o contrato de recuperação por REST está documentado para o frontend.

Não há categorias obrigatórias, publicação automática ou habilitação automática de pedidos. As respostas existentes de cadastro continuam devolvendo os campos anteriores, sem expor estruturas internas adicionadas.

## Frontend: cardápio e pedidos [Implementado]

- `front-end/app/(app)/admin/cardapio/` e `components/adminComponents/cardapioPage.tsx` / `menuManagement.tsx`: OWNER e STAFF MANAGER gerenciam identidade, cores, fontes e prévia; categorias, produtos, variantes e opções; imagens, ordenação, arquivamento, disponibilidade, publicação e habilitação dos pedidos. A API verifica as permissões e as versões. Alterações do rascunho precisam ser publicadas; disponibilidade e configuração de pedidos têm efeito imediato.
- `front-end/app/(app)/m/[code]/` e `components/mesaComponents/`: a página da mesa mantém os botões existentes e abre o cardápio sobre a página, com fechamento pelo X. O cliente escolhe variante e opções, informa quantidade/observação, revisa e envia o pedido e consulta os próprios pedidos. Não há produtos fictícios no cardápio público quando a publicação falta.
- O envio guarda chave e corpo em `sessionStorage` antes da requisição e reutiliza ambos na tentativa de recuperar um resultado incerto. Sem armazenamento, o envio é bloqueado. Se o atendimento muda com uma pendência, é necessário confirmar a situação com a equipe antes de liberar novo envio; não há reenvio automático na nova sessão.
- `/admin/waiter` reúne os avisos de pedidos novos e prontos, a fila **Para servir** com **Entregue** por pedido, **Na cozinha**, cancelamento por etapa com motivo e os últimos dez encerramentos. `/admin/pedidos` redireciona para Chamados. O Apêndice E detalha o fluxo de pedidos à mesa.
- `/admin/cozinha`: OWNER, MANAGER e KITCHEN consultam a fila aberta do restaurante, inclusive pedidos de sessões encerradas. A tela mostra **Novos**, **Em preparo** e **Aguardando garçom** com as quantidades da respectiva etapa e o tempo desde que as unidades ficaram prontas. **Iniciar preparo** movimenta apenas unidades pendentes e **Pronto** libera apenas unidades em preparo.
- Requisições ficam em `front-end/services/menu.ts` e `orders.ts`; tipos em `front-end/lib/menuTypes.ts` e `orderTypes.ts`. `lib/api.ts` envia JSON ou multipart, inclui cookies administrativos e `X-Table-Token` quando necessário e permite obter imagens privadas como Blob.
- A suíte do frontend cobre entrega parcial, avisos de novos lotes, atraso e atualização na tela da mesa. Os testes de integração do backend usam PostgreSQL e cobrem isolamento por restaurante e aparelho, concorrência nas transições e paginação do histórico.

## Integração com Prisma

menus.id usa UUID textual gerado pelo PostgreSQL. O id participa também da FK composta do ponteiro de publicação. A geração no banco evita omissão do UUID pelo Prisma em criações aninhadas com essa relação. Os demais IDs mantêm o padrão existente de UUID textual gerado pelo cliente Prisma.

Operações de criação passam por initialRestaurantData/RestaurantRepository; acesso direto a prisma.restaurants.create continua sendo uma primitiva de persistência e não inicializa o agregado automaticamente. Factories de testes antigos que só precisam de restaurante podem continuar usando essa primitiva. Serviços de negócio devem usar o repository para o cadastro completo.

O schema não expressa todos os CHECKs e triggers: preservar o SQL da migration. Não substituir a implantação por prisma db push.

## Armazenamento

**Nesta versão:** LocalStorageProvider e upload implementados. Arquivos locais em volume persistente no host, por trás de IStorageProvider. Banco guarda metadados, propriedade, derivados e referências. MEDIA_ROOT=/data/media nos dois arquivos Compose; produção prepara permissões da pasta para o usuário node.

**Feature futura aprovada:** migrar imagens para bucket Amazon S3. Não há dependência de SDK AWS, credenciais ou bucket para iniciar o backend ou realizar deploy com disco persistente. A migração futura inclui cópia/verificação das imagens existentes e troca controlada do provider. Código/API de armazenamento fica no backend; o bucket guarda objetos.


## D.1 API de cardápio, mídia e pedidos

Base `/api/v1`. Swagger em `/docs` fora de produção; schemas de entrada vêm dos mesmos schemas Zod utilizados pelos services. As tabelas deste arquivo descrevem o contrato implementado, prevalecendo sobre nomes exemplificativos do planejamento.

### Autorização e concorrência

Administrativo: cookie httpOnly de login. OWNER e STAFF MANAGER editam/publicam/configuram; OWNER, MANAGER, WAITER e KITCHEN consultam pedidos, atualizam preparo/entrega/cancelamento e disponibilidade. Demais STAFF e SUPER_ADMIN não recebem essas capacidades implicitamente. Todas as operações administrativas são restritas ao restaurante autenticado.

Cliente: `X-Table-Token` obtido pelo scan existente, válido somente para o próprio atendimento/aparelho. Não precisa de conta. Só consultar o cardápio público não emite token nem abre sessão. Consumidor deve chamar scan quando iniciar interação que exige atendimento; a página de mesa antiga ainda pode executar seu scan habitual, até integração do novo frontend.

Toda mutação do rascunho exige `expected_draft_version`. Resposta de criação/edição é o rascunho completo com a nova `draft_version`. Escritas operacionais usam `expected_version`. Campos desconhecidos são rejeitados nas rotas novas. `null` só é aceito nos campos explicitamente anuláveis.

Mutações relevantes compartilham trava transacional curta por restaurante; upload/processamento e notificações ficam fora da transação. Repositories ficam vinculados à mesma transação pelo contexto fornecido pela unidade de trabalho, seguindo o padrão já utilizado nos services existentes. Papel/categoria e restaurante são revalidados no banco para escritas administrativas.

### Rascunho

| Método | Caminho | Campos principais do corpo |
|---|---|---|
| GET | `/menu/draft` | Nenhum; retorna rascunho e versão |
| PATCH | `/menu/draft` | Versão + display_name, description, logo_media_id, cover_media_id, presentation_config |
| GET | `/menu/preview` | Prévia privada; catálogo incompleto pode responder validação 400 |
| POST | `/menu/categories` | Versão + name, description?, position? |
| PATCH | `/menu/categories/:id` | Versão + name?, description?, visible?, archived?, position? |
| POST | `/menu/products` | Versão + category_id, name, description?, position?, initial_variant { name, price_cents } |
| PATCH | `/menu/products/:id` | Versão + category_id?, name?, description?, visible?, archived?, position? |
| POST | `/menu/products/:productId/variants` | Versão + name, price_cents, position? |
| PATCH | `/menu/variants/:id` | Versão + name?, price_cents?, visible?, archived?, position? |
| POST | `/menu/products/:productId/option-groups` | Versão + name, min_selections, max_selections, position? |
| PATCH | `/menu/option-groups/:id` | Versão + name?, min_selections?, max_selections?, archived?, position? |
| POST | `/menu/option-groups/:groupId/options` | Versão + name, price_delta_cents, max_quantity, position? |
| PATCH | `/menu/options/:id` | Versão + name?, price_delta_cents?, max_quantity?, visible?, archived?, position? |
| PUT | `/menu/variants/:id/option-groups` | Versão + group_ids, conjunto completo sem duplicatas |
| PUT | `/menu/products/:id/images` | Versão + items [{ media_id, alt_text? }], na ordem desejada |
| PUT | `/menu/order` | Versão + collection, parent_id?, ordered_ids |

collection = categories/products/variants/groups/options. parent_id é obrigatório exceto para categories. ordered_ids inclui todos os irmãos ativos, sem duplicatas. Arquivamento é lógico; não há DELETE do catálogo. Mover produto para outra categoria não muda sua identidade ou seus pedidos anteriores.

presentation_config v1: palette { primary, background, surface, text } em `#RRGGBB`; typography = sans/serif/mono; layout = list/grid; border_radius = none/small/medium/large. Não recebe CSS, HTML, JS ou URLs de imagens arbitrários. Logo/capa são media_id do restaurante. Há defaults derivados das cores existentes do projeto.

### Publicação e consulta pública

- POST `/menu/publications`: `{ "expected_draft_version": 4 }`. Retorna `{ publication_id, revision_number, replayed }`, 201 para nova revisão e 200 se já publicada. Retirar e publicar novamente o mesmo rascunho restaura a revisão imutável existente explicitamente, sem duplicar a revisão.
- POST `/menu/unpublish`: `{ "expected_publication_id": "UUID" }`. Retorna `{ published_revision_id: null }`. Não cancela pedidos nem apaga revisões/imagens referenciadas.
- GET `/public/restaurants/:slug/menu` ou `/public/tables/:code/menu`: `{ publication_id, content, availability, customer_ordering_enabled, media_paths }`. Cache-Control: no-store.
- content tem schema_version, identidade, apresentação e categorias/produtos/variantes/grupos/opções/imagens. Dados de autoria e rascunho ficam fora dessa resposta. availability é um mapa dos IDs publicados para booleanos operacionais; media_paths contém caminhos relativos à origem da API.

Cliente deve considerar variante, produto e escolhas obrigatórias disponíveis, não apenas o mapa de produto. Servidor valida a combinação completa no envio. Consulta por slug permite navegação sem mesa; não concede envio sem token/atendimento.

### Configuração e disponibilidade

- GET `/ordering-settings`: `{ customer_ordering_enabled, version }`, OWNER/MANAGER.
- PATCH `/ordering-settings`: `{ expected_version, customer_ordering_enabled }`. Efeito imediato, sem publicar rascunho. Pedidos existentes continuam em operação.
- PATCH `/menu/availability`: `{ kind, id, is_available, expected_version }`, kind = **products/variants/options**. Retorna `{ id, is_available, availability_version }`. Não altera draft_version nem preços publicados. Registra auditoria.

GET `/public/table-context` com token: `{ session_id, expires_at, table: { label }, can_order, reason }`. Não abre sessão nem renova token. reason é CUSTOMER_ORDERING_DISABLED, MENU_NOT_PUBLISHED ou null; token inválido/expirado responde 401.

### Enviar pedido

POST `/public/orders` com X-Table-Token:

```json
{
  "submission_key": "UUID novo por envio",
  "publication_id": "UUID da revisão exibida",
  "items": [{
    "product_id": "UUID",
    "variant_id": "UUID",
    "quantity": 2,
    "selections": [{ "option_id": "UUID", "quantity": 1 }],
    "notes": "Sem cebola"
  }]
}
```

`selections` é obrigatório, podendo ser vazio. Não enviar preços, total, restaurante ou sessão no corpo. O backend calcula e valida tudo. Preço da linha = (preço da variante + adicionais por unidade) × quantidade. Unidades com escolhas diferentes precisam de linhas distintas.

Resposta 201: `{ order, replayed: false }`. Mesmo token, chave e conteúdo retornam 200 com o mesmo pedido e replayed=true; chave reutilizada com outro contexto/conteúdo responde 409 IDEMPOTENCY_CONFLICT. Ordenar seleções de forma diferente não muda a identidade do envio; ordem das linhas faz parte do conteúdo. Guardar a chave e o corpo até obter confirmação, inclusive após timeout de rede. Não gerar chave nova automaticamente no retry.

Mudança de revisão exige reconfirmação (MENU_REVISION_CHANGED). Esgotamento responde ITEM_UNAVAILABLE. Desativar pedidos bloqueia novos envios; retry autorizado de um pedido já recebido continua recuperando o resultado enquanto o token/sessão estiver válido.

### Consultar e operar

| Método/caminho | Função |
|---|---|
| GET `/public/orders` | Próprios pedidos do mesmo token; limit/cursor |
| GET `/public/orders/:id` | Próprio pedido com atendimento ativo; outro token, mesmo na mesa, recebe 404 |
| GET `/orders` | Fila do restaurante; session_id, from/to ISO, progress, limit/cursor |
| GET `/orders/:id` | Pedido administrativo |
| GET `/orders/:id/events` | Histórico; after_sequence (padrão 0), limit |
| POST `/orders/:id/transitions` | Atualiza quantidades por etapa e registra eventos |

Listas: `{ items, next_cursor, server_time }`, default limit 50, máximo 100. Cursor é opaco. progress aceita open (padrão administrativo), ready, completed, cancelled e closed. ready inclui pedidos que também têm itens em preparo. closed reúne todos os pedidos encerrados e ordena por updated_at e ID decrescentes. Filtros de estado não são aplicados à lista do cliente, que consulta os próprios pedidos da sessão.

Order DTO: id, table_label, source, fulfillment_type, currency, total_cents original, cancelled_cents, active_total_cents, version, created_at, updated_at, progress e items. Administrativo também contém session_id, ready_since (lote pronto mais antigo ainda disponível) e ready_sequence (sequência do lote disponível mais recente). Não expõe request_hash, token autor ou submission_key. progress contém quantidades pending/preparing/ready/delivered/cancelled e flags is_completed/is_cancelled. Cada item contém identificação/nome históricos, quantity, preços, observação, contadores por etapa e escolhas históricas.

```json
{
  "expected_version": 1,
  "operations": [{
    "item_id": "UUID",
    "from_stage": "PENDING",
    "to_stage": "CANCELLED",
    "quantity": 1,
    "reason": "Cliente desistiu"
  }]
}
```

Etapas: PENDING → PREPARING → READY → DELIVERED. Atalhos para READY/DELIVERED são permitidos; todos os estados anteriores à entrega permitem CANCELLED. Não reabrir, cancelar entregue ou voltar etapas. Motivo é obrigatório somente no cancelamento, com 3–500 caracteres. Lote aceita até 50 operações, sem repetir item; falha em uma desfaz todas.

As duas telas enviam `expected_version` da versão exibida. Em `ORDER_VERSION_CONFLICT`, a fila é recarregada e a ação fica pendente de confirmação explícita. Se ainda houver unidades elegíveis, a confirmação mostra a disponibilidade atual e permite ajustar a quantidade. Se a etapa esvaziou ou o pedido saiu da fila, a ação só pode ser descartada. A distribuição de ações entre telas segue o fluxo operacional. As permissões da API seguem as capacidades existentes de cada categoria. A auditoria identifica a conta autenticada e sua categoria.

Fechamento manual da sessão com unidades pendentes retorna SESSION_HAS_PENDING_ORDERS. Expiração/desativação encerra o acesso do cliente, preserva pedidos e permite conclusão posterior pela equipe autorizada quando restaurante estiver ativo. Conta/financeiro ainda não é controlado pelo módulo.

### Mídia

- POST `/media`, multipart com apenas campo file: JPEG/PNG/WebP estático, até 8 MiB, 25 milhões de pixels, lado até 10 mil px. OWNER/MANAGER. Processa orientação, remove metadados e gera WebP main até 1600 px e thumb até 480 px, sem ampliar a imagem. Leitura multipart é limitada em memória e há dois slots por processo incluindo recepção/processamento; não há buffer sem limite.
- Resposta 201: `{ id, status: "READY", width, height, byte_size, main_path, thumb_path }`. width/height descrevem a imagem fonte; as dimensões finais ficam nos derivados e no arquivo WebP. byte_size soma os dois derivados. Não expõe storage_key.
- GET `/media/:id/main|thumb`: privado, OWNER/MANAGER do restaurante, no-store.
- GET `/public/media/:id/main|thumb`: só se referenciada pela publicação atual de restaurante ativo; cache até 5 minutos. Arquivo já baixado/cacheado não pode ser recolhido instantaneamente ao retirar publicação.
- DELETE `/media/:id`: 204 se sem referências; 409 MEDIA_IN_USE caso contrário. Revisões antigas continuam retidas e protegem suas imagens.
- Limpeza horária: pendentes/falhos com mais de 24 h, READY sem referência com mais de 7 dias e exclusões que precisam de retry. Estado DELETING impede novas associações; remoção de bytes acontece fora da transação. Reserva e quota são coordenadas por restaurante.

### Eventos e recuperação

As respostas também incluem X-Request-Id para diagnóstico. Logs estruturados e medição de espera/transação são descritos em [a seção D.2](a seção D.2).

Socket.IO usa os cookies existentes. `order:created` e `order:updated` enviam somente `{ order_id, version }` para a sala de funcionários com orders:read daquele restaurante. Não há sala pública de pedidos; outros STAFF não recebem esses eventos. Trocar categoria invalida o cache e desconecta o usuário.

Cozinha e Chamados usam a mesma sincronização. Cada leitura percorre todos os `next_cursor` de `GET /orders?progress=open`. Os eventos são avisos de mudança e as rajadas são agrupadas em uma reconciliação. Uma leitura invalidada durante a paginação é descartada antes de publicar a fila. A reconciliação também ocorre na entrada, na reconexão, no retorno do foco e a cada 15 s enquanto o painel está visível. Uma falha de emissão não desfaz a venda.

A tela sinaliza desconexão do Socket.IO ou falha da leitura REST. Em indisponibilidade transitória, a última fila carregada continua visível. Uma desconexão iniciada pelo servidor bloqueia ações até nova verificação de acesso. A sessão é verificada na reconciliação e antes de enviar transições. Resposta 401/403 ou perda da categoria permitida na Cozinha limpa a fila e bloqueia as ações. A tela da mesa consulta o status com o cardápio e o histórico fechados, a cada 10 s enquanto a aba estiver visível e houver pedido aberto ou erro transitório. Em caso de 401, oferece reinício do atendimento.

### Aceite anterior do KDS

- No navegador Orca, o envio real de duas unidades pela Mesa 1 retornou 201. A Cozinha iniciou uma unidade e a marcou pronta. Pedidos refletiu as duas transições sem recarregar a página e entregou a unidade pronta. A Cozinha manteve uma unidade nova e voltou a zero prontas.
- Em Cozinha e Pedidos, dois cliques concorrentes disputaram a última unidade nova. Um foi aceito. O outro mostrou conflito, disponibilidade atual esgotada e a opção de descartar. Ao interromper e reiniciar a API de teste, o aviso de conexão degradada apareceu e desapareceu e o pedido permaneceu visível.
- O acesso direto de WAITER à Cozinha redirecionou para Chamados e o perfil manteve o atalho de Pedidos. Alterar uma sessão de KITCHEN para WAITER retirou a fila e as ações da Cozinha aberta e exibiu a mensagem de permissão. `back-end/tests/realtime.test.ts` cobre evento real de pedido criado pelo fluxo de scan, atualizações, corrida 200/409, entrega parcial, eventos perdidos e fila recuperada por REST após reconectar. Também cobre a recusa de OTHER e a fila vazia para um segundo restaurante. `back-end/tests/menu-orders.test.ts` valida a permanência de pedidos abertos de sessões vencidas.
- `front-end/tests/kitchen.test.mjs` cobre toda a paginação, acesso direto, confirmação com as quantidades vigentes, consolidação de eventos, descarte de leituras antigas, foco, polling, reconexão e bloqueio após perda de acesso. O aceite usou a base descartável do navegador e a suíte de integração usou PostgreSQL de teste separado.

### Configuração de impressão e comanda original [Implementado]

A migration `20261119110000_kitchen_printing` cria `print_destinations` e `print_jobs`, com os enums `print_destination` e `print_job_status`. Cada restaurante começa com a impressão de `KITCHEN` pausada. A primeira emissão de código persiste a configuração. A pausa conserva o agente pareado e retém as tarefas pendentes para revisão.

| Operação sob `/api/v1` | Contrato |
| --- | --- |
| GET `/printing/kitchen` | OWNER/MANAGER. Retorna `{ destination, enabled, paired, last_contact_at }`. O último contato é um horário UTC ou `null`. |
| PATCH `/printing/kitchen` | OWNER/MANAGER. Recebe `{ enabled }` e devolve o estado. Ativar exige pareamento, com `409 PRINT_AGENT_NOT_PAIRED` se faltar. |
| POST `/printing/kitchen/pairing` | OWNER/MANAGER. Retorna `201` com `{ code, expires_at }`. O código hexadecimal de 20 caracteres vale 10 minutos e substitui o código pendente anterior. |
| DELETE `/printing/kitchen/pairing` | OWNER/MANAGER. Retorna `204`, revoga a credencial e o código pendente, limpa o último contato e pausa. |
| POST `/print-agent/pair` | Recebe apenas `{ code }`. Retorna `201` com `{ destination, credential }`. Consome o código no mesmo commit que grava a credencial, registra contato, substitui o pareamento anterior e deixa a impressão pausada. Código vencido, usado ou desconhecido retorna `401`. Limite de 20 tentativas por IP a cada 10 minutos. |
| POST `/print-agent/contact` | Recebe `Authorization: Bearer <credential>`. Registra contato mesmo durante a pausa e retorna `204`. Credencial inválida ou revogada retorna `401`. |

O servidor deriva restaurante e destino a partir do hash exclusivo do código ou da credencial. O banco guarda apenas os hashes e a API devolve os segredos somente na emissão, com `Cache-Control: no-store`. Configuração, troca de credencial, contato e envio de pedido usam o mesmo lock transacional por restaurante.

Um pedido novo criado com a impressão ativa grava uma tarefa `PENDING` de origem `ORDER_CREATED` na mesma transação do pedido, dos itens e do evento de auditoria. Replay de envio retorna antes da gravação da comanda. A chave única usa restaurante, pedido, destino e evento de origem. Chaves estrangeiras compostas ligam tarefa, pedido e destino ao mesmo restaurante.

O payload versão 1 reúne `order_id`, `created_at` em UTC, `table_label` e `items`. Cada item contém `item_id`, `product_name`, `variant_name`, `quantity`, `notes` e `selections` com `group_name`, `option_name` e `quantity` por unidade. A comanda usa snapshots persistidos na confirmação do pedido. A ativação vale para novos envios.

### Reserva, resultado e segunda via [Implementado]

| Operação sob `/api/v1` | Contrato |
| --- | --- |
| POST `/print-jobs/claim` | Bearer do agente. Corpo ausente ou `{}`. Retorna `200` com `{ id, destination, reservation_id, expires_at, payload_version, order_version, payload }`. Retorna `204` quando pausada, sem trabalho elegível ou com reserva vigente. |
| POST `/print-jobs/:id/result` | Bearer do agente que reservou e corpo `{ reservation_id, outcome }`. Aceita `SENT`, `FAILED_BEFORE_SEND` ou `UNCERTAIN`. Retorna `204` no registro ou replay idêntico da última reserva. Retorna `404` fora do restaurante/destino e `409 PRINT_RESERVATION_CONFLICT` quando vencida, substituída ou divergente. |
| GET `/print-jobs` | OWNER/MANAGER/KITCHEN. Filtros opcionais `status`, `destination` e `order_id`. `limit` de 1 a 100, padrão 50. Use `next_cursor` como `cursor` para percorrer `{ jobs, next_cursor, server_time }` em ordem decrescente de criação e ID. |
| POST `/orders/:id/reprints` | OWNER/MANAGER/KITCHEN. Recebe `{ idempotency_key, reason }`, com chave UUID e motivo de 3 a 500 caracteres. Responde `201` na criação ou `200` ao repetir chave, motivo e autor no mesmo pedido/destino. O trabalho registra autor e comanda original. O payload reservado inclui `reprint: { label: "SEGUNDA VIA" }`; o agente deve imprimir essa indicação. |
| PATCH `/printing/kitchen` para revisão | OWNER/MANAGER. Envie `{ review: { job_ids, decision } }` com 1 a 100 IDs de comandas `REVIEW_REQUIRED` e `RELEASE` ou `DISCARD`. Liberar recoloca na fila e exige contato recente. Descartar marca `SUPPRESSED`. A resposta é o estado da configuração. Se alguma comanda já mudou, o lote inteiro retorna `409 PRINT_REVIEW_CONFLICT`. |

A pausa, a revogação e a troca de pareamento retêm a fila pendente. Um intervalo de pelo menos cinco minutos sem contato retém as pendências ao consultar a fila ou no próximo contato do agente. As comandas preexistentes na migration entram em revisão. Liste `REVIEW_REQUIRED` para decidir quais saídas ainda são necessárias antes de retomá-las. Se a impressão passar de ativa para pausada durante uma reserva, uma falha pré-envio posterior também exige revisão antes de uma nova tentativa.

O agente deve conferir `expires_at` antes de enviar. O enum `print_job_outcome` registra o resultado informado pelo agente. A reserva vale 30 segundos e o banco limita a uma comanda `SENDING` por restaurante e destino. Reservas vencidas aparecem como `UNCERTAIN` na próxima operação da fila, sem retry. `SENT` indica que o transporte aceitou a comanda. `FAILED_BEFORE_SEND` reprograma com espera de 5 e depois 10 segundos, até o total de três tentativas. A terceira falha pré-envio marca `FAILED`. Em caso incerto, a equipe confere o papel antes de pedir segunda via.

A reserva revalida cancelamentos sob o mesmo lock usado pelas transições de pedido. Uma comanda totalmente cancelada vira `SUPPRESSED`; cancelamentos parciais fixam a versão e as quantidades restantes na reserva. Depois da reserva, comunicar cancelamentos à cozinha. A segunda via exige uma original existente e fora de `PENDING`, `REVIEW_REQUIRED` ou `SENDING` com prazo vigente, e um pedido com unidades não canceladas. Reaproveitar a chave com motivo ou autor diferente retorna `409 PRINT_REPRINT_KEY_CONFLICT`.

A suíte PostgreSQL em `back-end/tests/printing.test.ts` cobre pareamento, rollback, concorrência, isolamento, expiração, replay, segunda via, revisão, cancelamentos e prazos.

O serviço local fica em `print-agent/` (Node + TypeScript com tsx). Ele pareia com o código temporário, guarda a credencial em arquivo local com permissão 600, reserva, confere `expires_at`, renderiza a comanda ESC/POS e registra o resultado. A comanda traz mesa, `order_id` igual ao do cartão do KDS, horário, itens, variante, adicionais, observações e `SEGUNDA VIA` quando for o caso. O emulador grava a saída em arquivo e simula falta de papel e perda de confirmação. O teste `npm run test:e2e` usa a API e um PostgreSQL reais (`garcom_kds_agent_test`). Instruções em `print-agent/README.md`.

No front, OWNER e MANAGER podem acessar `/admin/cozinha/configuracoes` diretamente para parear, ver o último contato, ativar após o teste, pausar, revogar e revisar pendências antigas. A listagem de impressão e a segunda via continuam disponíveis na API. A tela atual da Cozinha mostra a fila de pedidos. A validação em impressora física segue pendente.

O módulo `back-end/src/modules/printing/` usa `printing.routes.ts`, `printing.controller.ts`, `printing.schemas.ts`, `printing.interfaces.ts`, `printing.service.ts`, `printing.repository.interface.ts`, `printing.repository.ts` e `print-job.ts`. Os contratos HTTP estão em `back-end/src/docs/printing-openapi.ts`.

### Limites e erros

50 linhas por pedido, 1–20 unidades por linha, seleção máxima de 50 unidades por grupo, até 20 grupos/produto, 50 opções/grupo, 20 variantes/produto e 8 imagens/produto. Rascunho: até 100 categorias e 1000 produtos ativos. Nome até 120 caracteres; descrição 3000; observação 500. Payload JSON das rotas novas até 256 KiB; publicação validada com margem de representação para o CHECK de 2 MiB no PostgreSQL.

Preços base/adicionais: 0–1.000.000 centavos; unitário final até 10.000.000; pedido até 100.000.000 centavos. Sem descontos, gorjeta, taxas, pagamentos ou estoque neste ciclo.

Erros seguem `{ error, code, message, details? }`. Principais códigos: VALIDATION_ERROR (400), UNAUTHORIZED (401), FORBIDDEN (403), NOT_FOUND/MENU_NOT_PUBLISHED (404), DRAFT_VERSION_CONFLICT, MENU_PUBLICATION_CONFLICT, MENU_REVISION_CHANGED, CUSTOMER_ORDERING_DISABLED, MENU_NOT_ORDERABLE, ITEM_UNAVAILABLE, IDEMPOTENCY_CONFLICT, ORDER_VERSION_CONFLICT, INVALID_ORDER_TRANSITION, SESSION_HAS_PENDING_ORDERS e MEDIA_IN_USE (409), UPLOAD_TOO_LARGE/CATALOG_TOO_LARGE (413), UNSUPPORTED_MEDIA_TYPE (415), TOO_MANY_REQUESTS (429), STORAGE_UNAVAILABLE/MEDIA_PROCESSING_BUSY/RETRYABLE_TRANSACTION_FAILURE (503).

Configuração por ambiente: MEDIA_ROOT (default .media no cwd), MEDIA_QUOTA_BYTES (2 GiB), MEDIA_MAX_ASSETS (2000); ORDER_SUBMIT_LIMIT (20/5 min/token), ORDER_READ_LIMIT (120/min/token), MENU_READ_LIMIT (600/min/IP), MENU_PUBLISH_LIMIT (10/min/usuário), MEDIA_UPLOAD_LIMIT (30/10 min/usuário). Limites e cache de autenticação em memória pressupõem uma instância da API.

Docker de desenvolvimento/produção monta media_data em /data/media; produção prepara a pasta para o usuário node. Backup exige PostgreSQL e volume de imagens. Recriar container mantém o volume; remover volumes com `down -v` apaga banco e mídia. Bucket Amazon S3 continua sendo feature futura; não há credenciais AWS nem SDK exigidos nesta versão.

## D.2 Operação do módulo

### Implantação inicial

Requer PostgreSQL 16 e uma instância da API com disco persistente. Os Compose de desenvolvimento e produção montam media_data em /data/media. O Dockerfile prepara a pasta para o usuário node. Nenhum recurso ou credencial AWS é necessário.

Antes de aplicar a migration em base existente: backup, execução das consultas da seção D.3, confirmação da URL de destino e revisão do schema. A aplicação neste trabalho foi exclusivamente em bancos temporários de teste. O entrypoint de produção aplica migrations pendentes ao iniciar; executar um deploy real é uma ação distinta, não realizada por este trabalho.

Na primeira inicialização, restaurantes antigos recebem rascunho vazio e envio desabilitado. O dono/gerente cadastra categorias/produtos, envia imagens, publica e habilita pedidos. O cliente só envia pelo contexto de mesa ativa. As interfaces de usuário consomem os contratos descritos acima.

### Logs e diagnóstico

Respostas HTTP incluem X-Request-Id, também exposto pelo CORS para as origens autorizadas. Logs JSON de requisições registram esse ID, método, rota, restaurante quando autenticado, status, código de erro e duração. A unidade de trabalho registra tentativa, tempo de espera da trava e duração total da transação. Jobs sem requisição podem não ter request_id.

Não são registrados bodies de pedidos, observações, arquivos, cookies ou tokens por esses logs. Em NODE_ENV=test os logs operacionais são desabilitados para não poluir testes; os erros sanitizados existentes continuam disponíveis. Usar códigos de erro e request_id para correlação, não copiar credenciais para mensagens de diagnóstico.

Contadores de falhas/conflitos, latência e espera podem ser derivados desses eventos por um coletor externo, que não é dependência deste incremento. Não foi definido SLA de throughput nem provisionado um sistema externo de métricas. Um mutex por restaurante coordena escritas; caso a espera cresça, medir antes de alterar a granularidade das travas.

### Backup consistente do armazenamento local

Para a implantação inicial com uma API, usar uma janela breve de manutenção:

1. Suspender a API para impedir uploads, edição/publicação e limpeza enquanto se captura o backup. Confirmar que não existem outros escritores manuais no banco.
2. Capturar um dump consistente do PostgreSQL e uma cópia completa do volume media_data. Incluir chaves, hashes e metadados do banco; os arquivos isolados não identificam suas relações.
3. Registrar versão do código/migrations e data do backup. Reiniciar a API e conferir saúde e leitura de um cardápio/imagem publicada.

Não basta salvar só o banco, só as imagens ou a pasta do container. Recriar container preserva volume nomeado; remover os volumes apaga seus dados. Não executar down -v como procedimento de atualização.

### Restauração

Manter API parada, restaurar o banco e o volume do mesmo conjunto de backup, recuperar as permissões do volume para o usuário node e conferir MEDIA_ROOT. Restaurar uma versão coerente do schema e depois aplicar migrations pendentes, em vez de importar restaurantes antigos diretamente numa base nova e pressupor inicialização automática.

Validar contagem de arquivos/derivados, chaves relativas e hashes amostrais, acesso privado/público e fila dos pedidos antes de liberar o acesso. Regenerar o Prisma Client a partir do schema da versão implantada. Não tentar reverter uma release apagando tabelas com pedidos reais; usar correção aditiva ou restauração planejada.

Testes deste trabalho usam arquivos temporários reais e bancos descartáveis. Build/restart de containers e restauração completa em infraestrutura de produção ainda precisam ser exercitados no ambiente de implantação.

### Evoluções separadas

- Amazon S3: criar bucket/permissões, implementar S3StorageProvider, acrescentar provider ao schema, copiar/verificar os objetos e trocar referências de forma controlada. Não é só mudar uma variável e não exige instalar uma API no bucket.
- Múltiplas instâncias: compartilhar invalidação de autenticação, limitadores e distribuição de eventos; armazenamento local isolado não é compartilhado automaticamente. O desenho atual pressupõe uma instância.
- PDV/integrações externas: acrescentar casos de uso por origem/modalidade, mapeamento e idempotência externos, preservando o núcleo e o histórico dos pedidos existentes.

As migrations `20261120000000_pos_order_source` e `20261120000100_pos_orders_and_tabs` registram a implementação experimental já aplicada. A migration `20261120010000_revert_pos_orders_and_tabs` restaura o schema do fluxo por mesa e interrompe a reversão quando a base contém pedidos de PDV. O histórico de migrations preserva os arquivos aplicados.

## D.3 Verificações antes da migration

Consultas somente de leitura para a base anterior à migration; revise o backup e a URL de destino antes de executá-las.

```sql
-- Read-only checks against the CURRENT baseline, before the proposed migration.
-- Does not change schema or rows. Run only after the existing migration chain.

-- Must return zero rows: new compound FK rejects mismatched tenant/table sessions.
SELECT s.id AS session_id, s.restaurant_id AS session_restaurant,
       t.restaurant_id AS table_restaurant
FROM table_sessions s JOIN tables t ON t.id = s.table_id
WHERE s.restaurant_id IS DISTINCT FROM t.restaurant_id;

-- Informational: display_name backfill trims/truncates to 120 characters,
-- with fallback "Cardápio" for empty legacy names; restaurants.name is unchanged.
SELECT id, length(name) AS current_name_length
FROM restaurants
WHERE length(name) > 120 OR length(btrim(name)) = 0;

-- Must return zero rows for a first application of the proposed migration.
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN (
  'restaurant_order_settings','menus','menu_categories','menu_products',
  'menu_product_variants','menu_option_groups','menu_options','menu_variant_option_groups',
  'media_assets','media_derivatives','menu_product_images','menu_publications',
  'menu_publication_media','orders','order_items','order_item_options','order_events',
  'restaurant_operation_events'
);

```
