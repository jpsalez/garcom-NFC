# Fechamento técnico e plano de implementação — etapas 4 a 7

Registro histórico do planejamento aprovado. Para estado implementado, validação e contrato vigente: [README](README.md), [API](API.md) e [operação](OPERACAO.md).

Status: planejamento aprovado pelo usuário, com entrega e cancelamento também permitidos a garçons/cozinha conforme matriz atualizada. Código/migrations ainda não iniciados; aprovação do plano não significa executar migrations em banco real, fazer commit/push ou implantar. Este documento resolve divergências anteriores e é a consolidação vigente.

Atualização de execução: schema e migration preparados em [revisao-banco](README.md), fora do backend, com validação estrutural Prisma e testes SQL isolados. Não aplicados ao banco da aplicação. Próximo requisito de validação: PostgreSQL 16 descartável.

## 1. Base e escopo

Leitura do repositório `C:/Users/Lene _3/Desktop/jp/garcom-NFC`, branch dev, HEAD `46a66bdc6fcd9c0b2e855095a6965ee3181c4963`. Existem alterações locais da home e arquivos de validação que não pertencem a este módulo. Antes de codificar: confirmar checkout de destino, revisar o diff e preservar essas alterações. Não copiar automaticamente a pasta antiga nem dar pull sobre trabalho local sem inspeção.

Agora: backend de catálogo, publicação, mídia e pedidos de mesa, documentação e testes. Depois: telas de edição/painéis do módulo, PDV, pagamentos, estoque, fiscal, impressão, entrega/retirada e integrações externas. O contrato é preparado para o frontend, mas sua implementação será uma etapa explicitamente autorizada à parte. Nenhum pedido é criado por funcionário neste ciclo, pois isso entra no fluxo posterior de PDV.

Arquitetura inicial: uma instância da API, PostgreSQL, arquivos persistentes e Socket.IO existente. Sem MongoDB, Redis ou broker obrigatório. Antes de múltiplas instâncias, resolver cache de autenticação, limitadores e distribuição de eventos; não assumir que o desenho atual já suporta isso.

## 2. Fechamento das regras propostas

### Autorização

Capacidades fixas no código, derivadas dos papéis/categorias atuais:

- OWNER e STAFF MANAGER: menu:manage, menu:publish, ordering:configure, availability:write, orders:read, orders:prepare, orders:deliver, orders:cancel.
- STAFF WAITER: availability:write, orders:read, orders:prepare, orders:deliver, orders:cancel.
- STAFF KITCHEN: availability:write, orders:read, orders:prepare, orders:deliver, orders:cancel.
- STAFF CLEANING/OTHER/sem categoria e SUPER_ADMIN: sem capacidades administrativas deste módulo por padrão.
- Público consulta publicação. Cliente autenticado pelo token da mesa envia e consulta os próprios pedidos; token de funcionário não substitui o contexto de mesa.

Adicionar category ao resultado de autenticação, AuthEntry e tipo de req.user. Validar por política pura de capacidades usada por HTTP, services e Socket.IO. Uma alteração de categoria invalida o cache e desconecta os sockets do usuário, inclusive se ele continuar ativo. O código atual desconecta apenas na desativação: será corrigido para mudança relevante de acesso.

### Andamento, cancelamento e fechamento

Manter contadores por etapa em cada linha. Ação de transição informa from_stage, to_stage e quantity, sem escolha implícita de quais unidades mover. Atalhos PENDING/PREPARING → READY e PENDING/PREPARING/READY → DELIVERED são permitidos por quem tem capacidade correspondente. PENDING → PREPARING e PREPARING → READY são o caminho normal.

Cancelamento: OWNER/MANAGER/WAITER/KITCHEN move unidades de PENDING, PREPARING ou READY para CANCELLED, com motivo de 3 a 500 caracteres. Não cancelar/reabrir unidades entregues. Demais transições reversas não existem neste ciclo. Várias linhas podem ser atualizadas em uma única ação de lote, no mesmo pedido e mesma transação; se uma operação for inválida, o lote inteiro falha.

Auditoria de preparo/entrega: registrar a conta autora, categoria no momento da ação, etapa anterior/nova, quantidade e horário. READY é pronto para retirada; DELIVERED é entregue ao cliente. Cozinha pode registrar ambas, assim como garçom. Não deduzir o entregador pela ausência de outro evento: quem marca entrega é o autor do registro. Em terminal com conta compartilhada isso não comprova qual pessoa realizou a entrega física; não inventar atribuição automática. Campo de entregador físico distinto só será acrescentado mediante requisito específico.

