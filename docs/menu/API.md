# API de cardápio, mídia e pedidos

Base `/api/v1`. Swagger em `/docs` fora de produção; schemas de entrada vêm dos mesmos schemas Zod utilizados pelos services. As tabelas deste arquivo descrevem o contrato implementado, prevalecendo sobre nomes exemplificativos do planejamento.

## Autorização e concorrência

Administrativo: cookie httpOnly de login. OWNER e STAFF MANAGER editam/publicam/configuram; OWNER, MANAGER, WAITER e KITCHEN consultam pedidos, atualizam preparo/entrega/cancelamento e disponibilidade. Demais STAFF e SUPER_ADMIN não recebem essas capacidades implicitamente. Todas as operações administrativas são restritas ao restaurante autenticado.

Cliente: `X-Table-Token` obtido pelo scan existente, válido somente para o próprio atendimento/aparelho. Não precisa de conta. Só consultar o cardápio público não emite token nem abre sessão. Consumidor deve chamar scan quando iniciar interação que exige atendimento; a página de mesa antiga ainda pode executar seu scan habitual, até integração do novo frontend.

Toda mutação do rascunho exige `expected_draft_version`. Resposta de criação/edição é o rascunho completo com a nova `draft_version`. Escritas operacionais usam `expected_version`. Campos desconhecidos são rejeitados nas rotas novas. `null` só é aceito nos campos explicitamente anuláveis.

Mutações relevantes compartilham trava transacional curta por restaurante; upload/processamento e notificações ficam fora da transação. Repositories ficam vinculados à mesma transação pelo contexto fornecido pela unidade de trabalho, seguindo o padrão já utilizado nos services existentes. Papel/categoria e restaurante são revalidados no banco para escritas administrativas.

## Rascunho

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

## Publicação e consulta pública

- POST `/menu/publications`: `{ "expected_draft_version": 4 }`. Retorna `{ publication_id, revision_number, replayed }`, 201 para nova revisão e 200 se já publicada. Retirar e publicar novamente o mesmo rascunho restaura a revisão imutável existente explicitamente, sem duplicar a revisão.
- POST `/menu/unpublish`: `{ "expected_publication_id": "UUID" }`. Retorna `{ published_revision_id: null }`. Não cancela pedidos nem apaga revisões/imagens referenciadas.
- GET `/public/restaurants/:slug/menu` ou `/public/tables/:code/menu`: `{ publication_id, content, availability, customer_ordering_enabled, media_paths }`. Cache-Control: no-store.
- content tem schema_version, identidade, apresentação e categorias/produtos/variantes/grupos/opções/imagens. Dados de autoria e rascunho ficam fora dessa resposta. availability é um mapa dos IDs publicados para booleanos operacionais; media_paths contém caminhos relativos à origem da API.

Cliente deve considerar variante, produto e escolhas obrigatórias disponíveis, não apenas o mapa de produto. Servidor valida a combinação completa no envio. Consulta por slug permite navegação sem mesa; não concede envio sem token/atendimento.

## Configuração e disponibilidade

- GET `/ordering-settings`: `{ customer_ordering_enabled, version }`, OWNER/MANAGER.
- PATCH `/ordering-settings`: `{ expected_version, customer_ordering_enabled }`. Efeito imediato, sem publicar rascunho. Pedidos existentes continuam em operação.
- PATCH `/menu/availability`: `{ kind, id, is_available, expected_version }`, kind = **products/variants/options**. Retorna `{ id, is_available, availability_version }`. Não altera draft_version nem preços publicados. Registra auditoria.

GET `/public/table-context` com token: `{ session_id, expires_at, table: { label }, can_order, reason }`. Não abre sessão nem renova token. reason é CUSTOMER_ORDERING_DISABLED, MENU_NOT_PUBLISHED ou null; token inválido/expirado responde 401.

## Enviar pedido

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

## Consultar e operar

| Método/caminho | Função |
|---|---|
| GET `/public/orders` | Próprios pedidos do mesmo token; limit/cursor |
| GET `/public/orders/:id` | Próprio pedido com atendimento ativo; outro token, mesmo na mesa, recebe 404 |
| GET `/orders` | Fila do restaurante; session_id, from/to ISO, progress, limit/cursor |
| GET `/orders/:id` | Pedido administrativo |
| GET `/orders/:id/events` | Histórico; after_sequence (padrão 0), limit |
| POST `/orders/:id/transitions` | Atualiza quantidades por etapa e registra eventos |

Listas: `{ items, next_cursor, server_time }`, default limit 50, máximo 100. Cursor é opaco. progress = open (padrão administrativo), ready, completed ou cancelled. ready inclui pedidos que também têm itens em preparo. Filtros de estado não são aplicados à lista do cliente, que consulta os próprios pedidos da sessão.

Order DTO: id, table_label, source, fulfillment_type, currency, total_cents original, cancelled_cents, active_total_cents, version, created_at, updated_at, progress e items. Administrativo também contém session_id. Não expõe request_hash, token autor ou submission_key. progress contém quantidades pending/preparing/ready/delivered/cancelled e flags is_completed/is_cancelled. Cada item contém identificação/nome históricos, quantity, preços, observação, contadores por etapa e escolhas históricas.

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

Ao receber conflito de versão, recarregar o pedido antes de decidir repetir a ação; nunca reaplicar automaticamente a mesma quantidade em uma versão nova. Cozinha e garçom podem entregar/cancelar. Auditoria identifica a conta autenticada/categoria, sem afirmar quem realizou a entrega física quando a conta é compartilhada.

