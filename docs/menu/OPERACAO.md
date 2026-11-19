# Operação do módulo

## Implantação inicial

Requer PostgreSQL 16 e uma instância da API com disco persistente. Os Compose de desenvolvimento e produção montam media_data em /data/media. O Dockerfile prepara a pasta para o usuário node. Nenhum recurso ou credencial AWS é necessário.

Antes de aplicar a migration em base existente: backup, leitura de preflight.sql, confirmação da URL de destino e revisão do schema. A aplicação neste trabalho foi exclusivamente em bancos temporários de teste. O entrypoint de produção aplica migrations pendentes ao iniciar; executar um deploy real é uma ação distinta, não realizada por este trabalho.

Na primeira inicialização, restaurantes antigos recebem rascunho vazio e envio desabilitado. O dono/gerente cadastra categorias/produtos, envia imagens, publica e habilita pedidos. O cliente só envia pelo contexto de mesa ativa. Interfaces de usuário ainda precisam consumir os contratos do backend.

## Logs e diagnóstico

Respostas HTTP incluem X-Request-Id, também exposto pelo CORS para as origens autorizadas. Logs JSON de requisições registram esse ID, método, rota, restaurante quando autenticado, status, código de erro e duração. A unidade de trabalho registra tentativa, tempo de espera da trava e duração total da transação. Jobs sem requisição podem não ter request_id.

Não são registrados bodies de pedidos, observações, arquivos, cookies ou tokens por esses logs. Em NODE_ENV=test os logs operacionais são desabilitados para não poluir testes; os erros sanitizados existentes continuam disponíveis. Usar códigos de erro e request_id para correlação, não copiar credenciais para mensagens de diagnóstico.

Contadores de falhas/conflitos, latência e espera podem ser derivados desses eventos por um coletor externo, que não é dependência deste incremento. Não foi definido SLA de throughput nem provisionado um sistema externo de métricas. Um mutex por restaurante coordena escritas; caso a espera cresça, medir antes de alterar a granularidade das travas.

## Backup consistente do armazenamento local

Para a implantação inicial com uma API, usar uma janela breve de manutenção:

1. Suspender a API para impedir uploads, edição/publicação e limpeza enquanto se captura o backup. Confirmar que não existem outros escritores manuais no banco.
2. Capturar um dump consistente do PostgreSQL e uma cópia completa do volume media_data. Incluir chaves, hashes e metadados do banco; os arquivos isolados não identificam suas relações.
3. Registrar versão do código/migrations e data do backup. Reiniciar a API e conferir saúde e leitura de um cardápio/imagem publicada.

Não basta salvar só o banco, só as imagens ou a pasta do container. Recriar container preserva volume nomeado; remover os volumes apaga seus dados. Não executar down -v como procedimento de atualização.

## Restauração

Manter API parada, restaurar o banco e o volume do mesmo conjunto de backup, recuperar as permissões do volume para o usuário node e conferir MEDIA_ROOT. Restaurar uma versão coerente do schema e depois aplicar migrations pendentes, em vez de importar restaurantes antigos diretamente numa base nova e pressupor inicialização automática.

Validar contagem de arquivos/derivados, chaves relativas e hashes amostrais, acesso privado/público e fila dos pedidos antes de liberar o acesso. Regenerar o Prisma Client a partir do schema da versão implantada. Não tentar reverter uma release apagando tabelas com pedidos reais; usar correção aditiva ou restauração planejada.

Testes deste trabalho usam arquivos temporários reais e bancos descartáveis. Build/restart de containers e restauração completa em infraestrutura de produção ainda precisam ser exercitados no ambiente de implantação.

## Evoluções separadas

- Amazon S3: criar bucket/permissões, implementar S3StorageProvider, acrescentar provider ao schema, copiar/verificar os objetos e trocar referências de forma controlada. Não é só mudar uma variável e não exige instalar uma API no bucket.
- Múltiplas instâncias: compartilhar invalidação de autenticação, limitadores e distribuição de eventos; armazenamento local isolado não é compartilhado automaticamente. O desenho atual pressupõe uma instância.
- PDV/integrações externas: acrescentar casos de uso por origem/modalidade, mapeamento e idempotência externos, preservando o núcleo e o histórico dos pedidos existentes.