Correção de conteúdo de pedido recebido: cancelar unidades elegíveis e o cliente reenviar com nova chave. Não oferecer edição interna de itens neste ciclo. Esse limite precisa aparecer na documentação, pois sem PDV a equipe não consegue inserir o pedido substituto pelo painel.

Encerramento manual de atendimento bloqueia unidades ainda pendentes de entrega/cancelamento. Expiração e desativação continuam fechando acesso do cliente sem cancelar/apagar pedidos; equipe autorizada pode finalizar pedidos de sessão encerrada enquanto restaurante ativo. Pedir a conta não fecha atendimento nem implica pagamento.

Cliente só consulta pedidos do mesmo token autor na sessão ativa. submitted_by_token_id nullable referencia token_id + session_id; restaurant_id/session_id vinculam o pedido à sessão real. O banco atual não limpa session_tokens; não introduzir limpeza deles agora. Futura remoção deve desvincular apenas a coluna nullable, preservando restaurante/sessão e histórico. Usuário removido não remove autoria histórica: registrar actor_user_id nullable, role/category no evento e rótulo histórico limitado; manter sem credenciais e com acesso administrativo restrito.

## 3. Camadas e arquivos

Manter os padrões de interfaces e injeção do projeto, sem reescrever módulos existentes. Nomes propostos:

```text
src/modules/menu/
  menu.interfaces.ts                 # interfaces de services e DTOs
  menu.schemas.ts                    # entradas, limites, configuração e snapshot
  menu.repository.interface.ts
  menu.repository.ts                 # rascunho e identidades operacionais
  menu-publications.repository.interface.ts
  menu-publications.repository.ts
  menu-draft.service.ts
  menu-publication.service.ts
  menu-query.service.ts
  published-offer.ts                  # valida/calcula seleção na oferta publicada
  menu.controller.ts
  public-menu.controller.ts
  menu.routes.ts
src/modules/orders/
  orders.interfaces.ts
  orders.schemas.ts
  orders.repository.interface.ts
  orders.repository.ts
  order-settings.repository.interface.ts
  order-settings.repository.ts
  orders-submission.service.ts
  orders-query.service.ts
  orders-workflow.service.ts
  order-settings.service.ts
  order-pricing.ts                    # funções puras de preço
  order-progress.ts                  # funções puras de contadores e resumo
  orders.controller.ts
  public-orders.controller.ts
  order-settings.controller.ts
  orders.routes.ts
src/modules/media/
  media.interfaces.ts
  media.schemas.ts
  media.repository.interface.ts
  media.repository.ts
  media.service.ts
  media.controller.ts
  media.routes.ts
src/shared/authorization/
  capabilities.ts
src/shared/transactions/
  restaurant-unit-of-work.ts
  restaurant-unit-of-work.interface.ts
src/shared/storage/
  storage.interface.ts
  local-storage.ts
src/shared/jobs/
  media-cleanup.job.ts
```

Registrar implementações no container existente; montar routers do módulo em SetupRoutes, preservando rotas atuais. Controllers não acessam Prisma, storage ou outros controllers; services não importam Express. Schemas validam formato; services validam autorização contextual, relações e regras. Repositories usam DTOs de persistência restritos, sem expor Prisma.UpdateInput genérico ao controller.

### Contratos centrais (conceituais, sem implementação)

- ActorContext = { userId, restaurantId, role, category }; TableContext = { restaurantId, sessionId, tokenId }. Derivados pelo backend; nunca aceitar do corpo.
- IRestaurantUnitOfWork.run(restaurantId, work): Promise<T>. Callback recebe repositories vinculados ao mesmo TransactionClient. Criação dos repositories fica na implementação da unidade de trabalho, não espalhada nos services. Não criar transações aninhadas.
- IMenuDraftService: getDraft, updateIdentity, create/update/archive/restoreCategory, create/update/archive/restoreProduct, variantes/grupos/opções equivalentes, replaceVariantGroups, replaceProductImages, reorder.
- IMenuPublicationService: preview, publish(expectedDraftVersion), unpublish(expectedPublicationId).
- IMenuQueryService: getBySlug, getByTableCode. Retorna DTO público e disponibilidade; nenhuma chamada a scan.
- IPublishedOfferReader.loadCurrent(txContext): oferta validada da revisão vigente. Compartilhado com submission por interface, sem dependência em controller ou menu service de mutação. Seleção usa exclusivamente essa oferta, mais disponibilidade operacional.
- IOrderSubmissionService.submit(tableContext, input): { order, replayed }. Monta snapshot histórico e registra evento inicial.
- IOrdersQueryService: listForStaff, getForStaff, listForDevice, getForDevice, listEventsForStaff.
- IOrdersWorkflowService.apply(actor, orderId, expectedVersion, operations): resultado do pedido após lote atômico.
- IOrderSettingsService: get, updateEnabled(actor, expectedVersion, enabled).
- IMediaService: upload(actor, stream), getPrivate(actor, id), getPublic(id, variant), removeUnused(actor, id).
- IStorageProvider: put(key, stream, contentType), open(key), delete(key), exists(key). Identificadores gerados pelo servidor, sem caminhos enviados pelo usuário. Nada de URL permanente de fornecedor no domínio.

