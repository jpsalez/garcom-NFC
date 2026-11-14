## C.4 Desenho proposto no documento de módulos para as peças não implementadas 

Esta seção descreve, em prosa, o desenho que o documento de módulos (MOD, seções 12 a 20) propõe para o que ainda não existe: utilitário de token, extensão de tipos e middlewares, notificador de tempo real, serviço de mesas, serviço de sessões, middleware de sessão da mesa, serviço de chamados, tarefa de expiração, relação entre services e rotas. Tudo é **[Proposto] (MOD)** e **[Planejado]**; a duração padrão de sessão do exemplo (3 horas) diverge da v0.2 e v0.3 (4 horas), registrada em DV-03. 
**Antes de implementar.** Os nomes de rotas e de eventos do MOD diferem da v0.3 (DV-37 e DV-38). Os nomes abaixo são os do MOD; a escolha final precisa ser validada. 

_Figura: **Figura C.2** – Ordem de implementação proposta pelo documento de módulos (sete etapas). (Ver seção C.4.9)_ 

### C.4.1 Utilitário de tokens (MOD seção 13.1)  
| Função | Finalidade | Regras |
|---|---|---|  
| generateToken | Gera o token do aparelho. | 32 bytes aleatórios em base64url (cerca de 43 caracteres). Devolvido ao cliente uma única vez. | 
| generatePublicCode | Gera o código público da mesa. | 9 bytes aleatórios em base64url (12 caracteres) no MOD; o guia propõe 6 bytes e 8 caracteres (ver C.5.4). | ``
| hashToken | Calcula o hash do token. | SHA-256 em hexadecimal. É determinístico, o que permite buscar a sessão pelo hash (findByHash); com 256 bits de entropia, força bruta é inviável. Só o hash vai ao banco. |   

### C.4.2 Extensão de tipos, autenticação e papéis (MOD seções 13.2 e 13.3) 

A extensão do tipo de requisição ganharia quatro campos: identificador do usuário, restaurante e papel (preenchidos pela autenticação da equipe) e o contexto da mesa (identificador do token, da sessão e do restaurante, preenchido pelo middleware do cliente). A autenticação da equipe passa a: (1) validar o token JWT dentro de uma proteção de erro, devolvendo 401 com a mensagem "Token inválido ou expirado"; (2) fora dessa proteção, se o token não traz restaurante, responder 403 com "Usuário sem restaurante vinculado" (fora, para que o tratamento de falha de token não o converta em 401); (3) copiar identificador, restaurante e papel para a requisição. O middleware de papéis é uma fábrica: recebe os papéis permitidos e devolve um middleware que responde 403 "Você não tem permissão para isso" quando o papel está ausente ou não consta da lista. Estado atual: o código só preenche o identificador e o middleware de papéis não existe (capítulo 5). 

### C.4.3 Notificador de tempo real (MOD seção 13.4) 

[Implementado em 14/11/2026 com um método só, `toRestaurant`, e `SocketNotifier`; o cliente não usa tempo real, DEC-08.] Desenho original: interface com duas operações: enviar para o restaurante inteiro e enviar para a sessão. A primeira implementação, que apenas escreve no console, é registrada no contêiner como "Notifier", permitindo desenvolver services e testes sem Socket.IO; a implementação final emitiria para as salas do restaurante e da sessão, e o service continuaria idêntico. Regra importante (MOD e GUIA): **emitir somente depois do commit**. 

### C.4.4 Serviço de mesas, perfil ADMIN (MOD seção 14) 

Depende dos repositórios de mesas e de sessões. Não abre nem fecha mesa. O esquema de entrada exige rótulo com espaços aparados, mínimo de um e máximo de 30 caracteres, tanto para criar quanto para renomear.  
| Operação | Regras e validações | Erros | Resposta e efeitos |
|---|---|---|---|  ``
| Criar | Grava a mesa no restaurante do token com código público gerado; o link é a URL do front com /m/ mais o código. | Colisão de código: tratada como conflito [Proposto]. | 201 com a mesa. | 
| Listar | Todas as mesas do restaurante, ordenadas pelo rótulo. | — | 200 com a lista. | 
| Renomear | Busca a mesa (getOrFail) e atualiza o rótulo. | 404 "Mesa não encontrada", inclusive para mesa de outro restaurante (isolamento). | 200 com a mesa. | 
| Desativar | Busca a mesa; se há sessão ativa, recusa; senão marca como inativa. Desativa-se em vez de excluir porque sessões e chamados têm chave estrangeira para a mesa. | 404; 409 "Feche a mesa antes de desativá-la". | 200 com a mesa. | 
| Ativar | Busca e marca como ativa. | 404. | 200 com a mesa. | 
| Regenerar código | Gera novo código público; a plaquinha antiga deixa de funcionar. | 404. | 200 com a mesa; efeito: placas impressas precisam ser trocadas. |   

