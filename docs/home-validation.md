# Home Psiu: fluidez e responsividade

Página: `/home`, em `front-end/app/(site)/home/page.tsx`.
Base: `dev` atualizada por fast-forward para `46a66bd`, sem alterações locais anteriores.

## Diagnóstico e alterações

- O hero tinha `100svh` mais uma fixação de `45vh`. A animação era temporal, portanto essa distância adicional não controlava a narrativa. A fixação foi removida.
- A rolagem com roda passava pelo Lenis, com interpolação. A home agora usa rolagem nativa, incluindo teclado e toque. Âncoras usam `scrollIntoView`, compensam o cabeçalho e transferem o foco à seção.
- A sequência NFC passou de 3,5 para 2,6 segundos; o início automático ocorre após 0,8 segundo. O espaço acima da segunda seção também foi reduzido.
- O shader já usava meia resolução, sem multiplicar por DPR. Agora também limita o canvas a 960 × 720 pixels, renderiza a até 60 fps e usa duas oitavas e até 30 fps em aparelhos com poucos núcleos ou pouca memória. A resolução diminui após atrasos sustentados na cadência de requestAnimationFrame e se recupera lentamente após estabilizar, inclusive em monitores que já atingiram o teto de pixels. Isso não mede o tempo de GPU diretamente; não foi possível coletar um perfil de GPU nesta sessão.
- O loop WebGL é cancelado fora da tela e com a aba oculta. Shaders, programa, buffer, observadores e listeners são liberados. Falha de compilação ou perda de contexto mantém o gradiente estático.
- Movimento reduzido desliga o fundo WebGL e as animações decorativas. Alterações dessa preferência com a home aberta recriam os efeitos com limpeza dos anteriores.
- Títulos, FAQ, pacotes e chamadas para ação receberam entradas leves. Cartões e planos mantêm as animações existentes, com transições mais curtas e microinterações.
- Em retrato e em telas baixas, o hero cresce com o conteúdo em vez de recortá-lo. Foram ajustados botões, grids, preços, tabelas, mockups e o menu móvel com rolagem própria, Escape e navegação de foco.

## Verificações automatizadas

Na pasta `front-end`:

```text
node --test tests/landing-background.test.mjs
node --test tests/landing-hero.test.mjs
node --test tests/landing-render-budget.test.mjs
npm.cmd run typecheck
npm.cmd run build
```

Os testes usam o efeito real com APIs de GPU e de visibilidade simuladas. Não substituem renderização em uma GPU real ou testes de layout.

## Referência Estheet

Análise do HTML, CSS e bundle JavaScript públicos de [Estheet](https://estheet.com/), em 19/11/2026. O navegador não foi utilizado para medir FPS ou experimentar os gestos do site. O código servido indica um canvas fixo, navegação por capítulos com amortecimento temporal, entradas e saídas de texto com opacidade, deslocamento e desfoque, e adaptação da resolução conforme a cadência dos frames.

Aplicação ao Psiu: preservar rolagem nativa, sincronizar uma saída discreta do hero e o movimento do shader, repetir entradas suaves ao revisitar títulos e cards, corrigir a cadência do limitador de frames e adaptar a resolução sob atraso sustentado. O shader continua único e leve; as entradas usam transform e opacidade. A borda decorativa dos planos pausa fora da tela e na aba oculta. Não foram adotados o bloqueio da rolagem nem o desfoque de grandes áreas usados pela referência.

## Validação visual pendente

### Escala para notebooks

Foi adicionada uma faixa compacta para viewports em paisagem de 901 a 1536 px de largura, e também para desktops com até 800 px de altura útil. A escala acompanha a área disponível em CSS, sem depender das polegadas físicas ou detectar o aparelho. Fontes de destaque usam largura e altura como limites; textos de leitura continuam em 16 px ou mais. A cena NFC tem largura máxima de 460 px, limitada também a 58% da altura útil, e as plaquinhas a 360 px/50% da altura. Cards, planos, FAQ e rodapé têm espaçamentos menores nessa faixa.

Acrescentar à conferência visual: 1024 × 600, 1280 × 720, 1366 × 768, 1440 × 800 e 1536 × 864, inclusive com zoom de 125% e 150%. Verificar se o conteúdo continua acessível ao aumentar o tamanho de texto. A comparação visual no navegador continua pendente.

A navegação pelas setas do teclado voltou à rolagem nativa, sem salto entre seções. O texto de O produto voltou a acender conforme a rolagem. O foco programático das âncoras não desenha contorno na seção. A cena do celular reverte ao retornar ao hero ou ao topo e reproduz novamente ao rolar para baixo, mantendo a pausa por visibilidade e o modo de movimento reduzido. Testes com callbacks simulados cobrem ciclos sucessivos de ida e volta; a aparência e os eventos reais do navegador continuam pendentes.

O controle do Chrome encerrou a inspeção porque não conseguiu confirmar a URL atual. Nenhuma das resoluções abaixo foi validada visualmente nesta sessão.

| Viewport | Conferir |
| --- | --- |
| 320 × 568 | Botões, pacotes, mockups, títulos e largura do documento |
| 375 × 667 | Cena completa, âncoras e menu móvel |
| 768 × 1024 | Composição em retrato e grids |
| 1024 × 768 | Hero em duas colunas e menu |
| 1440 × 900 | Narrativa NFC, segunda seção e animações de entrada |
| 1920 × 1080 | Limite de largura do conteúdo e nitidez do canvas |
| 667 × 375; 1024 × 480; 320 × 480 | Paisagem e pouca altura, sem texto ou controles recortados |

Em cada tamanho, verificar ausência de rolagem horizontal e sobreposição. Testar roda, trackpad, setas, PageDown, Espaço, Tab e Shift+Tab, além de toque em aparelho real. A segunda seção deve aparecer durante a primeira rolagem, sem esperar a cena terminar. Abrir o menu, navegar por teclado e fechar com Escape; testar também sua rolagem em paisagem.

Ativar movimento reduzido antes de abrir a página e alternar a preferência com a página aberta: texto e controles devem continuar visíveis, sem fundo animado ou entradas. No painel de desempenho do navegador, verificar pausa do WebGL ao sair do hero e trocar de aba. Repetir em aparelho modesto para avaliar a qualidade visual e o custo reais.
