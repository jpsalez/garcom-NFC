## C.5 Propostas do guia de estudos ainda não implementadas 

O guia (GUIA) é material didático; tudo é **[Proposto]** e **[Planejado]**, e foi conferido contra o código. Ele declara que hash de senha, JWT, Express, Zod, Prisma básico e injeção de dependência já estão prontos. 

### C.5.1 Cadastro com criação de restaurante em transação e slug (GUIA §3) 
 
- **Problema.** Sem transação, se a criação do restaurante tem sucesso e a do usuário falha (e-mail repetido, queda), sobra um restaurante órfão. A transação garante atomicidade, consistência, isolamento e durabilidade. 
- **Três formas no Prisma.** Escrita aninhada (um create do pai com o filho; já transacional, ideal para o cadastro quando não há lógica no meio); transação em lote (consultas independentes); transação interativa (função com o cliente transacional; erro causa desfazer, fim causa confirmar). 
- **Aplicação ao projeto.** O tipo do cliente do banco aceita o cliente normal ou o transacional, "pensado exatamente para isso": dentro da transação instanciam-se os repositórios de restaurante e usuário com o cliente transacional. O service precisaria injetar o cliente do banco para abrir a transação (com conversão de tipo). 
- **Fluxo proposto do cadastro.** Hash da senha fora da transação (é lento); criar o restaurante com o slug; criar o usuário ADMIN com o identificador do restaurante; devolver o usuário sem hash. Regra do corpo: o esquema de entrada ganharia o nome do restaurante. 
- **Regras de ouro.** Transações curtas; usar somente o cliente transacional lá dentro; tempo limite padrão de 5 segundos; efeitos externos (tempo real, e-mail) apenas depois do commit. 
- **Slug.** Transformar o nome em forma de URL: normalizar, remover acentos, minúsculas, trocar não alfanuméricos por hífen e aparar hífens ("Bar do Zé" vira "bar-do-ze"). Nomes iguais colidem (unicidade): sufixo aleatório curto ou captura do erro de unicidade e nova tentativa com sufixo. 
- **Estado do código.** O registro cria só o usuário ADMIN, sem restaurante, sem transação e sem slug (DV-15); a função de slug não existe; há um aviso no código sobre separar a criação de outros usuários.  

### C.5.2 Papéis, escopo de tenant e regras que a role não cobre (GUIA §1 e §2) 
 
- **Multi-tenancy por coluna.** Identificador de restaurante sempre do token, nunca do corpo; repositórios recebem o restaurante como primeiro parâmetro; recurso de outro restaurante responde 404 (não 403, para não confirmar existência). Exceções legítimas: login, rota pública da plaquinha e tarefa de expiração. 
- **Papéis e status.** 401 quando não se sabe quem é; 403 quando se sabe e não pode; 404 quando não existe para o usuário. Princípio do menor privilégio: rota nova nasce restrita a ADMIN; o papel do funcionário é fixado no servidor. 
- **Regras que o papel não cobre.** Último administrador (contar; se for um, recusar com 409 ao apagar ou rebaixar); apagar a si mesmo (decidir); usuário apagado com JWT ainda válido por até um dia; papel alterado com token antigo. Soluções propostas: tokens curtos (15 minutos) com renovação, ou consultar o banco a cada requisição. 
- **Opcionais.** Row Level Security do PostgreSQL e extensões do cliente Prisma que injetem o restaurante. 
- **Teste de aceitação.** Admin do restaurante A tenta ler, alterar e apagar mesa do B: três 404 e mesa intacta. Estado: `restaurantId` e papel não são propagados ao pedido (DV-17).  

### C.5.3 Concorrência e índices únicos parciais (GUIA §4) 

Verificar e depois agir é condição de corrida; nenhum teste condicional resolve, só o banco, que enxerga as duas operações em ordem. O índice único parcial (unicidade somente entre linhas que atendem uma condição) já existe para sessão ativa por mesa; falta o análogo para chamados abertos por tipo e sessão. Criação: migração apenas gerada, edição manual do SQL, depois aplicar, com comentário no schema. O padrão "achar ou criar" seguro tenta criar e trata a violação de unicidade, devolvendo a sessão existente. O isolamento padrão do PostgreSQL (Read Committed) não protege a verificação prévia mesmo dentro de transação; alternativas, mais difíceis, são isolamento serializável com nova tentativa ou bloqueio explícito da linha. Erros comuns: usar busca única com campos do índice parcial (o Prisma só aceita unicidades do schema; o repositório já usa busca do primeiro registro) e engolir qualquer erro (tratar só a violação de unicidade). Exercício: dez aberturas simultâneas resultam em exatamente uma sessão ativa. 

