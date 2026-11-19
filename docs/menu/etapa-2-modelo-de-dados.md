# Etapa 2 — Proposta de modelo de dados

Status: escolhas conceituais aprovadas pelo usuário. Schema concreto e migration proposta disponíveis no [pacote de revisão](README.md); ainda não aplicados ao banco da aplicação. Armazenamento local persistente nesta versão; bucket Amazon S3 como feature futura. Não há necessidade de MongoDB.

## 1. Limites desta entrega

Construir cardápio e pedidos feitos pelo cliente na mesa. PDV, pagamentos, estoque, delivery e conectores externos serão implementados depois. O núcleo de pedidos separa origem, modalidade e contexto para não tornar mesa obrigatória para todas as origens futuras.

Princípios: um cardápio por restaurante; edição em rascunho; publicação explícita e atômica; consulta pública sem abrir atendimento; opções estruturadas; pedidos no painel desde o recebimento; garçons atualizam andamento; envio pelo cliente controlado pelo dono.

## 2. Estratégia de rascunho e publicação

Recomendação: tabelas relacionais para edição e uma revisão publicada imutável, armazenada como documento JSON validado e versionado. Evita duplicar todas as tabelas de produtos/opções a cada publicação neste primeiro ciclo.

O documento publicado contém categorias, itens, variantes, grupos, opções, preços, identidade e referências estáveis. O cliente e o serviço de pedidos usam esse documento publicado; nunca os preços do rascunho. JSON não significa conteúdo arbitrário: contrato tipado, schema_version e validação obrigatória na gravação e leitura.

Alternativa: todas as revisões em tabelas relacionais. Vantagem: constraints e consultas SQL detalhadas sobre cada revisão. Custo: mais tabelas e coordenação de cópias/relações versionadas. Reavaliar caso consultas históricas do catálogo por SQL se tornem requisito central; não duplicar os dois mecanismos agora.

Fluxo: editar rascunho → validar → criar revisão imutável → trocar ponteiro público na mesma transação. O rascunho permanece editável após publicação. Publicar novamente gera outra revisão. Retirar publicação limpa o ponteiro público, preservando histórico.

## 3. Tabelas de configuração e catálogo

UUIDs como IDs. Campos de criação/atualização e versão de concorrência nas entidades mutáveis. Todas as entidades pertencentes ao restaurante carregam restaurant_id para permitir isolamento e FKs compostas. Nomes abaixo são propostas.

| Tabela | Campos e função principais |
|---|---|
| restaurant_order_settings | restaurant_id (PK/FK), customer_ordering_enabled (default false), version, updated_by, updated_at. Configuração operacional, fora do rascunho. |
| menus | id, restaurant_id único, published_revision_id opcional, draft_version, display_name, description, logo_media_id, cover_media_id, presentation_schema_version, presentation_config JSON. Representa o cardápio único e o rascunho atual. |
| menu_categories | id, restaurant_id, menu_id, name, description, position, visible, archived_at. Categorias livres; sugestões não são enum nem restrição no banco. |
| menu_products | id, restaurant_id, menu_id, category_id, name, description, position, visible, archived_at, version. Cada produto tem uma categoria neste ciclo. |
| menu_product_variants | id, restaurant_id, product_id, name, price_cents, position, visible, archived_at. Todo produto tem ao menos uma variante, inclusive a variante padrão de produto sem tamanhos. |
| menu_option_groups | id, restaurant_id, product_id, name, min_selections, max_selections, position, archived_at. Grupo pertence ao produto; reutilização entre produtos não entra inicialmente. |
| menu_options | id, restaurant_id, group_id, name, price_delta_cents, max_quantity, position, visible, archived_at. Acréscimo por unidade selecionada; opções gratuitas têm zero. |
| menu_variant_option_groups | restaurant_id, variant_id, group_id. Define grupos aplicáveis a cada variante, com garantia de que ambos pertencem ao mesmo produto. |
| media_assets | id, restaurant_id, storage_key único, mime_type, byte_size, width, height, status, created_by, created_at. Metadados e ciclo de upload; bytes fora do PostgreSQL. Provedor será decidido na etapa 6. |
| menu_product_images | restaurant_id, product_id, media_id, position, alt_text. Uma ou mais imagens ordenadas. |
| menu_publications | id, restaurant_id, menu_id, revision_number, schema_version, content JSON, draft_version, published_by, published_at. Documento editorial imutável. |
| menu_publication_media | restaurant_id, publication_id, media_id. Referências relacionais de mídia usada na revisão, para impedir limpeza de imagens ainda referenciadas pelo JSON. |

Identidade estável: IDs de produto, variante e opção são preservados no documento publicado e em publicações seguintes. Não recriar IDs ao editar/publicar. Elementos publicados são arquivados no rascunho, sem excluir sua identidade física enquanto houver referências.

### Regras de escolhas e preço

