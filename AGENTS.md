# Instruções do projeto para o Codex

Leia `.claude/CLAUDE.md` para conhecer o projeto, as preferências do usuário e as convenções. A base de conhecimento e os scripts continuam em `.claude/`; consulte `.claude/knowledge/garcom-nfc/00-resumo-e-mapa.md` e use `INDEX.md` para localizar detalhes quando necessário. O código prevalece sobre a documentação.

## Skills (Codex e Claude)
As skills adaptadas para o Codex ficam em `.agents/skills/`. São versões independentes das skills em `.claude/skills/`: ao alterar um fluxo, mantenha as duas versões coerentes.

## PDV
O PDV (Etapas 0 a 6) está implementado. As skills `pdv-*` e os subagentes construtores `.codex/agents/pdv_*.toml` usados no desenvolvimento foram arquivados em `.claude/knowledge/_arquivo/pdv-dev/`, junto com o checkpoint do Codex. Para evoluir o PDV, siga `.claude/CLAUDE.md` e a documentação técnica abaixo.

Documentação técnica do PDV: `.claude/knowledge/garcom-nfc/pdv-00-levantamento.md` até `pdv-06-guia-de-implementacao-e-testes.md`.
Os arquivos em `.claude/agents/` continuam como referências de especialidade (não são subagentes nativos do Codex). Configurações e hooks do Claude não são automaticamente configurações do Codex.