### C.5.4 Códigos públicos e tokens opacos (GUIA §5)  
| Item | Proposta | Observação |
|---|---|---|  
| Código da mesa | 6 bytes aleatórios em base64url: 48 bits, 8 caracteres. | Mil tentativas por segundo levariam cerca de 9 mil anos. O MOD propõe 12 caracteres (divergência a validar). Nunca usar identificadores sequenciais em URL pública. | 
| Token do cliente | Opaco: 32 bytes aleatórios, base64url (256 bits); guardado como hash. | O JWT valida sem consultar o banco, mas não se revoga de imediato; o cliente precisa perder acesso no instante em que o garçom fecha a mesa. | 
| Hash do token | SHA-256, determinístico. | Senha usa scrypt porque é humana e previsível; o token tem entropia alta, e um hash lento só deixaria a requisição lenta. O hash determinístico permite buscar por ele. | 
| Validação | Calcular o hash, buscar com a sessão e checar a revogação. | Falha: 401 "Sessão encerrada" (MOD usa outras mensagens). |   

### C.5.5 Máquinas de estado, assertivas de transição e expiração (GUIA §6) 
 
- **Estados.** Sessão: ACTIVE para CLOSED (motivo STAFF ou TIMEOUT). Chamado: OPEN para DONE ou para CANCELLED; DONE e CANCELLED são finais. 
- **Assertiva de transição.** Um mapa de transições permitidas (OPEN leva a DONE ou CANCELLED; DONE e CANCELLED não levam a nada) e uma função de verificação que lança conflito 409 com mensagem do tipo "Chamado não pode virar outro estado" quando a mudança não está no mapa. 
- **Atomicidade.** Validar e gravar não é atômico. A solução é a atualização condicional: o filtro inclui o estado esperado; se a contagem for zero, 409 "Chamado já atendido ou cancelado". O banco trava a linha, e o segundo executor encontra DONE. Técnica chamada de concorrência otimista; exige método novo no repositório (o atual não filtra por status). 
- **Fechar mesa.** Transação interativa: atualização condicional da sessão (contagem zero: 409 "Sessão já está fechada"), revogar tokens, cancelar chamados abertos; só depois emitir o evento. 
- **Expiração em duas camadas.** (1) Preguiçosa: a cada requisição do cliente, se a expiração passou, 401 (segurança mesmo se a tarefa falhar); (2) agendada: temporizador de 60 s ou agendador cron que fecha de verdade, revoga e cancela. Cuidados: fechamento condicional (o garçom pode fechar no mesmo segundo), proteção de erros e registro, e duas instâncias não causam estrago. 
- **Manter aberto.** Ignorado pela busca de vencidas e pela camada preguiçosa. Alternativa proposta: renovar a expiração a cada chamado ("3 horas depois da última atividade"). 
- **Lacunas.** A sessão não tem data de abertura nem de fechamento; o chamado cancelado não registra quando nem por quem.  

### C.5.6 Cookie de sessão de mesa, CORS e rate limit nas rotas públicas (GUIA §7 e §8)  
| Tema | Proposta [Proposto] | Pontos de atenção |
|---|---|---|  
| Onde guardar o token do cliente | Cookie httpOnly, para que o script da página não o leia (risco de XSS baixo). Equipe continua com JWT no cabeçalho. | Cookie traz CSRF, mitigado por SameSite Lax; a v0.3 e o MOD preferem o armazenamento local com cabeçalho (DV-21). | 
| Atributos do cookie | httpOnly; Secure (desligado em desenvolvimento sem HTTPS); SameSite Lax; validade igual à sessão; caminho restrito às rotas públicas. | Duração fixa de 3 h pode terminar antes da sessão mantida aberta; confirmar que o caminho cobre todas as rotas do cliente. | 
| Dependência | Analisador de cookies no servidor. | Ausente no projeto. | 
| CORS | Pacote de CORS com lista explícita de origens e credenciais habilitadas; no front, requisições com credenciais incluídas. | Nunca curinga com credenciais. Origem é protocolo, domínio e porta; front e API em portas diferentes são origens distintas. Planejar front e API sob o mesmo domínio (mesmo site), senão SameSite Lax não envia o cookie. | ``
| Rate limit nas rotas públicas | Janela de 60 s com 30 requisições por IP, cabeçalhos padrão e resposta 429, aplicado ao prefixo /public. | Clientes no mesmo Wi-Fi compartilham IP; não apertar demais. Atrás de proxy, habilitar a confiança no primeiro proxy para ler o IP real. | 
| Rate limit no login | Limite mais apertado (cerca de 5 tentativas em 15 minutos). | Hoje inexistente; sem proteção contra força bruta. | 
| Defesa em camadas | Mesa só abre pelo garçom; expiração e revogação; um chamado aberto por tipo; rate limit; código aleatório; tag NFC travada. | Cada camada cobre um abuso diferente. |   

