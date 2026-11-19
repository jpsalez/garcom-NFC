# Planejamento do módulo de cardápio

Registro histórico do planejamento aprovado. Para estado implementado, validação e contrato vigente: [README](README.md), [API](API.md) e [operação](OPERACAO.md).

Status: planejamento conceitual e sugestões de implementação aprovados pelo usuário; correção final: cozinha registra entrega e garçons/cozinha podem cancelar unidades elegíveis com auditoria. Detalhes vigentes em `etapas-4-a-7-arquitetura-e-implementacao.md`. PDV/integrações ficam para depois. Código e migrations ainda não iniciados; sem autorização implícita de implantação/commit/push.

Atualização: [schema e migration de revisão](README.md) preparados, com validação Prisma e 32 cenários SQL isolados. Não incorporados ao repositório nem aplicados ao banco da aplicação. Falta validação em PostgreSQL 16 de teste.

Armazenamento confirmado: local persistente nesta versão. **Feature futura: migrar imagens para bucket Amazon S3**, com adaptador no backend e migração dos arquivos existentes. Bucket não é requisito para iniciar nem para deploy com host persistente.

## Documentos e ordem de leitura

1. Este documento: histórico de requisitos e roteiro.
2. [Etapa 2](etapa-2-modelo-de-dados.md): modelo conceitual aprovado, com complementos descritos no fechamento técnico.
3. [Etapa 3](etapa-3-regras-e-casos-de-uso.md): proposta de regras e permissão do gerente confirmada.
4. [Fechamento técnico e etapas de código](etapas-4-a-7-arquitetura-e-implementacao.md): proposta vigente para resolver detalhes/contradições anteriores; arquivos, interfaces, transações, HTTP, mídia, testes e incrementos 0–9.
5. [Pacote concreto de banco](README.md): schema Prisma, SQL da migration, preflight e relatório de validação; ainda em revisão, sem aplicação ao banco real.

As propostas foram aprovadas pelo usuário após revisão, com ampliação das permissões de entrega/cancelamento para garçons/cozinha. Referência final: fechamento técnico atualizado. Infraestrutura/host de produção ainda serão configurados antes do deploy; bucket não é obrigatório com disco persistente.

## Base analisada e limite da análise

Código consultado: `C:/Users/Lene _3/Desktop/jp/garcom-NFC`. A pasta atual de trabalho estava vazia. Antes da implementação, confirmar repositório e branch e revisar este plano contra o código atualizado.

Backend existente: Express, TypeScript, PostgreSQL, Prisma, Zod e injeção de dependências com tsyringe. Organização por módulos com interfaces de repository/service, implementações e controllers. Rotas centralizadas em `src/routes.ts`; dependências em `src/shared/container/container.ts`; documentação em `src/docs/openapi.ts`.

O restaurante possui `id`, `name`, `slug` único e `active`. Usuários possuem papéis OWNER, STAFF e SUPER_ADMIN. A autenticação confere usuário e restaurante ativos; `tenantOf(req)` fornece o restaurante autenticado. Repositories de mesas restringem operações por `restaurant_id` e retornam 404 para recurso de outro restaurante.

Mesas possuem `public_code`; sessões e chamados são módulos próprios. O `SessionsService.scan` pode criar atendimento e token: não deve ser reutilizado apenas para consultar cardápio. O comportamento real do código prevalece sobre a descrição simplificada do README.

## Processo de aprovação

Cada etapa deve apresentar proposta concreta, alternativas relevantes, consequências e perguntas pendentes. A aprovação de uma etapa de planejamento permite avançar no planejamento seguinte. Alterações que invalidem decisões anteriores devem voltar para revisão.

Somente depois da aprovação do plano completo será definida a aplicação em código, em incrementos revisáveis. Não executar migrations, editar código de produção, fazer commit ou push durante o planejamento.

## Etapa 1 — Limites do módulo e integração