Repositories devem fornecer leitura por tenant, busca da revisão, snapshot do rascunho, leitura de disponibilidade, CAS de versão, inserção atômica do pedido e eventos, buscas idempotentes e consultas de fila. IOrdersRepository.hasPendingForSession é consumido pelo fechamento da sessão via contexto transacional, sem SessionsService depender de OrdersService e vice-versa.

### Dependências

OrdersSubmission → UnitOfWork + PublishedOfferReader + pricing + notifier.
MenuPublication → UnitOfWork + validador de snapshot + referências de mídia.
OrdersWorkflow → UnitOfWork + progress + notifier.
Sessions.close → UnitOfWork + repositories de sessões/tokens/chamados/pedidos.
Media → repository + storage + processador de imagem.
Futuro PDV → casos de uso de pedidos; não acessar tabelas como contrato externo.

## 4. Transações e concorrência

Escolha inicial: mutex transacional por restaurante usando a linha já existente em restaurants, SELECT ... FOR UPDATE. O projeto já utiliza RestaurantRepository.lock para alterações da equipe. Reutilizar a estratégia para as mutações relevantes, com escopo pequeno e SQL parametrizado.

Dentro da unidade de trabalho: lock do restaurante primeiro; confirmar ativo; revalidar autor/capacidade para ações administrativas; operar em tabelas subordinadas; commit. Ordenação adicional quando houver múltiplas entidades: mesa → sessão → menu/configuração → produtos por ID → pedido por ID. Não adquirir restaurante depois de segurar lock subordinado em outro fluxo que também tente adquiri-lo.

Incluídos: edição/publicação/retirada, configuração, disponibilidade, envio, andamento, cancelamento, scan/criação de atendimento e encerramento/expiração/desativação. Adaptar os caminhos existentes de mesas/sessões/admin que precisam coordenar com envio; não basta colocar a trava apenas no módulo novo. Os chamados mantêm sua proteção existente de sessão; não adicionar aquisição tardia do lock do restaurante em CallsService.

Restaurant lock serializa escritas desse restaurante. É simples e verificável para esta versão, mas tem custo de throughput: transações curtas, sem upload, processamento de imagem, Socket.IO, e-mail ou chamadas de rede. Não segurar lock durante leitura de upload. Medir espera e duração; reduzir granularidade somente com evidência de gargalo e novos testes de corrida.

Após adquirir lock, usar hora atual do banco para validade e reconsultar estado/token. Caso request já tenha sido enviado, buscar por submission_key e validar mesmo token/contexto e hash antes de aplicar configuração/revisão atuais. Idempotência tem retenção igual ao pedido, sem expiração independente neste ciclo.

Request hash: estrutura validada canonicalizada, sem totais do cliente; ordenar seleções, normalizar quebras de linha/trim das observações; preservar a ordem das linhas. submission_key não entra no hash. Token autor e sessão são comparados separadamente. Chave repetida com outro autor/payload retorna conflito, sem dados do pedido original.

Publicação consistente: trava do restaurante + draft_version esperada + leitura do rascunho + validação + gravação do snapshot/referências + troca do ponteiro numa única transação. Limitar tamanho do snapshot para não produzir transações longas. Revisões e seus vínculos de mídia não são alterados após commit, com proteção SQL para conteúdo editorial.

Envio concorrente com desativação/fechamento: quem confirma primeiro sob o lock determina a ordem. Se envio confirmou primeiro, desativação não apaga pedido; fechamento manual vê pendências e falha. Se bloqueio confirmou primeiro, envio novo é rejeitado. Sem correção silenciosa de preço nem retorno de 500 para conflito esperado.

Retries automáticos: até 2 novas tentativas para deadlock/conflito transacional recuperável com pequeno jitter e mesmo contexto. Não repetir falhas de domínio ou chamadas de storage. Esgotamento retorna 503 RETRYABLE_TRANSACTION_FAILURE e instrução para repetir com mesma chave/versão. Andamento com versão antiga retorna 409, sem mover unidades outra vez.

## 5. Contratos HTTP

