# Painel de desenvolvimento

O painel é uma ferramenta local de desenvolvimento. Seus arquivos, dependências e análises devem permanecer fora do código e dos bundles de `back-end` e `front-end`.

## Regras de implementação

- Preservar as funções aprovadas e o visualizador de arquivos existente.
- Usar JavaScript/CSS nativos e fontes do sistema; evitar bibliotecas e recursos remotos para acabamento visual.
- Executar testes e análises custosas somente quando solicitados. Não iniciar agentes para montar telas, classificações ou explicações.
- Vincular medições à versão do código e apresentar dados ausentes como **Não medido**.
- Tratar SOLID, responsabilidade única e arquitetura como revisão contextual, sem prometer certificação por regex.

## Saúde do código

`POST /api/quality/scan` calcula um snapshot de conteúdo e usa o estimador existente de funções TypeScript em `back-end/src`. A interface informa o escopo; o front-end não é avaliado por esse estimador. A leitura ocorre ao entrar na tela ou atualizar o diagnóstico, sem timer de análise.

Política, revisões, exceções, relatórios importados e registro de decisões da qualidade ficam em `localStorage`, neste navegador/endereço. Use **Exportar política e registro** para guardar uma cópia. Isso não configura CI nem bloqueia commits. Exceções e revisões só valem para o snapshot analisado.

Em **Histórico e relatórios**, baixe o modelo com snapshot e IDs reais. Adapte resultados medidos pelas ferramentas do projeto: `testsPassed` booleano; `coverage` e `mutation` de 0 a 100 por ID de função. Deixe dados ausentes como `null`. O painel não executa nem certifica relatórios importados. Um relatório de outro snapshot não serve para aprovar o código atual.

Os limites são sugestões da equipe, não normas universais de Robert C. Martin. As referências primárias ficam na interface. CRAP usa complexidade e cobertura da mesma função; arquivos de teste encontrados por nome não contam como cobertura.

## Demais telas

- **Arquivos** conserva árvore, busca, linhas, histórico, blame e contexto, com acabamento visual padronizado.
- **Verificar** explica efeito e pré-requisitos antes de executar um dos scripts autorizados. O Git é carregado ao expandir sua seção. Uma checagem bem-sucedida não prova ausência de bugs.
- **Decisões** registra escolhas humanas, mostra bloqueios, permite confirmação e reabertura. Não implementa código ao resolver uma decisão.
- **FAQ** explica telas e ações com busca e filtros; o glossário técnico anterior permanece como referência complementar. Favoritos `#dicionario` redirecionam ao FAQ.
- **GitHub** mantém somente o link do repositório; autenticação e integração foram adiadas.

## Validação

Sem instalar dependências no produto:

```sh
python3 -B -m unittest discover -s .claude/scripts/tests
node .claude/scripts/tests/quality-model.mjs
node .claude/scripts/tests/smoke.mjs --only saude-do-codigo,arquivos,verificar,decisoes,faq
node .claude/scripts/tests/smoke.mjs --only saude-do-codigo,verificar,faq,decisoes --eval-file .claude/scripts/tests/panel-interactions.js
node .claude/scripts/tests/smoke.mjs --eval-file .claude/scripts/tests/panel-measure.js
```

O smoke usa Chromium e Python disponíveis no ambiente. `PANEL_CHROME` e `PANEL_PYTHON` permitem indicar executáveis específicos, inclusive no Windows. O teste de interação usa um perfil de navegador temporário; não cria tarefas nem confirma decisões do usuário. Ele executa a checagem estática de isolamento, registrada no histórico normal do painel.

Na validação de 13/11/2026: 76 testes Python dos módulos suportados passaram, incluindo servidor, agentes, tarefas com fixtures e snapshots. Os testes do modelo de qualidade e os fluxos de interação no navegador passaram. A suíte completa também contém testes de GitHub que dependem de um executável fake Unix e um teste de dados reais que exige mais de 50 tarefas; eles não passam neste ambiente Windows sem esses pré-requisitos. Não foram alterados para esconder essa limitação.

Na medição local de desktop, os recursos comprimidos do painel somaram cerca de 149 KB de JavaScript e 38 KB de CSS por carregamento frio (Commits carrega recursos adicionais sob demanda). O diagnóstico levou aproximadamente 649 ms na amostra. Nas janelas de três segundos com as telas paradas, não houve repetição de análises de qualidade nem execução automática de scripts. Isso é uma amostra local, não um benchmark universal ou uma garantia de uso nulo de CPU. Nenhum pacote ou fonte do produto foi modificado por esta reformulação.

## Atualizar o processo em execução

Alterações estáticas aparecem ao recarregar a página. Mudanças no servidor Python exigem reiniciar o painel:

```sh
docker compose restart painel
```

O contêiner Python do painel não fornece Node, ferramentas de teste ou Claude Code automaticamente. As telas explicam esses pré-requisitos; uma ferramenta indisponível não deve aparecer como teste aprovado.