Status: limites consolidados para avançar ao modelo de dados. Regras detalhadas de autorização e transição ainda serão discutidas na etapa 3.

Decisões confirmadas pelo usuário:

1. O cliente poderá enviar pedidos já neste ciclo; o PDV será construído posteriormente.
2. Cada restaurante terá um cardápio, com categorias cadastradas pelo dono. Comida, lanches, bebidas e sobremesas serão sugestões, sem categorias fixas obrigatórias.
3. A edição será em rascunho, com publicação explícita.
4. Neste primeiro ciclo, pedidos serão feitos apenas por mesa com atendimento ativo. Consulta ao cardápio continua pública; retirada e entrega não entram neste ciclo.
5. Variações e adicionais estruturados entram neste primeiro ciclo.
6. Haverá fila de pedidos no painel atual, antes da implementação do PDV. O usuário questionou a necessidade de aceite pelo garçom e prefere avaliar encaminhamento direto à cozinha.
7. Qualquer garçom pode atender qualquer mesa. Também deve ser possível trabalhar com garçons fixos, sem exigir configuração/distribuição de mesas durante o atendimento. Há estabelecimentos com apenas um computador; telas separadas e celulares individuais não podem ser pressupostos.
8. O painel dos garçons mostra todos os pedidos feitos pelo app desde o envio, inclusive os que estão em preparação. Garçons podem atualizar esses pedidos; não há dependência de uma tela ou de um operador exclusivo da cozinha.
9. O estabelecimento pode habilitar ou desabilitar o envio de pedidos pelo cliente. Quando desabilitado, essa funcionalidade não deve aparecer para o cliente.
10. PDV e integrações externas serão desenvolvidos depois. O núcleo separará origem, modalidade e contexto: mesa/atendimento é obrigatório para pedidos do cardápio na mesa, sem se tornar obrigação universal para futuras origens. Não implementar conectores externos agora.
11. Gerente (STAFF MANAGER) também pode editar/publicar o cardápio e habilitar/desabilitar pedidos pelo cliente no próprio restaurante.
12. Cozinha pode registrar entrega; garçons e cozinha também podem cancelar unidades ainda não entregues, com motivo obrigatório e auditoria de conta autora/categoria/horário. As demais sugestões de implementação foram aprovadas.

### Fluxo consolidado proposto

O dono ou gerente (OWNER ou STAFF MANAGER) controla `customer_ordering_enabled`, uma configuração operacional por restaurante, separada do rascunho editorial do cardápio. A mudança tem efeito imediato no servidor, sem depender de republicação. O padrão inicial recomendado é desabilitado até ativação explícita por dono ou gerente.

- Desabilitado: cliente consulta o cardápio publicado e continua usando os chamados existentes; não vê controles de adicionar/enviar pedido. O backend rejeita novos pedidos mesmo se a tela estiver desatualizada ou a API for chamada diretamente.
- Habilitado: cliente de mesa/atendimento ativo escolhe itens, variantes/adicionais e envia. O servidor verifica novamente a configuração, o contexto e a oferta e persiste o pedido de forma idempotente.
- Pedido recebido aparece imediatamente na consulta do painel dos garçons, com mesa, horário, itens, escolhas, observações e estado. Atualização em tempo real ocorre após commit; recarregar/reconectar recupera a lista persistida.
- Garçom autorizado acompanha e atualiza o andamento no mesmo painel: RECEIVED → PREPARING → READY → DELIVERED. Não há aceite obrigatório, atribuição obrigatória de mesa ou retirada obrigatória para avançar. Cancelamento é uma ação específica, com motivo e transições a definir.
- A cozinha pode usar uma visão dos mesmos pedidos, mas ela é opcional. Operação com um computador não depende de dois painéis ou de outro dispositivo. O software não presume que a cozinha recebeu uma notificação que ela não tem como visualizar.
- Desabilitar pedidos não cancela pedidos já recebidos nem bloqueia seu preparo/entrega. Pedidos em seleção ainda não enviados serão recusados ao enviar enquanto o recurso estiver desabilitado.
- Alterar estado usa transição esperada/versão para impedir que atualizações simultâneas sobrescrevam o andamento. Registrar conta autora e horário; em terminal compartilhado, não atribuir a ação a uma pessoa diferente da conta utilizada.
- Detalhar estados/quantidades por item e agregado do pedido na etapa 2, preservando o fluxo simples para entregas parciais.
- Cardápio não publicado, restaurante/mesa inativos e atendimento encerrado continuam impedindo novos pedidos independentemente da configuração. Definir concorrência entre desativação/publicação/encerramento e envio no contrato transacional.