- Preços em centavos inteiros, moeda BRL no primeiro ciclo. Aplicar limites máximos e inteiros seguros nas entradas e totais; sem float monetário.
- Variante determina o preço base. Não armazenar simultaneamente preço base do produto e preço absoluto da variante.
- Grupos pertencem ao produto e são associados explicitamente às variantes às quais se aplicam. Evita produto cartesiano de tamanho × ponto × extras.
- Quantidade de opção: inteiro positivo até max_quantity. Min/max do grupo contam a soma das quantidades selecionadas. Escolha única: min=max=1 e max_quantity=1 nas opções.
- Fórmula proposta: preço unitário = preço da variante + soma(preço de cada opção × quantidade selecionada). Total da linha = preço unitário × quantidade de produtos.
- Duas unidades com escolhas diferentes são duas linhas diferentes. Quantidade de produto só agrupa unidades de configuração idêntica.
- Adicionais inicialmente não negativos. Trocas com desconto, combos, preço de meio a meio e regras especiais exigem planejamento próprio.
- Uma categoria por produto simplifica o início. Se for necessário o mesmo produto em várias categorias, trocar por associação explícita antes do schema final.

## 4. Disponibilidade operacional

Visibilidade, textos e preços fazem parte do rascunho/publicação. Esgotamento deve ter efeito imediato, sem republicar o cardápio.

Proposta: is_available como campo operacional nas identidades estáveis de produto, variante e opção, com version e auditoria. Esses campos não são copiados como verdade imutável da publicação: leitura pública e envio combinam a oferta publicada com disponibilidade operacional atual. Metadados de auditoria não são públicos.

Arquivar/ocultar no rascunho só muda a oferta após publicação; tornar indisponível é uma ação operacional distinta e imediata. Opção indisponível pode impedir uma combinação; produto sem variante disponível ou sem escolhas suficientes em grupo obrigatório não pode ser pedido. Grupos e variantes inválidos impedem publicação.

As tabelas editáveis cumprem duas funções explicitamente separadas: conteúdo editorial de rascunho e identidade/disponibilidade operacional. Não ler nome, preço ou limite do rascunho para validar pedido publicado. Manter seletor/repository específico para disponibilidade.

## 5. Pedidos e relação com mesas existentes

| Tabela | Campos e função principais |
|---|---|
| orders | id, restaurant_id, source, fulfillment_type, session_id opcional, publication_id opcional, submission_key, request_hash, currency, total_cents, version, created_at, updated_at. Origem inicialmente LOCAL_MENU; modalidade inicialmente DINE_IN. |
| order_items | id, restaurant_id, order_id, product_id, variant_id, product_name_snapshot, variant_name_snapshot, quantity, base_price_cents, unit_price_cents, line_total_cents, notes, pending_quantity, preparing_quantity, ready_quantity, delivered_quantity, cancelled_quantity. |
| order_item_options | id, restaurant_id, order_item_id, option_id, group_name_snapshot, option_name_snapshot, selected_quantity, price_delta_cents. Seleção por unidade do produto, com valores históricos. |
| order_events | id, restaurant_id, order_id, order_item_id opcional, action, quantity opcional, from_state opcional, to_state opcional, actor_user_id opcional, actor_type, reason opcional, resulting_order_version, created_at. Histórico append-only de criação e mudanças. |

Neste ciclo, CHECK de origem/modalidade exige session_id e publication_id para LOCAL_MENU/DINE_IN. Futuras origens/modalidades serão adicionadas com migrations e regras próprias, sem criar agora tabelas de delivery, pagamentos ou integrações.

Não duplicar table_id em orders: a mesa vem de table_sessions.table_id. Validar tenant por FK composta (restaurant_id, session_id). O modelo existente precisará de chaves únicas compostas auxiliares para referências por tenant; essas mudanças devem ser aditivas. Referência à sessão não depende de o token do aparelho permanecer armazenado para sempre.

Snapshot de identificação da mesa na criação pode ser guardado no pedido para exibir histórico mesmo após renomeação; não é fonte de autorização. O restaurante e a sessão identificam o contexto real.

FKs dos itens ao pedido, produto, variante e opção incluem tenant e, quando necessário, pai para evitar escolhas de outro produto. FKs preservam identidade, mas não garantem pertencimento à versão publicada: o service valida os IDs e as relações contra a publicação imutável.

Campos de preço/nome do pedido são cópias históricas intencionais. Atualizar rascunho, publicar novos preços ou arquivar o produto não reescreve pedidos. Não apagar pedidos em cascata ao encerrar sessão, arquivar produto ou desativar restaurante.

### Origem e evolução futura

Origem identifica quem criou: cardápio próprio agora, PDV e canais externos depois. Modalidade identifica como atender: consumo no local agora; retirada/entrega depois. Não criar enum com integrações especulativas nem carregar payload de fornecedor no núcleo.

Quando integrações forem implementadas, adicionar ligação própria entre origem externa e order_id, com unicidade por restaurante/conexão/ID externo, mapeamento de produtos e estados. submission_key é idempotência do envio atual, não substitui identidade externa de integração futura.

## 6. Andamento parcial sem filas duplicadas

Cada linha possui quantidades por etapa. Restrição: pending + preparing + ready + delivered + cancelled = quantity; todos inteiros não negativos. Uma transição move quantidade entre etapas, sob controle de versão, e registra evento na mesma transação.