Base /api/v1. JSON snake_case, UUIDs, datas ISO UTC, dinheiro em centavos, DTOs explícitos. Sucessos usam DTO do recurso; listas { items, next_cursor, server_time }; erros preservam { error, code, message, details? }. Sem mudança global das respostas atuais.

Mutação editorial: expected_draft_version no corpo; retorna draft_version atualizada. Operação: expected_version no corpo. PATCH aceita apenas campos declarados, rejeita campos desconhecidos, exige ao menos uma mudança; null só para campos anuláveis. GET sem efeitos de escrita.

### Cardápio administrativo (OWNER/MANAGER)

| Método/caminho | Contrato |
|---|---|
| GET /menu/draft | Rascunho completo, draft_version e published_revision_id; Cache-Control no-store. |
| GET /menu/preview | DTO de prévia identificado como draft; acesso autenticado, no-store. |
| PATCH /menu/draft | Nome de exibição, descrição e apresentação/logo/capa; expected_draft_version. |
| POST /menu/categories | name, description?, position? + versão; 201. |
| PATCH /menu/categories/:id | name, description, visible, archived; versão; 200. |
| POST /menu/products | category_id, name, description?, initial_variant { name, price_cents }; versão; 201. |
| PATCH /menu/products/:id | category_id, name, description, visible, archived; versão. |
| POST /menu/products/:productId/variants | name, price_cents; versão; 201. |
| PATCH /menu/variants/:id | name, price_cents, visible, archived; versão. |
| POST /menu/products/:productId/option-groups | name, min_selections, max_selections; versão; 201. |
| PATCH /menu/option-groups/:id | name, min_selections, max_selections, archived; versão. |
| POST /menu/option-groups/:groupId/options | name, price_delta_cents, max_quantity; versão; 201. |
| PATCH /menu/options/:id | name, price_delta_cents, max_quantity, visible, archived; versão. |
| PUT /menu/variants/:id/option-groups | group_ids (conjunto completo, sem duplicatas) + versão. |
| PUT /menu/products/:id/images | items [{ media_id, alt_text }] em ordem + versão. |
| PUT /menu/order | collection (categories/products/variants/groups/options), parent_id quando aplicável, ordered_ids + versão. Lista completa dos irmãos ativos, sem IDs ausentes/repetidos/de outro pai. |
| POST /menu/publications | expected_draft_version; 201, revision_id e número. |
| POST /menu/unpublish | expected_publication_id; 200, published_revision_id null. Repetição com ID antigo retorna conflito. |

Não haverá DELETE de categorias/produtos/opções neste ciclo: archived boolean no PATCH permite arquivar/restaurar. Novo produto cria variante inicial na mesma transação; novas entidades ficam ao fim da ordem por padrão. Mesmo publicar sem mudança de rascunho não cria revisões duplicadas: comparar published draft_version; devolver publicação atual com 200/replayed true. Primeira ou nova revisão responde 201.