### C.4.5 Serviço de sessões (MOD seção 15) 

É o único lugar que cria tokens de cliente. Depende dos repositórios de mesas, sessões e tokens e do notificador (e do repositório de chamados no fechamento). Não cria chamados e não valida o token a cada requisição. Duração padrão do exemplo: 3 horas, em constante.  
| Operação | Regras e validações | Erros | Resposta e efeitos |
|---|---|---|---|  
| Abrir sessão (garçom) | (1) A mesa existe, é do restaurante e está ativa; (2) não há sessão ativa; (3) cria sessão com expiração igual a agora mais a duração; (4) notifica o restaurante com o evento de sessão aberta (sessão, mesa, rótulo). Corrida de dois garçons: o índice único parcial faz o segundo falhar e o tratador global converte em 409; a verificação prévia dá a mensagem, o índice dá a garantia. | 404 "Mesa não encontrada"; 409 "Esta mesa já está aberta". | Sessão criada; evento ao balcão. | 
| Entrar (cliente, público) | (1) Busca a mesa pelo código público; ausente ou inativa: erro; (2) sem sessão ativa ou sessão expirada: erro; (3) gera token, grava só o hash; (4) devolve token, rótulo da mesa, nome do restaurante e data de expiração. Um token por aparelho permite contar celulares e registrar quem chamou. | 404 "Mesa não encontrada"; 403 "Mesa fechada. Peça ao garçom para abri-la". | Token em texto uma única vez. | 
| Verificar expiração | Função pura: expirada quando não está em "manter aberto" e a expiração é menor ou igual ao instante atual. Exportada e reutilizada no middleware. | — | Booleano. | 
| Encerrar (garçom) | Busca a sessão do restaurante; se já fechada, recusa; chama o fechamento interno com motivo STAFF e o usuário que fechou. | 404 "Sessão não encontrada"; 409 "Mesa já está fechada". | Fechamento atômico (abaixo). | 
| Expirar sessões (tarefa) | Busca vencidas e não mantidas abertas (todos os restaurantes) e fecha cada uma com motivo TIMEOUT e ninguém como autor. | Falhas individuais devem ser registradas sem derrubar o laço [Proposto]. | Retorna a quantidade fechada. | 
| Manter aberto | Busca a sessão ativa e altera o indicador. A tarefa de expiração ignora sessões mantidas abertas. | 404 "Mesa aberta não encontrada". | Sessão atualizada; atualização opcional do balcão. | 
| Listar ativas | Sessões ativas do restaurante, com rótulo da mesa e contagem de tokens não revogados. | — | Lista para o balcão. |   

**Fechamento interno (atômico).** Dentro de uma transação, e usando os repositórios criados com o cliente transacional: (1) atualizar a sessão para encerrada, com motivo e autor; (2) revogar todos os tokens da sessão com a data atual; (3) cancelar todos os chamados abertos da sessão. Somente depois do commit, notificar o restaurante (sessão fechada, com o identificador) e a sessão (sessão fechada, com o motivo). Por isso o aparelho com aba antiga passa a receber 401. 

### C.4.6 Middleware de sessão da mesa (MOD seção 15) 

Fica no módulo de sessões. Passos: (1) o cabeçalho do token ausente produz 401 "Entre na mesa pelo QR code ou NFC"; (2) busca o token pelo hash do valor recebido; (3) token inexistente ou revogado: 401 "Sua sessão nesta mesa terminou"; (4) sessão não ativa ou expirada (mesma função de expiração): o mesmo 401, pois a tarefa de expiração roda só a cada minuto e esta checagem fecha a janela; (5) preenche o contexto da mesa na requisição. Usa o contêiner para resolver o repositório. No Express 5 um erro lançado em middleware assíncrono é capturado pelo tratador global. 

### C.4.7 Serviço de chamados (MOD seção 16) 

