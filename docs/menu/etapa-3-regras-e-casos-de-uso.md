# Etapa 3 — Regras, permissões e casos de uso

Status: planejamento aprovado pelo usuário, com correção explícita: garçons e cozinha também cancelam unidades não entregues e cozinha registra entrega. Código e migrations ainda não iniciados. Storage local persistente aprovado para começar; host de produção ainda não definido.

Complemento vigente: [fechamento técnico](etapas-4-a-7-arquitetura-e-implementacao.md). Esse documento resolve contratos/limites, explicita transições por etapa de origem e acrescenta o plano de implementação. Aprovação refere-se ao planejamento, sem representar execução de migrations ou implantação.

Decisões confirmadas: STAFF MANAGER também edita/publica o cardápio e controla pedidos pelo cliente. STAFF WAITER e KITCHEN também podem cancelar unidades elegíveis; KITCHEN pode registrar entrega. Todas as ações ficam restritas ao restaurante do autor e registradas em auditoria.

## 1. Permissões propostas

Todas as ações administrativas usam usuário e restaurante ativos e contexto de `tenantOf(req)`. Recursos de outro restaurante retornam 404, inclusive IDs dentro do payload. Não aceitar restaurant_id arbitrário enviado pelo cliente.

| Ação | OWNER | STAFF WAITER/MANAGER | STAFF KITCHEN | Outros STAFF | Cliente da mesa | Público |
|---|---|---|---|---|---|---|
| Consultar cardápio publicado | Sim | Sim | Sim | Sim | Sim | Sim |
| Editar rascunho, mídia e categorias | Sim | Apenas MANAGER | Não | Não | Não | Não |
| Consultar prévia e publicar/retirar publicação | Sim | Apenas MANAGER | Não | Não | Não | Não |
| Habilitar/desabilitar pedidos pelo cliente | Sim | Apenas MANAGER | Não | Não | Não | Não |
| Alterar disponibilidade operacional | Sim | Sim | Sim | Não | Não | Não |
| Enviar pedido pelo cardápio | Pelo contexto de cliente da mesa | Pelo contexto de cliente da mesa | Pelo contexto de cliente da mesa | Pelo contexto de cliente da mesa | Sim, com atendimento ativo | Não |
| Consultar fila de pedidos do restaurante | Sim | Sim | Sim | Não | Não | Não |
| Atualizar preparo dos itens | Sim | Sim | Sim | Não | Não | Não |
| Registrar entrega | Sim | Sim | Sim | Não | Não | Não |
| Cancelar unidades não entregues | Sim | Sim | Sim | Não | Não | Não |
| Consultar o próprio pedido | Pelo acesso administrativo | Pelo acesso administrativo | Pelo acesso administrativo | Não | Sim, com token autor válido | Não |

SUPER_ADMIN não recebe acesso de operação dos restaurantes implicitamente. Categorias CLEANING, OTHER e categoria ausente não recebem permissão de pedidos por serem STAFF. O middleware atual baseado apenas em role não basta para a matriz: será necessário acrescentar uma política explícita de capacidades, mantendo os papéis atuais. Não construir RBAC configurável neste ciclo.

O restaurante não precisa distribuir mesas. Qualquer garçom autorizado atua nas mesas do próprio restaurante. Em computador compartilhado a conta de operação identifica o autor registrado; não exigir troca de login em cada etapa nem afirmar qual pessoa física clicou.

## 2. Casos de uso do catálogo

### Consultar o cardápio público

Resolver restaurante pelo slug ou código da mesa, sem chamar `SessionsService.scan`. Restaurante/mesa inativos respondem 404 no acesso correspondente. Sem publicação, responder 404 com código MENU_NOT_PUBLISHED, sem expor o rascunho. Consultar por slug não depende de existência de mesa ou sessão.

Resposta inclui publicação atual, produtos visíveis, configuração pública de pedidos e disponibilidade operacional. Nunca expor storage_key interno, histórico administrativo ou dados de outros clientes. Link público permite consultar, mas não autoriza enviar pedido sem contexto de mesa.

