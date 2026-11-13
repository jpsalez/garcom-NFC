# garcom-NFC

SaaS multi-restaurante: o cliente escaneia QR/NFC e chama o garçom ou pede a conta; o balcão recebe o card em tempo real.
Back-end em `back-end/` (Node + TypeScript com tsx, Express 5, Prisma + PostgreSQL, Zod, tsyringe). Front em `front-end/` (Next.js). Socket.IO e testes ainda não existem.
Resumo e mapa da documentação: `.claude/knowledge/garcom-nfc/00-resumo-e-mapa.md` (índice em `INDEX.md`). O código sempre manda sobre a documentação.

## Como trabalhar comigo
- Responda em português (BR), direto, sem enrolação.
- **Guiar por padrão**: explique, dê o passo a passo e mostre trechos no chat. Eu escrevo o código de domínio para aprender.
- Só implemente quando eu pedir explicitamente, e só o que eu domino e acho repetitivo (auth, hash, JWT, boilerplate).
- "Mostre como seria" = mostrar no chat, sem alterar arquivos.
- Não decida questões de produto pendentes (ver `.claude/knowledge/garcom-nfc/decisoes.md`): apresente opções e consequências e pergunte.
- Não mexa em `back-end/` sem eu pedir. Ferramentas e configs vivem em `.claude/`.

## Modos de trabalho
- **Guia (padrão):** como descrito acima. É o modo em que estou codando na mão.
- **Full IA (só sob pedido):** vale apenas quando eu digitar `/implementar <tarefa>` ou disser explicitamente "modo IA". Segue o ciclo da skill: plano aprovado, testes primeiro, branch `ia/<tarefa>`, `verify` + `check_tenant`, um revisor, commit local. Nunca push, merge ou PR sem pedido. Termina a tarefa e volta ao modo Guia.
- O ambiente para o modo Full IA (testes, lint, banco de teste, seed, CI) está pronto em `.claude/ai-mode/` e desligado. Ligar: `/modo-ia ligar`. Tudo é reversível.

## Meu estilo de código (simples)
- Funções pequenas, uma responsabilidade por arquivo, nomes diretos em inglês no código e comentários curtos em português só onde o motivo não é óbvio.
- Sem abstração antecipada: nada de camada, helper ou genérico que ainda não tem 2 usos.
- Sem comentário que repete o código. Sem `try/catch` no controller: lance erro e o `errorHandler` responde.
- Camadas: controller (HTTP) → service (regra) → repository (Prisma). Controller não conhece Prisma; repository não tem regra.
- Erros: subclasses de `AppError` (`NotFoundError`, `ConflictError`...). Uma mensagem para "não existe" e "senha errada" quando isso evitar vazar informação.

Exemplo bom (é assim que gosto):
```
async login(credentials) {
  const user = await this.userRepository.findByEmail(credentials.email);
  const valid = user ? await comparePassword(credentials.password, user.password_hash) : false;
  if (!user || !valid) throw new UnauthorizedError("E-mail ou senha inválidos");
  return { token: signToken({ sub: user.id, restaurantId: user.restaurant_id, role: user.role }), user: publicUser(user) };
}
```
Evite: classes base genéricas, factories para tudo, interfaces com um único método sem motivo, funções com mais de ~25 linhas, parâmetros booleanos soltos.

## Convenções do projeto
- Imports com extensão `.ts`; `reflect-metadata` primeiro no `main.ts`.
- Container tsyringe com tokens de texto (`"AuthService"`); classes `@injectable()` recebem interfaces.
- Todo método de repository de dados de restaurante recebe `restaurantId` como **primeiro** parâmetro e filtra por ele. O `restaurantId` vem do JWT, nunca do cliente.
- Escritas múltiplas em transação (repositories aceitam `DbClient`/`tx`).
- Entrada sempre validada com Zod. Nunca registrar senha ou token em log.
- Índices parciais são criados na migration à mão: nunca aceitar um `migrate dev` que os remova.

## Definição de pronto
1. `python3 .claude/scripts/verify.py` passa (typecheck e, quando existirem, lint e testes).
2. `python3 .claude/scripts/check_tenant.py` sem ponto novo.
3. Regra de negócio coberta por teste (quando a suíte existir).
4. `python3 .claude/scripts/doc_drift.py` sem diferença nova, ou documentação atualizada (`/sincronizar-docs`).

## Ferramentas (sob demanda, nunca automáticas)
- Scripts em `.claude/scripts/` (só leitura): `verify.py`, `check_tenant.py`, `routes_inventory.py`, `doc_drift.py`, `repo_map.py`. Prefira rodar um script a explorar o código arquivo por arquivo.
- Agentes em `.claude/agents/` (orquestrador: `claude --agent garcom-orquestrador`). Skills: `/novo-modulo`, `/nova-rota`, `/revisar`, `/verificar`, `/sincronizar-docs`, `/modo-ia`, `/implementar`, `/monitor`.
- Painel de controle: `python3 .claude/scripts/painel.py` (http://127.0.0.1:8765): agentes, git, arquivos, tarefas e decisões. Estrutura e verificações em `.claude/scripts/static/README.md`.
- Modelos de pedido em `.claude/prompts.md`.
- Subir a aplicação: `docker-compose.yml` na raiz (PostgreSQL + API + front + banco de teste opcional); rode na raiz; não precisa de `.env` (o compose traz um `JWT_SECRET` só de desenvolvimento; modelo em `back-end/.env.example`).