Estado do código: nem as bibliotecas de cookie, CORS e rate limit estão instaladas; o servidor só habilita leitura de JSON. 

### C.5.7 Tempo real, QR Code, NFC e teste no celular (GUIA §9 a §11) 
 
- **Socket.IO.** Compartilhar o servidor HTTP com o Express; autenticar a conexão pelo mesmo JWT; salas por restaurante como isolamento do tempo real; emitir apenas após o commit. Padrão "estado inicial e eventos": ao conectar e reconectar, carregar a lista por REST, pois eventos perdidos não são reenviados. O token do socket só é verificado na conexão (aceitável). 
- **QR Code.** Pacote de geração; URL igual à base pública do front, `/m/` e o código; saída SVG para impressão e imagem em dados para tela; rota GET /tables/:id/qrcode para ADMIN, com tipo de conteúdo SVG; a base vem de variável de ambiente (`PUBLIC_APP_URL`; a v0.3 usa o nome `PUBLIC_WEB_URL`). 
- **NFC.** Tags passivas com registro de URL; NTAG213 (144 bytes, suficiente), NTAG215 (504), NTAG216 (888, desperdício) e NTAG 424 DNA (URL dinâmica, anti-cópia). iPhone XS ou posterior lê em segundo plano; Android exige NFC ligado e tela desbloqueada; manter um QR na plaquinha. Gravar com um aplicativo de gravação, testar em outro celular e **só depois travar** (a trava é permanente); sem trava qualquer pessoa pode regravar com link falso. Web NFC é desnecessário. 
- **Teste no celular.** O endereço local do computador não é o do celular. Opção 1: IP da rede local (mesmo Wi-Fi; firewall pode bloquear; cookie Secure não funciona em HTTP, então Secure só em produção). Opção 2 (recomendada): túnel com HTTPS (cloudflared ou ngrok), que funciona em 4G, mas muda a URL nos planos gratuitos, portanto só com tags de teste. Depuração: inspeção remota no Android, Safari no Mac para iPhone.  

### C.5.8 Testes automatizados (GUIA §12) 

Motivo: falhas em isolamento, permissão, concorrência e transição de estado são silenciosas. Ferramentas propostas: Vitest e supertest. Preparação: separar a criação do app da abertura da porta (hoje o servidor abre a porta ao ser importado e as rotas só são plugadas depois, no bootstrap), banco de teste separado com variável própria, migrações aplicadas e tabelas limpas antes de cada teste. Casos de maior valor: A não lê, edita nem apaga dado de B; STAFF recebe 403 em toda rota de ADMIN; dez aberturas simultâneas geram uma só sessão; dois atendimentos simultâneos resultam em 200 e 409; token de mesa fechada responde 401; cadastro com e-mail repetido responde 409 sem restaurante órfão. Estado: o script de teste é só um marcador e nenhuma dessas ferramentas está instalada. 

### C.5.9 Ordem de implementação por fase (GUIA, tabela de abertura)  
| Fase do roteiro | Tópicos de estudo | Dificuldade | Estado no código |
|---|---|---|---|  
| 1 Middleware de papéis | Multi-tenancy; autorização | Baixa | Não iniciado | 
| 2 Cadastro com restaurante | Transações | Média | Não feito; registro cria só o usuário | 
| 3 CRUD de funcionários | Multi-tenancy; autorização | Média | Não iniciado; repositório existe | 
| 4 CRUD de mesas | Multi-tenancy; códigos aleatórios | Média | Repositório pronto; service, controller e schemas vazios | 
| 5 Abrir e fechar mesa | Concorrência; estados e expiração | Alta | Só repositórios | 
| 6 Chamados do lado do balcão | Concorrência; estados | Média | Só repositório; falta operação condicional e índice | 
| 7 Fluxo do cliente | Tokens opacos; cookies e CORS; abuso | Alta | Nada | 
| 8 Tempo real | WebSockets | Alta | Nada | 
| 9 Plaquinhas | NFC e QR; teste no celular | Baixa | Nada | 
| Durante tudo | Testes automatizados | Média | Nada |   
**Divergências em relação ao código atual.** O guia afirma que o erro de registro não encontrado "cairia como 500" no tratador global, mas o código já mapeia P2025 para 404 e P2002 para 409; o guia usa o erro base com status direto, enquanto o código prefere subclasses; propõe `app.ts` separado, que o código não tem (existe `server.ts` que já abre a porta); admite o e-mail único globalmente sem discutir que o mesmo e-mail não pode servir a dois restaurantes. Esses pontos já aparecem no Apêndice A; aqui servem para evitar implementar o guia ao pé da letra.