### Gerenciar rascunho

Criar/editar/arquivar categorias, produtos, variantes, grupos e opções; associar imagens; ordenar; editar identidade. Toda mutação recebe draft_version esperada e incrementa versão em transação. Versão desatualizada retorna conflito, sem sobrescrever edição de outro operador.

Rascunho pode estar incompleto, mas não pode conter relações inválidas entre restaurante, produto, variante, grupo e mídia. Arquivar categoria/produto retira seu conteúdo da próxima publicação, sem modificar revisões existentes. Não permitir exclusão física de identidades publicadas/referenciadas.

Grupos inválidos ou sem escolhas suficientes podem permanecer incompletos no rascunho, mas impedem publicar produto visível. Arquivar categoria não transforma seus produtos em categorias diferentes; restaurar/reorganizar exige ação explícita.

### Prévia

OWNER ou STAFF MANAGER autenticado do restaurante. Retorna rascunho identificado como prévia; não usa endpoint público nem URL pública de revisão não publicada. Não pode enviar pedido real a partir de oferta em prévia. Assets de rascunho exigem estratégia de acesso a definir na etapa 6; IDs difíceis de adivinhar não são autorização.

### Publicar

Requer versão esperada; valida o conteúdo editorial e mídias prontas do tenant. Exige ao menos uma categoria e um produto visíveis, variante visível válida, nomes preenchidos, preços permitidos e grupos consistentes para cada variante. Verifica limites e estrutura de apresentação. Disponibilidade temporária não impede publicar um produto válido que está esgotado.

Cria documento imutável, referências de mídia, autoria e número de revisão; troca ponteiro público atomicamente. Conflito de edição cancela toda a publicação. Rascunho continua disponível para editar; consultas posteriores usam a nova publicação. Requests de pedido que carreguem revisão antiga precisam reconfirmar.

### Retirar publicação

OWNER ou STAFF MANAGER remove o ponteiro público sem apagar revisão, mídias referenciadas ou pedidos. Não cancela pedidos existentes. Reativar publicação ocorre por uma publicação explícita; não introduzir rollback de histórico neste ciclo.

### Alterar disponibilidade

OWNER ou funcionário operacional autorizado pode esgotar/reativar produto, variante ou opção imediatamente. Isso não altera preços, textos ou limites do rascunho/publicação. Não permite reativar algo que não existe na oferta publicada. Disponibilidade na identidade pode ser definida antes da publicação, sem expor o rascunho.

Impedir novas seleções inválidas; não cancelar automaticamente pedidos recebidos. Atualização usa versão operacional esperada e registra autor/horário. Pedido que perdeu disponibilidade retorna conflito para o cliente rever a seleção.

## 3. Configurar pedidos pelo cliente

OWNER ou STAFF MANAGER controla `customer_ordering_enabled`, inicialmente false. Pode ativar antes de publicar, mas o servidor só aceita pedidos se todas as condições forem satisfeitas. A resposta pública deve distinguir recurso habilitado de poder pedir naquele contexto.

Desativação tem efeito imediato no backend e não depende do rascunho. Ocultar controles no cliente é consequência; não é a proteção de acesso. Carrinho local não reserva estoque nem garante preço/disponibilidade. Pedidos já recebidos continuam consultáveis e atualizáveis.

## 4. Enviar pedido

Entrada conceitual: submission_key aleatória, publication_id, linhas contendo product_id, variant_id, quantidade, seleções de option_id/quantidade e observação. Restaurante, sessão, origem LOCAL_MENU e modalidade DINE_IN são definidos pelo servidor a partir da rota/contexto validado. Não aceitar totais como autoridade.

Validar, na transação coordenada:

1. Token de mesa válido, não revogado; atendimento ACTIVE e dentro da validade; mesa e restaurante ativos. O middleware fornece o contexto, mas não substitui a conferência transacional.
2. Habilitação de pedidos e revisão publicada esperada.
3. Produto/categoria/variante visíveis na revisão; associações de grupos/opções válidas para a variante; disponibilidade atual.
4. Quantidades, mínimos/máximos, limites monetários, observações e tamanho máximo do pedido.
5. Calcular valores em centavos e persistir pedido, linhas, escolhas históricas e evento inicial atomicamente.