Fechamento manual da sessão com unidades pendentes retorna SESSION_HAS_PENDING_ORDERS. Expiração/desativação encerra o acesso do cliente, preserva pedidos e permite conclusão posterior pela equipe autorizada quando restaurante estiver ativo. Conta/financeiro ainda não é controlado pelo módulo.

## Mídia

- POST `/media`, multipart com apenas campo file: JPEG/PNG/WebP estático, até 8 MiB, 25 milhões de pixels, lado até 10 mil px. OWNER/MANAGER. Processa orientação, remove metadados e gera WebP main até 1600 px e thumb até 480 px, sem ampliar a imagem. Leitura multipart é limitada em memória e há dois slots por processo incluindo recepção/processamento; não há buffer sem limite.
- Resposta 201: `{ id, status: "READY", width, height, byte_size, main_path, thumb_path }`. width/height descrevem a imagem fonte; as dimensões finais ficam nos derivados e no arquivo WebP. byte_size soma os dois derivados. Não expõe storage_key.
- GET `/media/:id/main|thumb`: privado, OWNER/MANAGER do restaurante, no-store.
- GET `/public/media/:id/main|thumb`: só se referenciada pela publicação atual de restaurante ativo; cache até 5 minutos. Arquivo já baixado/cacheado não pode ser recolhido instantaneamente ao retirar publicação.
- DELETE `/media/:id`: 204 se sem referências; 409 MEDIA_IN_USE caso contrário. Revisões antigas continuam retidas e protegem suas imagens.
- Limpeza horária: pendentes/falhos com mais de 24 h, READY sem referência com mais de 7 dias e exclusões que precisam de retry. Estado DELETING impede novas associações; remoção de bytes acontece fora da transação. Reserva e quota são coordenadas por restaurante.

## Eventos e recuperação

As respostas também incluem X-Request-Id para diagnóstico. Logs estruturados e medição de espera/transação são descritos em [OPERACAO.md](OPERACAO.md).

Socket.IO usa os cookies existentes. `order:created` e `order:updated` enviam somente `{ order_id, version }` para a sala de funcionários com orders:read daquele restaurante. Não há sala pública de pedidos; outros STAFF não recebem esses eventos. Trocar categoria invalida o cache e desconecta o usuário.

Contrato para o frontend posterior: carregar via REST ao entrar, reconectar ou voltar à aba; reconciliar a cada 15 s enquanto painel estiver visível. Cliente consulta o próprio pedido a cada 10 s enquanto visível e pendente, interrompendo em conclusão/401. Eventos podem se perder; o banco/REST é a fonte de verdade. Uma falha de emissão não desfaz a venda.

## Limites e erros

50 linhas por pedido, 1–20 unidades por linha, seleção máxima de 50 unidades por grupo, até 20 grupos/produto, 50 opções/grupo, 20 variantes/produto e 8 imagens/produto. Rascunho: até 100 categorias e 1000 produtos ativos. Nome até 120 caracteres; descrição 3000; observação 500. Payload JSON das rotas novas até 256 KiB; publicação validada com margem de representação para o CHECK de 2 MiB no PostgreSQL.

Preços base/adicionais: 0–1.000.000 centavos; unitário final até 10.000.000; pedido até 100.000.000 centavos. Sem descontos, gorjeta, taxas, pagamentos ou estoque neste ciclo.

Erros seguem `{ error, code, message, details? }`. Principais códigos: VALIDATION_ERROR (400), UNAUTHORIZED (401), FORBIDDEN (403), NOT_FOUND/MENU_NOT_PUBLISHED (404), DRAFT_VERSION_CONFLICT, MENU_PUBLICATION_CONFLICT, MENU_REVISION_CHANGED, CUSTOMER_ORDERING_DISABLED, MENU_NOT_ORDERABLE, ITEM_UNAVAILABLE, IDEMPOTENCY_CONFLICT, ORDER_VERSION_CONFLICT, INVALID_ORDER_TRANSITION, SESSION_HAS_PENDING_ORDERS e MEDIA_IN_USE (409), UPLOAD_TOO_LARGE/CATALOG_TOO_LARGE (413), UNSUPPORTED_MEDIA_TYPE (415), TOO_MANY_REQUESTS (429), STORAGE_UNAVAILABLE/MEDIA_PROCESSING_BUSY/RETRYABLE_TRANSACTION_FAILURE (503).

Configuração por ambiente: MEDIA_ROOT (default .media no cwd), MEDIA_QUOTA_BYTES (2 GiB), MEDIA_MAX_ASSETS (2000); ORDER_SUBMIT_LIMIT (20/5 min/token), ORDER_READ_LIMIT (120/min/token), MENU_READ_LIMIT (600/min/IP), MENU_PUBLISH_LIMIT (10/min/usuário), MEDIA_UPLOAD_LIMIT (30/10 min/usuário). Limites e cache de autenticação em memória pressupõem uma instância da API.

Docker de desenvolvimento/produção monta media_data em /data/media; produção prepara a pasta para o usuário node. Backup exige PostgreSQL e volume de imagens. Recriar container mantém o volume; remover volumes com `down -v` apaga banco e mídia. Bucket Amazon S3 continua sendo feature futura; não há credenciais AWS nem SDK exigidos nesta versão.
