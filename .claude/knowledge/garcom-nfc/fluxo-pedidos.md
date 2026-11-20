# Apêndice E. Fluxo de pedidos à mesa

O garçom acompanha os pedidos em **Chamados** junto com as solicitações de atendimento e conta. Cada unidade tem sua própria etapa, então um pedido pode aparecer em **Na cozinha** e **Para servir** ao mesmo tempo.

| Ação | Cozinha | Chamados |
|---|---|---|
| Cliente envia | Entra em **Novos** | Alerta de novo pedido e entra em **Na cozinha** |
| Cozinha inicia o preparo | Passa para **Em preparo** | Mostra as unidades em preparo |
| Cozinha marca como pronto | Passa para **Aguardando garçom** | Alerta de lote pronto e entra em **Para servir** |
| Unidades prontas aguardam 5 min | Destaca o cartão em vermelho | Destaca o cartão e repete o aviso sonoro a cada 2 min |
| Garçom registra a entrega | Remove as unidades entregues da fila | Remove da fila de entrega e inclui no histórico quando encerra |

## Responsabilidades

| Papel | Ação e acompanhamento |
| --- | --- |
| Cliente | Envia pelo cardápio e o pedido entra direto em **Novos** na cozinha. A tela da mesa informa quantidades aguardando, em preparo, prontas, entregues ou canceladas, inclusive com o cardápio fechado. **Meus pedidos** detalha os pedidos enviados pelo aparelho. |
| Cozinha | **Iniciar preparo** movimenta apenas as unidades pendentes. **Pronto** libera apenas as unidades em preparo. Em **Aguardando garçom**, acompanha as unidades prontas e o tempo de espera, com cartão em vermelho ao atingir cinco minutos. |
| Garçom | Recebe avisos visuais e sonoros de novos pedidos e novos lotes prontos. **Na cozinha** mostra etapa, itens e tempo desde o envio. **Para servir** ordena pela unidade pronta mais antiga de cada pedido e mostra o tempo desde que ficou pronta. Após servir os itens listados, toca **Entregue** para registrar todas as unidades prontas no cartão. Unidades em preparo continuam na cozinha. |
| Garçom, gerente ou proprietário | Pode cancelar unidades abertas em **Detalhes e cancelamento**, com motivo obrigatório. **Entregues recentes** mostra os dez últimos encerramentos, entregues ou cancelados, com detalhes dos itens. Gerente e proprietário também podem operar o painel da cozinha. |

A antiga rota **Pedidos** redireciona para **Chamados**. Um pedido com entregas e cancelamentos aparece como **Entregue** quando todas as unidades forem resolvidas. **Cancelado** indica que todas foram canceladas.

## Horários, alertas e sincronização

- A API da equipe retorna `ready_since`, o horário do lote pronto mais antigo que ainda tem unidades disponíveis, e `ready_sequence`, a sequência do lote disponível mais recente. O cálculo usa os eventos de entrada em READY e o saldo por item. Entrega ou cancelamento consome primeiro as unidades mais antigas daquele item. Os campos são nulos quando nenhuma unidade está pronta.
- O relógio de **Para servir** e **Aguardando garçom** usa `ready_since`. Novas unidades prontas não reiniciam a espera das que já estavam prontas. Chamados toca o aviso de atraso ao atingir cinco minutos e repete a cada dois minutos enquanto a unidade mais antiga do pedido continuar atrasada. O botão de som também controla os avisos de pedidos novos, prontos e chamados. O navegador libera o áudio após interação com a página.
- Cozinha e Chamados reconciliam a fila via REST ao receber `order:created` e `order:updated`, ao recuperar foco ou conexão e a cada 15 s enquanto visíveis. Os avisos de novo ou pronto comparam snapshots sucessivos. A carga inicial é silenciosa. Chamados consulta `GET /api/v1/orders?progress=closed&limit=10`, ordenado por horário do encerramento e ID decrescentes.
- A entrega envia as unidades reservadas pela versão exibida. Se o pedido mudar antes da confirmação, a equipe vê o saldo ainda disponível da ação original e pode confirmar ou descartar.
- A tela da mesa consulta `GET /api/v1/public/orders` com `X-Table-Token` na entrada, ao voltar para a aba e após enviar. Enquanto houver pedidos abertos na página retornada ou erro transitório, consulta a cada 10 s com a aba visível. Se a sessão expirar, oferece reinício do atendimento.
