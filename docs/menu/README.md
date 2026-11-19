# Cardápio e pedidos — backend

Backend implementado: schema/migration, inicialização transacional, capacidades, catálogo editável, publicação, mídia local, envio e andamento dos pedidos, auditoria e eventos autorizados. Contratos detalhados em [API.md](API.md) e Swagger de desenvolvimento. Telas do editor, cardápio/carrinho e painel integrado pertencem ao próximo trabalho de frontend; PDV e Amazon S3 continuam como evoluções futuras.

Deploy, logs, backup e restauração: [OPERACAO.md](OPERACAO.md).

## Implementado

- [Schema Prisma](../../back-end/prisma/schema.prisma) com 18 tabelas novas para catálogo, publicações, mídia, pedidos e auditoria.
- [Migration](../../back-end/prisma/migrations/20261119100000_menu_and_orders_foundation/migration.sql) aditiva, transacional, com relações entre tenants, checks monetários/quantidades, imutabilidade e backfill.
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

## Integração com Prisma

menus.id usa UUID textual gerado pelo PostgreSQL. O id participa também da FK composta do ponteiro de publicação. A geração no banco evita omissão do UUID pelo Prisma em criações aninhadas com essa relação. Os demais IDs mantêm o padrão existente de UUID textual gerado pelo cliente Prisma.

Operações de criação passam por initialRestaurantData/RestaurantRepository; acesso direto a prisma.restaurants.create continua sendo uma primitiva de persistência e não inicializa o agregado automaticamente. Factories de testes antigos que só precisam de restaurante podem continuar usando essa primitiva. Serviços de negócio devem usar o repository para o cadastro completo.

O schema não expressa todos os CHECKs e triggers: preservar o SQL da migration. Não substituir a implantação por prisma db push.

## Armazenamento

**Nesta versão:** LocalStorageProvider e upload implementados. Arquivos locais em volume persistente no host, por trás de IStorageProvider. Banco guarda metadados, propriedade, derivados e referências. MEDIA_ROOT=/data/media nos dois arquivos Compose; produção prepara permissões da pasta para o usuário node.

**Feature futura aprovada:** migrar imagens para bucket Amazon S3. Não há dependência de SDK AWS, credenciais ou bucket para iniciar o backend ou realizar deploy com disco persistente. A migração futura inclui cópia/verificação das imagens existentes e troca controlada do provider. Código/API de armazenamento fica no backend; o bucket guarda objetos.

## Verificação e migração

Alvo PostgreSQL 16 e Prisma 6.19.3. A revisão SQL foi executada em PostgreSQL 16.14, tanto em cadeia vazia quanto em base com registros legados; [relatório](schema-verification.json) registra 32 verificações e os hashes usados. Testes adicionais de integração estão em [menu-foundation.test.ts](../../back-end/tests/menu-foundation.test.ts).

Validação da fundação inicial: 132 testes da base passaram antes da alteração; depois, 137 testes passaram (132 existentes + 5 novos). Typecheck e lint passaram; permanecem dois avisos antigos de non-null assertion em cookies.test.ts e aviso da configuração antiga do Biome. Prisma validate passou, migrate deploy aplicou a migration no banco temporário e migrate diff não detectou divergência entre banco e schema. [Evidência da fundação](foundation-validation.json).

Validação do backend completo: regressão de **165 testes sem falhas**, incluindo permissões, isolamento entre restaurantes/aparelhos, concorrência, adicionais, mídia, auditoria e eventos. Typecheck/lint passaram e o Prisma não detectou divergência no schema. A checagem final do tamanho JSONB também recebe reexecução dos testes afetados. Resultados, hashes e limitações estão em [backend-validation.json](backend-validation.json).

As verificações auxiliares tiveram duas limitações de ambiente: Compose de produção exigiu valores fictícios para as variáveis obrigatórias do exemplo vazio; o comando avulso tsx não conseguiu consultar o usuário do Windows. A sintaxe dos Compose foi validada e o OpenAPI foi carregado/serializado e conferido por testes Vitest. Não houve falha funcional nas baterias finais.

Checkout de implementação desta sessão: `Documents/ChatGPT/Psiu - NFC/garcom-NFC`, branch dev. O checkout do Desktop foi somente consultado e não foi modificado por este incremento. A migration foi aplicada exclusivamente aos bancos temporários criados para teste, sem acesso ao banco da aplicação.

Antes de aplicar em banco existente, executar as consultas somente de leitura de [preflight.sql](preflight.sql), revisar backup e confirmar DATABASE_URL. A FK adicional entre sessão e mesa exige consistência do restaurante nesses registros. A migration não tenta corrigir dados legados inconsistentes silenciosamente.

Com o banco correto configurado, comandos padrão do backend:

```powershell
npx prisma generate
npx prisma migrate deploy
npm run typecheck
npm run lint
npm test
```

O último comando usa `.env.test` e apaga dados exclusivamente de teste por design. Não substituir sua URL por banco real. A implantação de desenvolvimento/produção não foi executada neste incremento.

## Próximas evoluções

1. Frontend: editor/preview, cardápio público/carrinho, painel de pedidos junto dos chamados e recuperação por REST.
2. PDV e criação de pedidos pela equipe, sem duplicar regras do núcleo.
3. Integrações externas, pagamentos, estoque e modalidades de retirada/entrega, com planejamento próprio.
4. S3StorageProvider com transferência verificada das imagens locais; não há requisito de AWS nesta versão.

O módulo não foi implantado em produção. A sintaxe dos dois Compose pode ser validada sem daemon, mas build/recriação real de containers ainda exige Docker acessível no ambiente de implantação. Testes de persistência de mídia usam arquivos reais e outra instância do provider; não equivalem a um teste de restart de container.

Planejamento aprovado: [roteiro](planejamento.md), [modelo](etapa-2-modelo-de-dados.md), [regras](etapa-3-regras-e-casos-de-uso.md) e [arquitetura/incrementos](etapas-4-a-7-arquitetura-e-implementacao.md). Esses documentos registram o histórico das propostas; esta página registra o estado implementado.