Revisão mudou: MENU_REVISION_CHANGED, sem reajuste silencioso. Sem estoque formal neste ciclo; disponibilidade é binária e manual. Não prometer reserva de unidades.

Idempotência: repetição da mesma chave, conteúdo e contexto autor devolve o pedido original; conteúdo/contexto diferente retorna conflito. Verificar retry autorizado antes de rejeitar pela habilitação/revisão atual, para não mascarar um pedido já recebido quando a configuração mudou. Token ainda precisa ser válido; sessão encerrada impede acesso de cliente. Unique no banco resolve envios simultâneos. Submissões rejeitadas não viram pedidos vazios.

Limites iniciais aprovados no planejamento: 50 linhas por pedido, 20 unidades por linha, observação com até 500 caracteres e máximo 50 unidades selecionadas por grupo, sempre respeitando limites menores definidos no produto. Tetos monetários e demais contratos estão definidos no fechamento técnico.

Após commit, notificar o painel. Falha do Socket.IO não desfaz o pedido; frontend deve recuperar confirmação por retry com a mesma chave. Na reconexão, consultar fila persistida, sem depender de replay de eventos.

## 5. Consultar pedidos

Funcionário autorizado consulta todos os pedidos do restaurante, com filtros por atendimento/mesa, período e andamento. Paginação com ordenação estável; pedidos com unidades prontas não desaparecem porque outros itens estão em preparo.

Privacidade aprovada: cliente consulta somente pedidos enviados pelo mesmo token de aparelho, dentro do atendimento ativo. Não devolver pedidos de outros aparelhos da mesa. Isso requer referência nullable `submitted_by_token_id` em orders, com vínculo à sessão correta. O fechamento técnico detalha que tokens de mesa não são limpos neste ciclo; eventual limpeza futura desvincula somente o autor nullable, sem perder restaurante/sessão ou pedido histórico.

Token reemitido não herda automaticamente a consulta de outro token. Retomada entre aparelhos ou após novo scan exige requisito próprio; não ampliar acesso apenas por conhecer order_id, submission_key ou código da mesa. Cliente não altera andamento nem conteúdo de pedido recebido.

## 6. Atualizar preparo e entrega

Transições normais por quantidade: PENDING → PREPARING → READY → DELIVERED. WAITER, MANAGER e KITCHEN, além de OWNER, conseguem realizar o fluxo inteiro. Registrar usuário e categoria que efetuaram cada mudança, incluindo preparo e entrega. DELIVERED significa entregue ao cliente; marcar READY significa pronto para retirada, sem afirmar entrega. Não inferir que foi o garçom ou a cozinha apenas pela sequência de estados. Em conta compartilhada, a auditoria identifica a conta autenticada, não prova qual pessoa levou o item fisicamente.

Atalho permitido: ação 'marcar pronto' pode mover unidades PENDING ou PREPARING diretamente para READY. Ação 'entregar' pode avançar unidades não canceladas de etapas anteriores até DELIVERED, registrando a etapa real anterior, para não obrigar cliques artificiais em pico de atendimento. Não registrar etapas intermediárias fictícias. Pedidos continuam sem aceite manual obrigatório.

Cada ação informa item, quantidade e order_version esperada. Quantidade inteira positiva e suficiente na etapa de origem. Atualizar contadores, versão e evento em uma transação; versão desatualizada retorna ORDER_VERSION_CONFLICT. O retry de uma transição com versão antiga não pode aplicar a quantidade duas vezes.

Estado agregado deriva dos itens: pendências, em preparo, prontos para retirada, entregue parcialmente, concluído ou cancelado. Não reduzir pedido misto a um enum que esconda itens prontos. Sem reabertura/reversão de entrega neste ciclo; correções excepcionais serão especificadas antes de serem implementadas.

## 7. Cancelar e corrigir