Isso permite, por exemplo, servir uma de duas bebidas sem marcar ambas como entregues nem quebrar a linha de venda. A interface pode oferecer ações simples para avançar todas as unidades elegíveis; não obriga manipulação manual de cada unidade.

Andamento do pedido é derivado dos itens; não manter enum agregado independente neste primeiro ciclo. Expor contadores e marcadores como tem_itens_prontos, em_preparo, concluído e cancelado. Pedido misto pode ter itens prontos e em preparo simultaneamente, sem sumir da lista de retirada. Não inventar uma ordem linear única que esconda esse fato.

Se todos os itens foram cancelados: cancelado. Se todas as unidades não canceladas foram entregues e existe ao menos uma entregue: concluído. Cancelamento parcial preserva preços da venda original e expõe separadamente valor cancelado e valor ativo; sem significado de pagamento/reembolso neste ciclo.

WAITER pode atualizar preparo e entrega; não exigir KITCHEN, aceite, responsável por mesa ou tela separada. Quais transições podem ser puladas/revertidas e quem pode cancelar serão decididos na etapa 3.

## 7. Restrições, índices e concorrência

- UNIQUE menus(restaurant_id); configuração operacional com restaurant_id único; FK do ponteiro publicado garante mesmo restaurante/menu.
- UNIQUE publicações(menu_id, revision_number). Conteúdo publicado não é atualizado pelo repository; definir proteção contra UPDATE/DELETE de conteúdo no banco no schema final.
- Todas as relações entre entidades de tenant usam chaves compostas apropriadas; filtrar no repository continua obrigatório. Relações de variante/grupo/opção também restringem o produto pai.
- CHECKs: preço/quantidade, limites de seleção, posições não negativas, contadores por etapa e campos obrigatórios da origem atual. Limites que dependem de várias linhas são validados no service dentro da transação.
- UNIQUE orders(restaurant_id, submission_key). Chave aleatória por envio; contexto autenticado e hash do payload associados. Repetição com mesmo contexto/payload devolve o pedido; com conteúdo ou sessão diferente, conflito sem expor outro pedido. Contrato de retenção a definir na etapa 3.
- Índices iniciais: categorias(menu_id, position, id), produtos(category_id, position, id), variantes(product_id, position, id), grupos(product_id, position, id), opções(group_id, position, id), pedidos(restaurant_id, created_at, id), pedidos(restaurant_id, session_id, created_at), itens(restaurant_id, order_id), eventos(restaurant_id, order_id, created_at, id). Avaliar índice parcial para itens com unidades prontas conforme consulta real do painel.
- Posições admitem empate com desempate por ID; reordenação transacional com versão do rascunho. Não impor unicidade de posição que dificulte trocas.
- Edição do rascunho incrementa draft_version na mesma transação. Publicação verifica versão esperada e captura um estado consistente; edição concorrente não produz documento misturado.
- Envio verifica configuração, restaurante/mesa/sessão, publicação e disponibilidade de maneira consistente. Envio, publicação, desativação e encerramento precisam compartilhar estratégia explícita de locks/versões e ordem de aquisição. Transação isolada sem coordenação não basta; detalhar os limites na etapa 4 e testar disputas na etapa 7.
- Política recomendada para seleção antiga: se a revisão publicada mudou, retornar conflito e pedir atualização/reconfirmação. Nunca trocar preço ou escolhas silenciosamente.
- Alteração operacional de andamento compara versão esperada, move quantidades e grava evento atomicamente. Notificações ocorrem somente após commit; falha de notificação não desfaz pedido nem remove dados da consulta.
- Usuário removido não apaga eventos: referência de autor pode ficar nula com identificação histórica mínima apropriada, a definir nas regras de auditoria. Não guardar credenciais/tokens nos eventos.

## 8. Migration e implantação futura

Alterações aditivas: novas tabelas e chaves únicas auxiliares, sem mudar significado de calls, tokens e sessões. Nenhuma migration será executada durante o planejamento.

Para restaurantes existentes, criação de configuração e cardápio vazio em backfill controlado; envio pelo cliente começa desabilitado e sem revisão publicada. Categorias sugeridas não são criadas obrigatoriamente. Cadastro de novo restaurante passa a criar os mesmos recursos na sua transação de criação.

Testar migração em base vazia e base existente, sem depender de seed manual. Definir índices/FKs conforme volume e plano de implantação antes de rodar em produção. Arquivamento e retenção preservam revisões, pedidos e mídia referenciada.

## 9. Decisões solicitadas nesta etapa

1. Aprovar rascunho relacional + publicações imutáveis em JSON validado, com referências relacionais de mídia?
2. Aprovar produto em uma categoria, variantes com preço próprio e grupos vinculados ao produto, com seleção de quais variantes os utilizam?
3. Aprovar disponibilidade e habilitação de pedidos imediatas, separadas da publicação editorial?
4. Aprovar acompanhamento por quantidades dos itens e resumo derivado, permitindo preparo/entrega parciais?

Depois da aprovação, etapa 3 detalha casos de uso, permissões, transições e erros. Não gerar schema definitivo, código ou migrations antes de concluir o planejamento e combinar sua aplicação.