Apresentação v1: palette { primary, background, surface, text } como hex RGB (#RRGGBB); typography = sans/serif/mono; layout = list/grid; border_radius = none/small/medium/large. Defaults: palette do sistema, sans, list e medium; cores padrão devem reutilizar os tokens existentes do frontend quando o checkout for confirmado. Não aceitar HTML, JS, CSS arbitrário ou URLs de logo/capa sem media_id do tenant. Esses tokens são contrato de configuração, sem definir telas/design agora; expansão requer nova versão de schema.

### Operação

| Método/caminho | Contrato |
|---|---|
| GET /ordering-settings | OWNER/MANAGER; enabled, version. |
| PATCH /ordering-settings | OWNER/MANAGER; customer_ordering_enabled + expected_version. |
| PATCH /menu/availability | Capacidade availability:write; kind (product/variant/option), id, is_available, expected_version. Uma entidade por request. |
| GET /orders | orders:read; filtros session_id, from/to, progress (open/ready/completed/cancelled), cursor e limit. ready inclui pedidos mistos com unidades prontas. Sem filtro: open. |
| GET /orders/:id | orders:read; DTO administrativo com itens, valores e resumo. |
| GET /orders/:id/events | orders:read; histórico paginado. |
| POST /orders/:id/transitions | expected_version, operations [{ item_id, from_stage, to_stage, quantity, reason? }]; 200 com pedido atualizado. Capacidade por ação; OWNER/MANAGER/WAITER/KITCHEN podem entregar/cancelar unidades elegíveis. |

Transição de lote: até 50 operações; rejeitar item repetido no mesmo lote para evitar aplicação ambígua. Autorização e quantidades são validadas antes de persistir. event.resulting_order_version pode repetir em diferentes eventos do mesmo lote; ordenar eventos por sequence por pedido, com unicidade (order_id, sequence).

### Cliente/público

| Método/caminho | Contrato |
|---|---|
| GET /public/restaurants/:slug/menu | Cardápio publicado e configuração de pedidos, sem token de mesa. |
| GET /public/tables/:code/menu | Mesmo catálogo + identificação pública da mesa; não cria sessão/token. |
| POST /public/orders | X-Table-Token; submission_key, publication_id, items [{ product_id, variant_id, quantity, selections [{ option_id, quantity }], notes? }]; 201 novo, 200 repetido com replayed. |
| GET /public/orders | X-Table-Token; somente pedidos do token/sessão atual; lista paginada. |
| GET /public/orders/:id | X-Table-Token; próprio pedido, sem autores internos/histórico administrativo. |

Cliente adquire contexto pelo scan atual quando decide interagir com atendimento/pedido. Não mudar a semântica do scan para corrigir consulta: a consulta nova não chama scan. Frontend futuro deverá evitar scan automático só para exibir catálogo. Adicionar GET /public/table-context com X-Table-Token para verificar session_id opaco, expires_at, mesa e capability can_order/reason, sem emitir token nem abrir sessão. Sessão ID exposto não concede autorização.

Consulta pública com Cache-Control no-store no primeiro ciclo, pois configuração e disponibilidade são imediatas. Sem CDN de JSON até existir política explícita de invalidação. Leitura de mídia tem política própria. Cliente atualiza capacidade ao voltar à aba e antes de envio; backend sempre confere de novo.

### Limites iniciais definidos nesta proposta

- Nome de categoria/produto/variante/grupo/opção: 1–120 caracteres; descrição até 3000; nome de exibição 120; observação de linha 500; alt_text 250.
- Até 50 linhas por pedido; 1–20 unidades por linha; até 20 grupos por produto, 50 opções por grupo; seleção máxima por grupo 50 unidades. Sem opções duplicadas no payload; opcionais não selecionados são omitidos.
- Até 100 categorias e 1000 produtos ativos por restaurante; até 20 variantes por produto e 8 imagens por produto. Conteúdo do snapshot até 2 MiB serializado em UTF-8. Rejeição antes do commit da publicação, com erro identificável.
- Preço base e acréscimo: 0–1.000.000 centavos (R$ 10 mil). Preço unitário final até 10.000.000 centavos; pedido até 100.000.000 centavos (R$ 1 milhão). Verificar cada soma/multiplicação; valores no PostgreSQL INTEGER com CHECKs e aritmética intermediária segura. Sem preços negativos, taxa, gorjeta, descontos ou arredondamento percentual neste ciclo.
- JSON dos routers novos até 256 KiB. Upload não usa JSON/base64. Multipart com limite próprio descrito abaixo. Preservar limites das rotas antigas.
- Paginação por cursor (created_at,id), default 50, máximo 100. Eventos por sequence. Operação exige ao menos 1 linha/operação.
- Rate limits iniciais: envio 20 tentativas/5 min por token, leitura de pedidos/contexto 120/min por token; mídia upload 30/10 min por usuário; publicação 10/min por usuário. Consulta pública de menu 600/min por IP; evitar teto baixo que bloqueie todo restaurante sob NAT. Testar 429/Retry-After; tudo configurável por ambiente com defaults documentados.

Erros adicionais: 409 MENU_NOT_ORDERABLE para oferta sem publicação no envio, 409 INVALID_CATALOG_CONFIGURATION para publicar catálogo inconsistente, 409 MENU_PUBLICATION_CONFLICT para retirar revisão antiga, 413 CATALOG_TOO_LARGE/UPLOAD_TOO_LARGE, 415 UNSUPPORTED_MEDIA_TYPE, 503 STORAGE_UNAVAILABLE/RETRYABLE_TRANSACTION_FAILURE. Manter códigos da etapa 3, usar details de validação para apontar campos e não vazar IDs externos ao tenant.

## 6. Tempo real e recuperação

Criar sala restaurant:{id}:orders, só para orders:read. Sala geral existente continua com eventos antigos de chamados/sessões; não transmitir conteúdo de pedidos nela. Acrescentar INotifier.toOrders(restaurantId,event,payload).

Eventos order:created e order:updated carregam apenas order_id e version; tela busca DTO autorizado e invalida lista. Não confiar no evento para autorizar ações nem enviar observações de clientes para funcionários sem permissão. Mudança de categoria desconecta e força novo handshake com capacidades recalculadas.

Sem promessa de entrega garantida de evento neste ciclo. Painel faz carga inicial, recarrega na reconexão/foco e faz reconciliação a cada 15 s enquanto visível, com backoff em falha. Polling futuro do cliente para próprio pedido: 10 s enquanto visível e pendente; parar após conclusão/401. Não criar sala pública baseada só em ID de mesa.

As rotas novas dependem de autorização HTTP mesmo com Socket.IO conectado. HTTP e socket devem concordar sobre categorias permitidas; testar downgrade MANAGER → OTHER sem aguardar TTL.

## 7. Mídia — escolha inicial proposta

Escolha aprovada para começar: LocalStorageProvider em disco persistente, com MEDIA_ROOT configurado e volume Docker dedicado, fora da árvore pública do frontend e fora da pasta efêmera do container. S3/bucket não é necessário para iniciar nem obrigatório no deploy. Banco guarda metadados, não blobs/base64. Produção com esse provider exige uma instância, disco persistente no host contratado e backup consistente de banco e arquivos. Não usar disco efêmero de hospedagem sem serviço de persistência; se a plataforma não oferecer armazenamento persistente, usar bucket/serviço externo ou mudar a hospedagem.

O caminho real no host depende de onde a aplicação será hospedada; não existe esse provisionamento ainda. Usar Docker volume nomeado `media_data`, montado em `/data/media`, MEDIA_ROOT=/data/media no serviço api. O volume sobrevive à recriação do container; `docker compose down -v` o apaga, assim como o banco: atualizar documentação. Não executar esse comando como parte da implementação.

Interface permite futuro S3StorageProvider sem alterar regras. Migração de provider exigirá copiar/verificar objetos e trocar backend de referência, sem presumir que apenas mudar env transfere arquivos.

Decisão explícita do usuário: **bucket Amazon S3 será uma feature futura**. Implementar somente LocalStorageProvider nesta versão. O incremento futuro inclui S3StorageProvider, configuração de bucket/permissões, extensão do provider no banco e transferência verificada das imagens existentes; não adicionar SDK AWS ou credenciais como requisito do deploy inicial.

Se for usado Amazon S3, bucket guarda os objetos; não recebe uma API própria nem código executável da aplicação. S3 já oferece API de acesso; o adaptador no backend usa o SDK da AWS com permissões configuradas. As validações e o processamento continuam na API do projeto. Referência oficial consultada: [acesso ao bucket S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-bucket-intro.html). Não é necessário Lambda para o fluxo planejado, nem tornar bucket inteiro público: a API pode ler objetos privados e servi-los sob as regras públicas/privadas já definidas.

### Upload e processamento

POST /media multipart, campo file único, OWNER/MANAGER; 201 retorna media_id, status READY e URLs autenticadas para prévia. Recomendação de dependências novas: parser multipart com streaming e biblioteca de processamento como sharp; versões e APIs serão verificadas na documentação oficial quando a implementação começar.

Aceitar JPEG/PNG/WebP estáticos, até 8 MiB e 25 milhões de pixels, lado máximo 10.000 px, dimensões positivas. Rejeitar SVG, GIF/animados, executáveis, URLs remotas e MIME falso. Decodificar de verdade, aplicar orientação, remover metadados, reencodar WebP sem ampliar resolução, qualidade 82. Derivados: main até 1600 px no lado maior e thumb até 480 px; manter proporção. Não guardar original por padrão.

Gerar storage_key opaca por tenant/UUID/variante, extensão do servidor. Validar limites antes de decodificar, limitar concorrência de processamento a 2 por instância; saturação responde 503 MEDIA_PROCESSING_BUSY com Retry-After. Arquivo temporário fora de acesso público, com limites de bytes e limpeza no finally. Registrar PENDING antes de gravar; escrever de modo atômico; marcar READY após verificar derivados. Falha não deixa READY sem arquivo completo.

### Acesso e exclusão

- GET /media/:id/:variant (main/thumb): autenticado OWNER/MANAGER do tenant, no-store; serve prévia e rascunho.
- GET /public/media/:id/:variant: serve apenas mídia presente na publicação atualmente apontada por restaurante ativo. Logo/capa/imagens do catálogo público usam essa rota. Validar referências reais; ID opaco não substitui autorização.
- URLs públicas usam ID imutável; headers Content-Type image/webp, nosniff e Cache-Control public,max-age=300. Uma imagem já baixada/cacheada não pode ser recolhida imediatamente ao retirar publicação; documentar janela de 5 min. Se precisar revogação imediata também para mídia, mudar para no-store antes de implementar.
- DELETE /media/:id: OWNER/MANAGER, somente se sem referências em rascunho, imagens e revisões retidas. Referenciada retorna 409 MEDIA_IN_USE. Não apagar imagem usada em outra revisão.
- Limpeza horária: temporários/PENDING/FAILED com mais de 24 h; READY sem referências com mais de 7 dias. Antes de remover READY, mudar estado para DELETING em transação com lock do restaurante; associação só aceita READY, evitando corrida com publicação/edição. Remover storage fora da transação e finalizar metadata; falha fica marcada para retry. Publicações antigas são retidas neste ciclo, então suas imagens também.
- Limite inicial por restaurante: 2000 imagens READY, derivados somados até 2 GiB; validar reserva/quota e liberar reserva no fim/falha, sem depender só de contagem prévia fora de lock. Metadados precisam de stored_bytes + reserved_bytes/processing state apropriados para a reserva. Esses limites são operacionais e configuráveis, sem inventar planos comerciais.

## 8. Ajustes necessários no modelo da etapa 2

Não são mudanças já aplicadas: devem entrar no schema final após aprovação.

- orders: submitted_by_token_id nullable e snapshot do rótulo da mesa; FK que garanta token da sessão real, sem exigir que token carregue restaurant_id inexistente. Conservar pedido após eventual remoção do token.
- order_events: sequence monotônica por pedido, UNIQUE(order_id,sequence), autoria histórica limitada; order.version cresce uma vez por lote.
- presentation_schema_version e document schema_version são separados: um valida apresentação, outro valida estrutura inteira da publicação.
- Identidades de produto/variante/opção carregam is_available e availability_version separados de draft_version. Escrita de disponibilidade não marca rascunho editorial como alterado.
- menu_products: published snapshots preservam categoria original; mover produto de categoria no rascunho não altera oferta antiga. Variante/opção não muda de produto/grupo pai depois de publicada. Relações de domínio do pedido validam revisão e tenant.
- media_assets: estado e tamanhos dos derivados, reserva de espaço, erro sanitizado de processamento. Usar tabelas/colunas de derivados conforme proposta Prisma do incremento 1, sem URLs de fornecedor no domínio.
- Auditoria para configuração/disponibilidade/publicação precisa persistir autoria e horário. Pequena tabela operacional append-only com action/entity_id/old/new apenas dos campos operacionais, actor e data, sem copiar imagens ou credenciais.
- archived_at afeta rascunho; identidade é mantida. Publicações/imagens referenciadas não são apagadas em cascata. SET NULL de autores não pode anular tenant_id em FKs compostas; desenhar SQL específico para coluna anulável ou separar a associação.

## 9. Sequência de código proposta

Cada incremento será revisável, com diff e validação própria. Aprovar planejamento não implica fazer push, implantar ou executar migration contra banco real. Usar banco de testes e preservar alterações da home.

| Incremento | Entrega e arquivos principais | Critério de aceite |
|---|---|---|
| 0. Preparar base | Confirmar checkout/branch, ler AGENTS, registrar plano em docs do repo com autorização, levantar env/dependências, executar baseline do backend | Diff inicial conhecido; regressões prévias identificadas; nenhuma alteração de home sobrescrita. |
| 1. Schema e migrations | schema.prisma, migration SQL, gerador Prisma, factories, contratos de snapshot e apresentação, backfill, criação transacional de menu/settings nos dois caminhos de cadastro (auth e admin) | Banco vazio e existente migram; constraints entre tenants/preços/contadores verificadas; clientes existentes começam sem publicação e com pedidos desabilitados. Revisão do schema concreto antes de executar fora do banco de teste. |
| 2. Autorização e transações | category em auth/cache/types; capacidades; UnitOfWork; coordenação de sessões/mesas/admin; revogação HTTP/socket | MANAGER tem acessos confirmados; downgrade corta novos acessos e conexão; não há dependência circular ou transação aninhada. |
| 3. Catálogo de rascunho | repositories/services/controllers/routes/schemas de categorias/produtos/variantes/grupos/opções, reordenação e identidade | CRUD/arquivo/restauração isolados por tenant, relações corretas, conflitos de versão previsíveis; frontend desnecessário para testar. |
| 4. Mídia | LocalStorageProvider, multipart/processamento, metadata, private routes, limites, volume e cleanup | Upload inválido recusado; upload bom persiste após recriar container de teste; isolamento e concorrência de quota/limpeza cobertos. |
| 5. Publicação e consulta | snapshot, mídia referenciada, prévia, publicação/retirada, consulta pública, disponibilidade/settings | Rascunho privado; publicação atômica; preços publicados não mudam com rascunho; links de mídia obedecem publicação; consulta não abre atendimento. |
| 6. Envio de pedidos | serviço de submissão, preço, snapshot de itens/opções, idempotência e leitura do cliente | Preço calculado no servidor; chaves simultâneas criam uma venda; versão/desabilitação/expiração/esgotamento corretamente validados; privacidade por token. |
| 7. Operação dos pedidos | fila HTTP, transições/lotes/eventos, preparo/entrega parcial, cancelamento, bloqueio de fechamento manual | Quantidades não negativas nem duplicadas; histórico coerente; regras de permissão; nenhuma perda ao fechar/expirar atendimento. |
| 8. Tempo real | sala orders, capacidades no handshake, notifier, testes de reconexão/queda | Funcionários sem acesso não recebem evento; falha de emissão não perde venda; REST recupera fila. |
| 9. Fechamento do backend | OpenAPI completa, README/ENV, exemplos de fluxo, regressão, perfis de consulta, instruções de backup/restauração | Typecheck/lint/testes passam; cenários ponta a ponta via API documentados; critérios de frontend e limitações comunicados. |

Frontend posterior, quando autorizado: editor/preview; leitura pública/carrinho; painel integrado com chamados e pedidos; ações de andamento; polling/reconexão. Não marcar funcionalidade inteira como entregue ao usuário final quando só o backend estiver pronto.

## 10. Testes obrigatórios e operação

Unitários: preço, seleção de opções, canonicalização/idempotência, contadores/resumo, capacidades e snapshot. Integração com PostgreSQL real para FKs/CHECKs/transações. HTTP Supertest para DTOs, erros, papéis e isolamento. Storage em diretório temporário com cleanup, processamento real em fixtures mínimas.

Corridas essenciais: envio × envio da mesma chave; envio × fechamento manual; envio × expiração/desativação; envio × publicar/despublicar/desabilitar/esgotar; dois garçons avançando mesmas unidades; edição × publicação; upload/limpeza × associação/publicação; troca de categoria × request/socket. Não confiar em teste que só replica o algoritmo: disparar concorrência real e conferir invariantes no banco.

Fluxo API completo: criar restaurante → categorias/produto/variante/adicional → upload → publicar → ativar pedidos → contexto de mesa → enviar → consultar pelo cliente/equipe → preparar parcialmente → entregar → fechar sessão. Repetir com erros e consulta sem abrir sessão.

Verificações do backend: npm run typecheck, npm run lint, npm test com PostgreSQL de testes. Não rodar testes destrutivos contra DATABASE_URL de desenvolvimento/produção. Se alguma ferramenta não estiver disponível, informar a limitação e não afirmar que passou. Migração futura em produção deve ter backup prévio e plano de restore conjunto banco+mídia; não reverter removendo tabelas com vendas reais.

Logs estruturados: request_id, restaurant_id, operation, order_id quando existir, tempo da transação/espera, resultado e código de erro. Não registrar token, cookie, imagem bruta ou observação de cliente por padrão. Métricas: falhas de envio, conflitos, latência/espera, armazenamento e falhas de processamento. Sem meta numérica de throughput prometida antes de teste em infraestrutura conhecida.

## 11. Fechamento aprovado

Confirmados anteriormente: um cardápio/categorias livres, rascunho/publicação, opções e variantes, envio em mesa ativa, acompanhamento/atualização pelos garçons, chave de habilitação, PDV depois, metadados em PostgreSQL e arquivos fora do banco, gerente edita/publica e controla pedidos.

Escolhas aprovadas pelo usuário, incorporando sua correção de permissões:

1. Matriz operacional completa: disponibilidade, preparo, entrega e cancelamento para OWNER/MANAGER/WAITER/KITCHEN; motivo obrigatório no cancelamento; atalhos de andamento; cliente consulta somente próprio token; fechamento manual bloqueado com pendências.
2. Storage local persistente para começar; rotas de imagem condicionadas à publicação; janela de cache de 5 min; limites e retenção descritos. Não contratar/provisionar bucket agora.
3. Mutex curto por restaurante e contratos/limites de API descritos, com nova sala autorizada de pedidos.
4. Começar pelo backend, em incrementos 0–9; frontend fica posterior e não será declarado pronto antes de ser integrado.

Antes de código: verificar o checkout de destino e seu estado, pois esta pasta contém apenas planejamento e o código consultado está no Desktop. Referência de aplicação do plano: repositório existente, branch dev, preservando a home; se o checkout tiver mudado, atualizar a base sem sobrescrever alterações.

Próxima entrega: schema concreto e diff do primeiro incremento para revisão. Não iniciar todas as fases de uma vez. Host final, provisionamento de infraestrutura, contrato de serviço externo e execução de migration em banco real ainda dependem da configuração de implantação, não estão implicitamente resolvidos por aprovar a arquitetura.