OWNER e STAFF MANAGER, WAITER e KITCHEN podem cancelar unidades ainda não entregues, inclusive em preparo/prontas, com motivo obrigatório e registro do estado anterior, quantidade, usuário e categoria. Cliente solicita à equipe, sem cancelamento direto pelo app. Não exigir confirmação de gerente para cancelamento elegível pelo garçom/cozinha.

Não excluir linha nem reescrever seu preço. Preservar total original, quantidade cancelada e valor ativo calculado; cancelamento operacional não representa estorno, pagamento ou movimentação de estoque.

Não editar silenciosamente produto, variante, escolhas ou quantidade de pedido recebido. Correção neste ciclo: cancelar unidades elegíveis e enviar novo pedido com nova chave. A equipe ainda não cria pedidos pelo PDV; antes de implementar correção interna, definir caso de uso específico. Unidades já entregues não são canceláveis neste fluxo inicial.

## 8. Encerramento de atendimento

Regra aprovada: impedir encerramento manual com unidades não entregues/não canceladas, retornando SESSION_HAS_PENDING_ORDERS. A equipe finaliza ou cancela as pendências. Exige adaptar `SessionsService.close`, sem alterar o significado de chamados.

Expiração automática e desativação de mesa/restaurante não apagam nem cancelam pedidos. Não impedir desligamento administrativo do restaurante por pedidos pendentes. Expiração fecha acesso do cliente, mas equipe autorizada pode concluir pedidos enquanto restaurante estiver ativo; reativação/restauração de acesso administrativo segue as regras da plataforma.

Pedido enviado concorrentemente ao fechamento: coordenar ambos para que o envio não entre após sessão encerrada e fechamento manual não ignore pedido recém-recebido. Desativação e publicação também participam da coordenação. Detalhar locks, ordem e interfaces na etapa 4.

Encerrar sessão não depende de pagamento neste ciclo, pois não há PDV/financeiro. Pedir a conta continua sendo chamado, sem encerrar sessão ou quitar pedido automaticamente.

## 9. Erros de domínio e compatibilidade

Reutilizar AppError/errorHandler e convenções do projeto. Propostas de códigos:

| Situação | HTTP/código |
|---|---|
| Entrada estrutural inválida | 400 VALIDATION_ERROR |
| Token ausente/inválido/expirado | 401 UNAUTHORIZED |
| Papel/capacidade insuficiente | 403 FORBIDDEN |
| Recurso ausente ou de outro restaurante | 404 NOT_FOUND |
| Sem publicação pública | 404 MENU_NOT_PUBLISHED |
| Pedidos pelo cliente desabilitados | 409 CUSTOMER_ORDERING_DISABLED |
| Publicação mudou | 409 MENU_REVISION_CHANGED |
| Produto/variante/opção esgotou | 409 ITEM_UNAVAILABLE |
| Versão de rascunho/andamento desatualizada | 409 DRAFT_VERSION_CONFLICT / ORDER_VERSION_CONFLICT |
| Chave de envio reutilizada indevidamente | 409 IDEMPOTENCY_CONFLICT |
| Transição não permitida | 409 INVALID_ORDER_TRANSITION |
| Encerramento manual com pendências | 409 SESSION_HAS_PENDING_ORDERS |

Violação de limite mínimo/máximo de escolhas: 400 VALIDATION_ERROR com caminho do campo; referência de entidade de outro tenant: 404 genérico. Detalhes de conflito só podem expor dados aos quais o autor tem acesso. Novos códigos podem exigir estender classes existentes; isso será planejado na etapa 4, sem forçar todos os conflitos a uma mensagem genérica.

## 10. Resultado da revisão

Usuário aprovou as demais sugestões de implementação e ampliou entrega/cancelamento para a equipe operacional conforme matriz atualizada. Atalhos para pronto/entregue, privacidade por token e bloqueio de encerramento manual com pendências ficam aprovados no planejamento.

Etapas 4–7 estão detalhadas e aprovadas conceitualmente no fechamento técnico. Próxima entrega prevista: schema concreto e migration revisáveis, seguindo os incrementos definidos, sem implantação automática.