Separação de edição: garçons atualizam o andamento dos pedidos; isso não concede automaticamente permissão para alterar produtos, preços, quantidades ou escolhas de um pedido recebido. Correções de conteúdo e cancelamentos serão decididos explicitamente na etapa 3.

Proposta inicial:

- Um cardápio por restaurante, com categorias livres cadastradas pelo dono e sugestões opcionais do sistema.
- Categorias e itens com nome, descrição, preço, ordem de exibição, imagens e disponibilidade.
- Configuração de identidade do cardápio: nome de exibição, logo, capa e opções de apresentação validadas. O nome exibido no cardápio pode ser diferente do nome cadastral do restaurante.
- OWNER e STAFF MANAGER gerenciam o cardápio do próprio restaurante. Os demais STAFF não recebem edição/publicação; disponibilidade operacional segue a matriz proposta na etapa 3. SUPER_ADMIN não recebe edição de cardápios implicitamente.
- Consulta pública por restaurante, sem login e sem exigir atendimento ativo.
- Acesso pela mesa pode apresentar o mesmo cardápio, preservando seu contexto para os chamados. Apenas ler o cardápio não abre sessão nem emite token de atendimento.
- Restaurante inativo não tem cardápio público acessível. Rascunhos e prévias não são públicos.
- Envio de pedidos incluído neste ciclo. Cardápio e pedidos terão responsabilidades separadas. Pagamentos, estoque, fluxo de cozinha e funções de PDV dependem de planejamento próprio; não foram incluídos automaticamente pela decisão de enviar pedidos.
- Chamados existentes continuam significando chamar garçom ou pedir a conta. Pedido é uma entidade própria; não ampliar `calls` para armazenar itens ou valores.
- Edição em rascunho e publicação explícita confirmadas: clientes consultam a versão publicada; alterações incompletas não aparecem publicamente.

Proposta de integração para aprovação:

- Módulo `menu`: catálogo, categorias, itens, identidade, prévia e publicação.
- Módulo `orders`: recebimento, itens do pedido, valores confirmados, estados e histórico. O futuro PDV deve usar seus casos de uso, sem reimplementar pedidos nem acessar suas tabelas diretamente como contrato de integração.
- Confirmado: pedidos apenas para mesa com atendimento ativo, validados pelo mecanismo de token de mesa existente. Verificar também mesa/restaurante ativos e token válido. Consulta ao cardápio continua pública.
- Fila no painel atual confirmada. Após validação e persistência, pedido aparece no painel dos garçons e na visão opcional da cozinha, sem aceite obrigatório. Estados propostos: RECEIVED → PREPARING → READY → DELIVERED, com CANCELLED em transições permitidas a definir. RECEIVED significa recebido pelo sistema e aguardando preparo, sem depender de aprovação manual.
- A fila de cozinha é uma consulta dos pedidos por restaurante/estado, não uma segunda cópia nem uma tabela paralela de pedidos. Atualização em tempo real é um aviso após commit; reconexão/recarregamento consulta novamente a fila persistida. Não há necessidade inicial de um broker externo para essa fila operacional.
- Permissão confirmada: garçons acompanham e atualizam o andamento dos pedidos. A cozinha pode fazer isso em visão opcional dos mesmos dados, conforme permissões a definir. Não restringir início de preparo ou marcação de pronto exclusivamente à categoria KITCHEN. Em terminal compartilhado, permitir operação sem alternância obrigatória de login a cada etapa; a conta utilizada fica registrada, sem inventar identificação individual do funcionário. Definir matriz de papéis, cancelamento, motivos e tratamento de pedidos inviáveis nas etapas de regras/API.
- Atendimento compartilhado por padrão: pedidos pertencem ao restaurante e ao atendimento da mesa, sem garçom obrigatório. Ausência de responsável não bloqueia envio, preparo nem entrega. Garçom fixo pode continuar sendo uma prática operacional; eventual associação no sistema deve ser opcional, não exclusiva e não impedir outro funcionário autorizado de atender.
- Recomendação para computador único: fila unificada consultável com mesa, pedido, itens e estados; visões por função são filtros opcionais sobre os mesmos dados. Não exigir cadastro de escala, distribuição de mesas ou que alguém assuma uma retirada para registrar entrega. Se futuramente houver múltiplos terminais, definir mecanismo opcional de retirada com atualização atômica para evitar duplicidade.
- Preparo e entrega parciais: avaliar na etapa 2 estados/quantidades por item e pedido com estado agregado, para permitir bebidas e pratos prontos em momentos diferentes. Na etapa 3 definir cancelamentos parciais e correções operacionais.
- Restrição física: gravar pedido não garante ciência da cozinha. O garçom pode operar os estados e comunicar o pedido pelo processo do estabelecimento, sem bloquear o planejamento por falta de dispositivo na cozinha. Impressão e dispositivos extras não estão confirmados nem são requisitos do primeiro ciclo.
- Nome, preço e opções escolhidas ficam registrados no item do pedido no momento da confirmação, com referência ao produto/revisão de origem. Publicar outro cardápio ou arquivar um produto não altera pedidos anteriores.
- Servidor valida a versão publicada, disponibilidade, opções, quantidades e preços. Não confia no total enviado pelo cliente. Se a oferta mudou desde a seleção, informa conflito para reconfirmação em vez de cobrar um valor diferente silenciosamente.
- Prever chave de idempotência no envio: repetição por clique ou falha de rede não cria pedidos duplicados. Definir escopo e restrição única no banco.
- Definir comportamento concorrente entre enviar pedido e encerrar sessão e efeito de sessão encerrada sobre pedidos já recebidos.
- Confirmado: opções estruturadas. Proposta de modelagem a detalhar na etapa 2: variantes para formatos com preço próprio (ex.: pequeno/grande); grupos de escolhas com mínimo/máximo e opções (ex.: ponto da carne obrigatório, extras opcionais). Definir exclusividade, repetição, quantidades, composição de preço, disponibilidade e combinações permitidas, evitando gerar todas as combinações como variantes.
- Pedido guarda as escolhas e seus valores históricos; observação textual não substitui seleção estruturada nem altera preço. Os limites dos grupos e compatibilidade das opções são validados pelo servidor.

Encaminhamento: avançar ao modelo de dados conforme pedido do usuário. Padrões operacionais recomendados (como envio inicialmente desabilitado), detalhes de autorização e transições serão explicitados para aprovação nas etapas seguintes.

## Etapa 2 — Modelo de domínio e banco

Status: escolhas conceituais aprovadas. Proposta detalhada em [etapa-2-modelo-de-dados.md](etapa-2-modelo-de-dados.md). As entidades abaixo são o registro das questões iniciais; o documento da etapa 2 contém a proposta concreta de campos, relações, restrições, índices, publicação e migration. Imagens ficam em armazenamento de arquivos/objetos e metadados no PostgreSQL; fornecedor e implantação pendentes da etapa 6.

