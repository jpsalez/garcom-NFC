---
name: sincronizar-docs
description: Atualiza a base de conhecimento (.claude/knowledge) para refletir o código atual e lista o que o PDF consolidado perdeu. Uso: /sincronizar-docs
disable-model-invocation: true
---

1. Rode `python3 .claude/scripts/doc_drift.py` e `python3 .claude/scripts/routes_inventory.py`.
2. Se houver diferenças, acione `garcom-doc-sync` passando a saída dos scripts (ele edita só `.claude/knowledge/garcom-nfc/`). Se não houver, diga "documentação em dia" e pare.
3. Informe quais capítulos mudaram e que o PDF /home/jpsalez/Downloads/Documentacao-Tecnica-garcom-NFC.pdf só é regerado se o usuário pedir.
4. Se o usuário tiver resolvido uma decisão pendente, registre em `decisoes.md`.
