# Apêndice B. Glossário  
| Termo | Definição |
|---|---|  ``
| Atendimento | Período em que uma mesa está ocupada; no banco, uma linha de table_sessions. Começa conforme DV-01 e termina ao encerrar ou após 4 h. | ``
| Sessão (de mesa) | Sinônimo técnico de atendimento. Também chamada de table_session. | 
| ACTIVE, CLOSED | Estados da sessão (ATIVO e ENCERRADO nos diagramas em português). | ``
| Balcão | Tela (/balcao) aberta em um computador, usada pelos garçons; também o papel STAFF. | 
| BILL | Tipo de chamado "pedir a conta" (exibido como "Fechar conta"). | 
| BOLA / IDOR | Acesso a objeto de outro tenant trocando o identificador; evitado filtrando por restaurante e respondendo 404. | 
| Card | Item da tela do balcão que representa um chamado aberto. | 
| Chamado (call) | Pedido de garçom ou de conta feito pela mesa; estados OPEN, DONE e CANCELLED. | 
| CANCELLED | Estado de chamado cancelado por encerramento ou expiração do atendimento (ou, no desenho de módulos, pelo cliente). | 
| Check-then-act | Padrão de verificar e depois agir, sujeito a condição de corrida; resolvido por restrição no banco. | ````
| Código público (public_code) | Código aleatório e único da mesa, usado na URL /m/[code] do QR Code e do NFC. | 
| Controller, Service, Repository | Camadas do back-end: HTTP, regras de negócio e acesso ao banco, respectivamente. | 
| DONE | Estado de chamado finalizado no balcão. | ````
| DbClient | Tipo que aceita o cliente do Prisma ou o cliente de transação, permitindo usar repositórios dentro e fora de $transaction. | 
| Docker Compose | Orquestração dos contêineres web, api e db (planejada). | 
| Expiração preguiçosa (lazy) | Verificação de validade da sessão a cada requisição, complementar ao job. | 
| Índice único parcial | Índice de unicidade com cláusula WHERE; garante uma sessão ACTIVE por mesa. | 
| JWT | Token assinado com dados (sub, restaurantId, role) usado por Admin e balcão. | 
| Job de expiração | Rotina periódica (60 s) que encerra atendimentos vencidos sem "manter aberto". | 
| KDS | Kitchen Display System, tela da cozinha (futuro). | ``
| keep_open / manter aberto | Marca que impede a expiração de 4 h; só o balcão encerra. | 
| LGPD | Lei Geral de Proteção de Dados; o cliente é anônimo. | 
| MVP | Produto mínimo: chamar garçom ou pedir a conta, card no balcão, finalizar, encerrar, expirar. | 
| NFC | Comunicação por aproximação; a etiqueta grava a mesma URL do QR Code. | 
| OPEN | Estado de chamado aberto, com card na tela. | 
| P2002, P2025 | Códigos de erro do Prisma: violação de unicidade (409) e registro não encontrado (404). | 
| Prisma | ORM com tipos gerados e migrations versionadas. | 
| RBAC | Controle de acesso por papel (ADMIN, STAFF). | ``
| Revogação | Preenchimento de revoked_at em tokens para invalidá-los imediatamente. | ````
| Sala (room) | Grupo de conexões Socket.IO que recebe um evento (balcao, session). | 
| scrypt | Algoritmo de hash de senha usado no código. | 
| Slug | Nome do restaurante em formato de URL, único. | 
| Socket.IO | Biblioteca de comunicação em tempo real com reconexão e salas. | 
| STAFF / ADMIN | Papéis de usuário: balcão e dono do restaurante (ADMIN é o nome no código atual). |
| SUPER_ADMIN / OWNER | [Especificado, não implementado] SUPER_ADMIN: dono da plataforma, sem restaurante. OWNER: dono de um restaurante, substitui o ADMIN (DV-48). | ``
| Tenant | Cada restaurante cliente do SaaS; isolamento por coluna restaurant_id. | 
| Token do aparelho | Chave opaca e aleatória guardada no celular, ligada ao atendimento; só o hash fica no banco. | ``
| TIMEOUT, STAFF | Motivos de fechamento da sessão (closed_reason): tempo ou balcão. | ``
| TTL | Tempo de vida; TABLE_SESSION_TTL = 14400 s. | 
| WAITER | Tipo de chamado "chamar garçom". | 
| Zod | Biblioteca de validação de entrada. |
