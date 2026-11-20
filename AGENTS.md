# Instruções do projeto para o Codex

Leia `.claude/CLAUDE.md` para conhecer o projeto, as preferências do usuário e as convenções. A base de conhecimento e os scripts continuam em `.claude/`; consulte `.claude/knowledge/garcom-nfc/00-resumo-e-mapa.md` e use o índice para localizar detalhes quando necessário. O código prevalece sobre a documentação.

As skills adaptadas para o Codex ficam em `.agents/skills/`. São versões independentes das skills em `.claude/skills/`: ao alterar um fluxo, mantenha as duas versões coerentes. Os arquivos em `.claude/agents/` são referências de especialidade, não agentes automaticamente disponíveis no Codex. Configurações e hooks do Claude não são automaticamente configurações do Codex.
