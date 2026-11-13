---
name: implementar
description: Modo Full IA: implementa uma tarefa de ponta a ponta (plano, testes primeiro, código, verificação, revisão) em branch própria. Só roda por pedido explícito. Uso: /implementar <tarefa>
disable-model-invocation: true
---

Tarefa: $ARGUMENTS. Este comando é a autorização explícita do usuário para ESCREVER código em back-end/ nesta tarefa (e só nela).

Pré-condições (pare e pergunte se falhar):
1. `python3 .claude/scripts/ai_mode.py status` mostra testes e banco de teste prontos. Se não, proponha `/modo-ia ligar` e espere.
2. Decisões de produto que a tarefa toca estão em `.claude/knowledge/garcom-nfc/decisoes.md` na seção "Decididas". Se não, apresente as opções e a sugestão, e espere a escolha. Nunca assuma.
3. `git -C back-end status --short` está limpo. Se houver mudanças do usuário, NÃO as misture: peça para ele commitar/guardar ou confirmar que posso trabalhar por cima.
4. O banco de teste sobe (`npm run test:db:up`). Se o Docker negar permissão, pare e avise.

Ciclo:
1. Plano curto (arquivos, regras, erros). Para trabalho novo de domínio acione `garcom-arquiteto` e/ou `garcom-fluxos`/`garcom-dados` (1 chamada cada, briefing curto). Espere o "ok" do usuário.
2. Crie a branch `ia/<slug-da-tarefa>` em back-end/ (não use `main`).
3. Escreva PRIMEIRO os testes (cenários das regras RN e isolamento por tenant), rode e veja falhar pelo motivo certo.
4. Implemente no estilo do `CLAUDE.md` (simples, camadas, `restaurantId` primeiro, sem try/catch no controller). Menor mudança possível; não refatore o que não foi pedido.
5. Rode `python3 .claude/scripts/verify.py`, `check_tenant.py` e `routes_inventory.py`. Corrija até passar. Se falhar 3 vezes pelo mesmo motivo, pare e explique.
6. Acione UM `garcom-revisor` com os arquivos alterados e a saída dos scripts. Corrija achados de gravidade alta/média.
7. Commit local na branch, mensagem curta no imperativo. NÃO faça push, merge nem abra PR sem pedido.
8. Rode `/sincronizar-docs` se rotas, tabelas ou regras mudaram.

Relatório final (máx. 10 linhas): o que mudou (arquivos), testes novos e resultado, pontos para o usuário revisar com atenção (segurança/tenant), e como desfazer (`git -C back-end checkout <branch-anterior>`).