Entidades candidatas: cardápio, revisão publicada, categoria, item de catálogo, variante, grupo de escolhas, opção, configuração de apresentação, arquivo de mídia, pedido, item do pedido, escolhas do item e histórico de estados. Não são tabelas aprovadas. Pedido se vincula ao restaurante e atendimento/mesa; definir como garantir integridade desses vínculos, sem redundância inconsistente.

Decidir:

- Cardinalidades: restaurante–cardápio, cardápio–categoria e categoria–item; um item pertence a uma categoria ou pode aparecer em várias?
- Propriedade de todos os recursos por restaurante; integridade das relações entre entidades do mesmo restaurante também no banco.
- Preço e moeda, sem ponto flutuante; avaliar centavos inteiros ou Decimal com precisão definida.
- Diferença entre item oculto, indisponível e arquivado; efeito da categoria oculta sobre os itens.
- Ordenação e movimentação entre categorias, incluindo operações concorrentes.
- Opções, tamanhos e adicionais confirmados: definir relações, compartilhamento de grupos, limites, quantidades, preço, disponibilidade e compatibilidade com variantes.
- Nome de exibição versus nome do restaurante e valores padrão para identidade visual.
- Configuração operacional `customer_ordering_enabled` por restaurante, independente das revisões editoriais; definir padrão, auditoria e controle de concorrência no envio e na desativação.
- Campos relacionais para dados de negócio; configuração JSON apenas para opções de apresentação delimitadas e validadas, com versão de schema.
- Publicação confirmada: comparar revisões relacionais com snapshot público imutável. Definir conteúdo da revisão, atomicidade, concorrência, disponibilidade, referências dos pedidos e exclusão de mídias ainda referenciadas.
- Pedidos: identidade estável, chave de idempotência, itens com valores históricos, estados e transições auditáveis, vínculos com restaurante/mesa/atendimento e regras de retenção. Prever preços das opções caso entrem no escopo.
- Auditoria mínima, exclusão/arquivamento e comportamento para restaurantes já existentes, sem criar dependência de seed manual.

## Etapa 3 — Casos de uso, regras e permissões

Status: proposta detalhada em [etapa-3-regras-e-casos-de-uso.md](etapa-3-regras-e-casos-de-uso.md), com conteúdo aprovado no planejamento. Inclui matriz de ações por papel, casos de uso, contratos conceituais, regras de transição, cancelamentos, privacidade e erros.

Cobrir criação/configuração do cardápio, gestão de categorias e itens, reordenação, disponibilidade, mídia, prévia, publicação e retirada de publicação. Incluir enviar, consultar e tratar pedidos, com regras de transição, idempotência, concorrência, preço divergente e encerramento de atendimento.

Regras propostas: contexto administrativo obtido de `tenantOf(req)`; IDs enviados pelo cliente sempre verificados dentro do restaurante; relações cruzadas rejeitadas; DTO público sem metadados privados; consulta pública sem efeitos em sessões ou chamados.

Definir limites de conteúdo, semântica de PATCH, erros e códigos estáveis, exclusões, conflitos de versão e transações necessárias. Se houver publicação, decidir se disponibilidade é imediata ou faz parte do rascunho.

## Etapa 4 — Repository, service, controller e injeção

Status: detalhada nas seções 2–4 do [fechamento técnico](etapas-4-a-7-arquitetura-e-implementacao.md), com conteúdo aprovado no planejamento. Inclui árvore de arquivos, interfaces, capacidades, unidade de trabalho e coordenação transacional.

Direção proposta: módulos `src/modules/menu/` e `src/modules/orders/`, seguindo os padrões existentes. Quantidade e divisão de repositories/services serão determinadas pelos casos de uso; evitar tanto um serviço com responsabilidades demais quanto abstrações sem necessidade. A integração entre catálogo e pedidos deve fornecer a oferta publicada validada, sem fazer o catálogo depender de pedidos ou do futuro PDV.