Cliente: criar, cancelar e ver os próprios; balcão: listar abertos e atender. Fluxo de estados: aberto, depois concluído ou cancelado. O contexto da mesa vem do middleware. O repositório de chamados ganha duas operações condicionais ao estado aberto: marcar como concluído (com data e autor) e cancelar por sessão; ambas retornam a contagem de linhas afetadas.  
| Operação | Regras e validações | Erros | Resposta e efeitos |
|---|---|---|---|  
| Criar (cliente) | Lista os chamados abertos da sessão; se existe um do mesmo tipo, recusa; senão cria com restaurante, sessão, token e tipo. Chamar garçom e pedir conta podem coexistir. | 409 "Você já chamou. O garçom está a caminho". | Chamado criado; evento de chamado criado ao restaurante. | 
| Listar meus (cliente) | Chamados da sessão. | — | Lista. | 
| Cancelar (cliente) | Atualização condicional ao estado aberto na sessão; contagem zero significa inexistente ou já tratado. | 404 "Chamado não encontrado ou já atendido". | Evento de chamado cancelado. | 
| Listar abertos (balcão) | Chamados abertos do restaurante, em ordem de chegada, com o nome da mesa. | — | Lista para os cards. | 
| Atender (balcão) | Marca como concluído de forma atômica (restaurante, identificador e estado aberto). Contagem zero: se o chamado não existe, 404; se existe, 409. Vence quem executar primeiro. | 404 "Chamado não encontrado"; 409 "Este chamado já foi atendido". | Evento ao restaurante (concluído, quem concluiu) e à sessão (concluído, tipo) para "garçom a caminho". |   

Garantia no banco: o MOD propõe um índice único parcial por sessão e tipo para chamados abertos (`calls_one_open_per_type`), criado por migração manual (ausente na migração atual; seção 4.5.2). O segundo toque simultâneo gera violação de unicidade, convertida em 409. 

### C.4.8 Tarefa de expiração e regras de conexão entre services (MOD seções 17 e 18) 

**Tarefa.** Um temporizador de 60 segundos, registrado em `main.ts` depois das rotas, resolve o serviço de sessões no contêiner e chama a expiração; se fechou alguma, registra uma linha no log com a quantidade. Deve estar sempre dentro de proteção de erros, registrando "falhou" sem derrubar o processo (erros em temporizador não passam pelo tratador global). Com duas instâncias a tarefa roda duas vezes, o que é inofensivo porque o fechamento é condicional; em sistemas maiores, uma fila (BullMQ) ou um agendador separado. 

**Conexões.** Um service usa o repositório de outro módulo, nunca o service dele: evita dependência circular no contêiner, permite transação com o cliente transacional e evita avisos duplicados. Donos das tabelas: mesas (serviço de mesas); sessões (serviço de sessões); tokens (criados no "entrar" e revogados no fechamento); chamados (serviço de chamados cria, atende e cancela; o serviço de sessões cancela os abertos ao fechar). 

### C.4.9 Rotas planejadas pelo MOD e ordem de implementação  
| Perfil | Rotas (validação onde indicado) |
|---|---|  
| Público | POST /auth/register e /auth/login (validação); POST /public/tables/:code/join. | 
| Admin (autenticado, papel ADMIN) | GET e POST /tables (validação no POST); PATCH /tables/:id (validação); PATCH /tables/:id/deactivate; PATCH /tables/:id/activate; POST /tables/:id/regenerate-code. | 
| Garçom (autenticado) | GET /sessions; POST /tables/:id/sessions; POST /sessions/:id/close; PATCH /sessions/:id/keep-open (validação); GET /calls; PATCH /calls/:id/attend. | 
| Cliente (token da mesa) | POST /me/calls (validação; corpo com tipo WAITER ou BILL); GET /me/calls; DELETE /me/calls/:id. | 
| Módulo de usuários, futuro | POST /users (ADMIN cria STAFF com o restaurante do admin), GET /users, DELETE /users/:id. O registro deve criar restaurante e admin na mesma transação. |   

Ordem proposta (Figura C.2): (1) preparação: renomear a pasta de sessões (hoje com erro de grafia), acrescentar restaurante e papel ao pedido, criar o middleware de papéis e fazer o registro criar restaurante; (2) mesas; (3) sessões do lado do garçom; (4) sessões do lado do cliente: utilitário de tokens, entrar, middleware da mesa e uma rota de teste; (5) chamados: índice parcial e as duas operações condicionais; (6) notificador e tarefa de expiração; (7) Socket.IO. Princípio: implementar um fluxo por vez, pois a dificuldade vem de quatro fatores (dois tipos de login, estado que muda com o tempo, concorrência e tempo real). 

**Uma noite na Mesa 7 (MOD seção 12) [Especificado como exemplo].** O atendente faz login; abre a mesa (sessão com expiração 3 h à frente); o cliente encosta o celular e recebe um token guardado no navegador; um segundo celular recebe outro token (o balcão mostra "2 celulares"); o primeiro toque em "chamar" cria o chamado; o segundo toque é recusado com 409; dois garçons tentam atender e só um vence; pedir conta pode coexistir com o chamado aberto; ao fechar a mesa, tudo é encerrado em transação e a aba antiga recebe 401; reabrir o link sem sessão ativa mostra "Mesa fechada". Não há ainda código para nenhuma dessas etapas além do schema e dos repositórios.