- Schemas Zod: validação estrutural, limites e formatos das entradas.
- Controller: extrair contexto autenticado ou público, chamar o service e converter resultado em resposta HTTP.
- Service: regras de negócio, autorização contextual, coordenação e limites de transação.
- Interface de repository: operações de persistência necessárias aos casos de uso, sempre com escopo de restaurante nas operações administrativas.
- Repository Prisma: consultas, persistência, filtros de tenant e suporte a transações; sem dependência de Express.
- DTOs: contratos administrativos e públicos explícitos, sem expor modelos Prisma como resposta por conveniência.
- Container: registrar interfaces e implementações no mecanismo existente.

Definir a integração com repositories de restaurantes/mesas sem dependências circulares e como disponibilizar o mesmo contexto transacional às operações de múltiplos repositories.

## Etapa 5 — API e integração com recursos existentes

Status: detalhada nas seções 5–6 do [fechamento técnico](etapas-4-a-7-arquitetura-e-implementacao.md), com conteúdo aprovado no planejamento. Inclui endpoints, payloads, versões, erros, limites e eventos autorizados.

Separar contratos administrativos, prévia autenticada e leitura pública. Usar o versionamento já adotado pelo servidor. Avaliar caminho público por slug e resolução por código da mesa sem acionar o scan de atendimento.

Preservar os contratos de login, mesas, sessões e chamados. Caso seja necessário ampliar uma resposta existente, definir compatibilidade e testes de regressão. Confirmar comportamento para mesa desativada, restaurante inativo, sessão encerrada, cardápio não publicado e mudança de slug.

Definir limites/paginação administrativos, tamanho máximo da resposta pública, política de cache e atualização após publicação. Para pedidos, definir envio idempotente, leitura autorizada e transições por funcionário. Avaliar reutilização de Socket.IO para avisar novos pedidos somente após persistência; a fila consultável no banco deve continuar sendo a fonte de verdade.

## Etapa 6 — Imagens e armazenamento

Status: proposta concreta na seção 7 do [fechamento técnico](etapas-4-a-7-arquitetura-e-implementacao.md), com conteúdo aprovado no planejamento. Recomenda storage local em volume persistente para iniciar, abstraído por interface; bucket futuro não é requisito inicial.

Separar metadados no banco dos bytes em armazenamento de objetos. Definir provedor após conhecer implantação e volume; não vincular regras do cardápio diretamente a um fornecedor.

Planejar validação real de formato e tamanho, processamento de imagens, identificação de proprietário, confirmação de upload, URLs públicas ou assinadas, substituição, limpeza de órfãos e retenção de arquivos usados pela versão publicada. Considerar que arquivos não são revertidos pela transação do PostgreSQL.

## Etapa 7 — Testes, operação e plano de aplicação

Status: detalhada nas seções 8–11 do [fechamento técnico](etapas-4-a-7-arquitetura-e-implementacao.md), com conteúdo aprovado no planejamento. Incrementos 0–9 com critérios de aceite, testes, revisão e limitações.

Validar isolamento entre restaurantes em leitura e escrita, permissões, relações inválidas, preços, estados e ordenação, publicação concorrente e atômica, prévia privada, restaurante inativo, ciclo de mídia e consulta pública sem criar sessões/tokens. Para pedidos, cobrir envio duplicado/concorrente, alteração da oferta durante seleção, preservação dos preços históricos, token inválido/expirado, concorrência com encerramento de sessão e notificações após commit.

Reutilizar Vitest, Supertest e o banco de testes existente. Cobrir regressões de mesas, scan, sessões e chamados; verificar migrations tanto em banco vazio quanto em base existente. Atualizar OpenAPI e documentação.

Definir observabilidade, limites de tráfego, falhas de upload, estratégia de cache e reversão de release. Decompor implementação em incrementos com arquivos previstos, dependências, critérios de aceite e pontos de revisão. Não executar essa sequência antes da aprovação correspondente.
