#!/usr/bin/env python3
"""Migra .claude/painel/tasks.json para o esquema novo (campos em português), faz a triagem e move as decisões (DEC-xx)
para o decisoes.md. Por padrão só MOSTRA o diff; grave com --aplicar (o original vai para tasks.backup.json).

  python3 .claude/scripts/migrar_tarefas.py            # mostra o que mudaria
  python3 .claude/scripts/migrar_tarefas.py --aplicar  # grava tasks.json e decisoes.md
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TASKS = ROOT / ".claude" / "painel" / "tasks.json"
BACKUP = ROOT / ".claude" / "painel" / "tasks.backup.json"
RESUMO = ROOT / ".claude" / "painel" / "migracao-tarefas.json"
DEC_MD = ROOT / ".claude" / "knowledge" / "garcom-nfc" / "decisoes.md"
HOJE = "2026-11-13"
FASES = ["Agora", "MVP-1", "MVP-2", "MVP-3", "Pós-MVP"]
STATUS = {"todo": "a-fazer", "doing": "fazendo", "blocked": "bloqueada", "done": "feita", "dropped": "arquivada"}

# ---- triagem (cada motivo diz o porquê e para onde foi o conteúdo) ----
FEITAS = {
    "INF-01": "app (server.ts) já é separado da escuta (main.ts)",
    "INF-09": "Swagger em /docs (back-end/src/docs/openapi.ts); manter atualizado a cada rota nova",
}
ARQUIVAR = {
    "NFC-01": "duplicada de DEC-05 (decisão da URL pública); a implementação cabe em TAB-04 e OPS-03",
    "SEG-04": "é um processo permanente, não uma tarefa que termina; já faz parte da Definição de pronto (check_tenant e revisor)",
    "DOC-03": "absorvida por DOC-04 (sincronizar a documentação inclui resolver as divergências do Apêndice A)",
    "SEG-05": "duplicada de OPS-02 (produção) e INF-07 (segredos validados); os critérios passaram para OPS-02",
    "RT-06": "duplicada: recarregar /calls ao reconectar é critério de FE-05b",
    "FE-07": "duplicada: estados encerrado/expirado e reconexão viraram FE-04c",
    "DB-04": "vaga: revisar índices vira critério de CAL-03 e SES-04",
    "TAB-05": "impressão em lote cabe em FE-03b (CSS de impressão); só volta se for preciso gerar PDF no servidor",
    "AUT-11": "cosmética, sem efeito no produto; faça junto com a próxima edição do auth.controller",
}
# tarefas grandes viram passos concretos: {id: (motivo, [novas])}
QUEBRAR = {
    "SES-02": ("quebrada em SES-02a e SES-02b", [
        dict(id="SES-02a", titulo="Token da mesa: gerar valor opaco e guardar só o hash", fase="MVP-2", prioridade="P0", quem="você",
             descricao="Utilitário que gera o token por aparelho (aleatório, opaco) e devolve o hash para guardar no banco; o token puro nunca é gravado.",
             depende_de=[], criterios=["Token tem 32+ bytes aleatórios e é entregue uma única vez", "No banco fica só o hash (nunca o token)", "Comparação do token em tempo constante", "Teste unitário cobre geração e verificação"]),
        dict(id="SES-02b", titulo="POST abrir atendimento (uma sessão ACTIVE por mesa)", fase="MVP-2", prioridade="P0", quem="você",
             descricao="Rota que abre o atendimento conforme a decisão de quem abre (DEC-01) e emite o token por aparelho.",
             depende_de=["SES-02a", "SES-01"], bloqueada_por_decisao=["DEC-01", "DEC-02"],
             criterios=["Segunda abertura na mesma mesa não cria outra sessão ACTIVE (índice parcial já existe)", "Sessão nasce com expires_at conforme a duração decidida", "Resposta traz o token uma única vez", "Mesa inativa ou de outro restaurante responde 404"]),
    ]),
    "FE-03": ("quebrada em FE-03a, FE-03b e FE-03c", [
        dict(id="FE-03a", titulo="Admin: mesas (listar, criar, renomear, ativar/desativar)", fase="MVP-1", prioridade="P0", quem="você",
             descricao="Tela de administração ligada a GET/POST/PATCH /tables.", depende_de=["FE-02"],
             criterios=["Lista só as mesas do restaurante do usuário logado", "Criar e renomear validam nome (1 a 60 caracteres) e mostram o erro do servidor", "Ativar/desativar atualiza a linha sem recarregar a página"]),
        dict(id="FE-03b", titulo="Admin: exibir e imprimir o QR Code de cada mesa", fase="MVP-1", prioridade="P1", quem="você",
             descricao="Mostra o QR da URL pública da mesa e permite imprimir todas com rótulo (CSS de impressão).", depende_de=["FE-03a", "TAB-04"], bloqueada_por_decisao="DEC-05",
             criterios=["O QR codifica a URL pública definida em DEC-05", "Página de impressão traz um QR por mesa com o rótulo", "Mesa desativada não aparece na impressão"]),
        dict(id="FE-03c", titulo="Admin: equipe (listar, criar, desativar STAFF com categoria)", fase="MVP-1", prioridade="P1", quem="você",
             descricao="Gestão de STAFF pelo OWNER, ligada a /staff.", depende_de=["FE-02"],
             criterios=["OWNER lista só o STAFF do próprio restaurante", "Criar escolhe a categoria (garçom, gerente, limpeza, cozinha, outra)", "Desativar e excluir pedem confirmação"]),
    ]),
    "FE-04": ("quebrada em FE-04a, FE-04b e FE-04c (FE-07 foi absorvida)", [
        dict(id="FE-04a", titulo="Mesa: abrir pela URL do QR", fase="MVP-2", prioridade="P0", quem="você",
             descricao="Tela pública /m/[code] que mostra o restaurante e a mesa.", depende_de=["FE-01", "SES-01"],
             criterios=["Mostra nome do restaurante e rótulo da mesa", "Mesa inexistente ou inativa mostra mensagem clara", "Sem login e sem dados de outros restaurantes"]),
        dict(id="FE-04b", titulo="Mesa: Chamar garçom e Pedir a conta", fase="MVP-2", prioridade="P0", quem="você",
             descricao="Botões que criam o chamado e confirmam o envio.", depende_de=["FE-04a", "CAL-01"],
             criterios=["Os dois botões criam chamados de tipo diferente", "Mostra confirmação de envio e bloqueia o botão durante o envio", "Limite de chamados (429/409) vira mensagem legível"]),
        dict(id="FE-04c", titulo="Mesa: atendimento encerrado, token expirado e reconexão", fase="MVP-3", prioridade="P1", quem="você",
             descricao="Estados finais da tela da mesa (era FE-07).", depende_de=["FE-04b", "SES-05"],
             criterios=["Atendimento encerrado ou expirado mostra mensagem e some com os botões", "Token inválido não vaza informação da mesa", "Queda de rede mostra aviso e tenta de novo"]),
    ]),
    "FE-05": ("quebrada em FE-05a, FE-05b e FE-05c (RT-06 foi absorvida)", [
        dict(id="FE-05a", titulo="Balcão: lista de chamados abertos com Finalizar (REST)", fase="MVP-2", prioridade="P0", quem="você",
             descricao="Tela do balcão com os chamados abertos e o botão Finalizar, sem tempo real ainda.", depende_de=["FE-02", "CAL-03", "CAL-04"],
             criterios=["Lista os chamados abertos do restaurante do usuário", "Finalizar atualiza a lista e trata o conflito de duas finalizações", "STAFF e OWNER acessam; outros papéis não"]),
        dict(id="FE-05b", titulo="Balcão: cards em tempo real com reconexão", fase="MVP-2", prioridade="P0", quem="você",
             descricao="Cards aparecem e somem pelo Socket.IO; ao reconectar, recarrega GET /calls (era RT-06).", depende_de=["FE-05a", "RT-04"],
             criterios=["Chamado novo aparece em até 1 s sem recarregar", "Chamado finalizado ou cancelado some", "Ao reconectar, a lista é recarregada por REST"]),
        dict(id="FE-05c", titulo="Balcão: alerta sonoro", fase="MVP-3", prioridade="P3", quem="você",
             descricao="Som quando chega chamado novo.", depende_de=["FE-05b"], bloqueada_por_decisao="DEC-10",
             criterios=["Som toca só para chamado novo", "Dá para silenciar", "O navegador pede permissão de áudio uma vez"]),
    ]),
    "TST-05": ("quebrada em TST-05a e TST-05b", [
        dict(id="TST-05a", titulo="Testes de sessão (uma ACTIVE por mesa, token, expiração)", fase="MVP-3", prioridade="P0", quem="IA ok",
             descricao="Cobre a regra de negócio das sessões de mesa.", depende_de=["SES-05"],
             criterios=["Segunda sessão ACTIVE na mesma mesa falha", "Token expirado ou revogado é recusado", "Encerrar revoga tokens na mesma transação"]),
        dict(id="TST-05b", titulo="Testes de chamados (finalizar condicional, cancelar ao encerrar, concorrência)", fase="MVP-3", prioridade="P0", quem="IA ok",
             descricao="Cobre a regra de negócio dos chamados.", depende_de=["CAL-04"],
             criterios=["Duas finalizações simultâneas: só uma vence", "Encerrar a sessão cancela os chamados abertos", "Limite por sessão é respeitado"]),
    ]),
}
REDIRECIONAR = {"SES-02": "SES-02b", "FE-03": "FE-03a", "FE-04": "FE-04b", "FE-05": "FE-05b", "TST-05": "TST-05b", "FE-07": "FE-04c", "RT-06": "FE-05b"}
# ajustes pontuais em tarefas que continuam válidas
AJUSTES = {
    "TST-01": dict(status="fazendo", criterios=["Existe tests/global-setup.ts e tests/setup.ts", "Os testes recusam rodar em banco que não termine em _test", "`npm test` passa com ao menos um teste (GET /health)", "`npm run test:db:up` sobe o banco de teste"]),
    "FE-01": dict(status="fazendo", descricao="Cliente (/m/[code]), balcão (/balcao) e administração (/admin, /login, /cadastro) no front-end/ (Next.js, porta 3000; a API usa 4000). O Luan já criou o projeto com login e mesa em esboço.",
                  criterios=["Existem as 3 áreas com layout próprio", "Rotas protegidas redirecionam para /login", "NEXT_PUBLIC_API_URL aponta para a API (4000)"]),
    "OPS-02": dict(criterios=["Imagem de produção com build e `prisma migrate deploy`", "JWT_SECRET forte e obrigatório (sem valor padrão)", "Sem seed de demonstração", "Senha do SUPER_ADMIN fora do .env depois do uso"]),
    "CAL-03": dict(criterios=["Lista os chamados abertos do restaurante do usuário", "Consulta usa índice (restaurant_id, state)", "Outro restaurante nunca aparece"]),
    "SES-04": dict(criterios=["Lista as sessões ACTIVE do restaurante com os chamados abertos por mesa", "Consulta usa índice (restaurant_id, status)", "STAFF e OWNER acessam"]),
    "DOC-02": dict(descricao="README do back-end: como subir (docker compose na raiz), variáveis de ambiente (FRONTEND_URL, AUTH_CACHE_TTL_SECONDS, SUPER_ADMIN_*), seeds, Swagger em /docs e rotas."),
    "NFC-03": dict(),
}


def carregar():
    return json.loads(TASKS.read_text(encoding="utf-8"))["tasks"]


def novo_formato(x):
    n = {"id": x["id"], "titulo": x["title"], "status": STATUS[x["status"]], "fase": x["phase"], "prioridade": x["prio"]}
    if x.get("deps"):
        n["depende_de"] = list(x["deps"])
    if x.get("desc"):
        n["descricao"] = x["desc"]
    if x.get("module"):
        n["modulo"] = x["module"]
    if x.get("refs"):
        n["refs"] = x["refs"]
    if x.get("mode") in ("você", "IA ok"):
        n["quem"] = x["mode"]
    notas = (x.get("notes") or "").strip()
    if notas:
        n["notas"] = notas
    n["atualizada_em"] = HOJE
    return n


def migrar(antigas):
    log, decisoes = [], []  # log: (id, antes, depois, motivo)
    existentes = {x["id"] for x in antigas}
    tarefas = []
    for x in antigas:
        if x["id"].startswith("DEC-"):
            decisoes.append(x)
            log.append((x["id"], STATUS[x["status"]], "movida para decisoes.md", "decisões não são tarefas"))
            continue
        n = novo_formato(x)
        if x["status"] == "dropped":  # já arquivadas na revisão anterior: o motivo está nas notas
            m = re.search(r"ARQUIVADA: (.+)", x.get("notes") or "")
            n["motivo"] = (m.group(1) if m else "arquivada na revisão anterior").strip()
            n["notas"] = re.sub(r"\n?\[revisão 13/11\] ARQUIVADA:.*", "", n.get("notas", "")).strip() or None
            if not n["notas"]:
                n.pop("notas")
        tarefas.append(n)
    por_id = {t["id"]: t for t in tarefas}
    decisao_aberta = {d["id"] for d in decisoes if d["status"] != "done"}
    # dependências: DEC-xx viram bloqueada_por_decisao; ids inexistentes ou de decisões resolvidas somem
    for t in tarefas:
        deps, decs = [], []
        for d in t.get("depende_de", []):
            if d.startswith("DEC-"):
                if d in decisao_aberta:
                    decs.append(d)
            elif d in existentes:
                deps.append(d)
        antes_blk = next((x.get("blocked_by") for x in antigas if x["id"] == t["id"]), "")
        if antes_blk in decisao_aberta and antes_blk not in decs:
            decs.append(antes_blk)
        if deps:
            t["depende_de"] = deps
        else:
            t.pop("depende_de", None)
        if decs:
            t["bloqueada_por_decisao"] = decs[0] if len(decs) == 1 else decs
    # feitas, arquivadas, ajustes
    for i, why in FEITAS.items():
        por_id[i]["status"] = "feita"
        por_id[i]["notas"] = (por_id[i].get("notas", "") + "\n" + why).strip()
        log.append((i, "a-fazer", "feita", why))
    for i, why in ARQUIVAR.items():
        antes = por_id[i]["status"]
        por_id[i].update(status="arquivada", motivo=why)
        log.append((i, antes, "arquivada", why))
    for i, aj in AJUSTES.items():
        antes = por_id[i]["status"]
        por_id[i].update(aj)
        if aj:
            log.append((i, antes, por_id[i]["status"], "revisada: " + ", ".join(sorted(aj))))
    # quebras
    novas = []
    for i, (why, filhas) in QUEBRAR.items():
        antes = por_id[i]["status"]
        por_id[i].update(status="arquivada", motivo=why)
        log.append((i, antes, "arquivada", why))
        for f in filhas:
            f = {**f, "status": "a-fazer", "modulo": por_id[i].get("modulo", ""), "atualizada_em": HOJE}
            novas.append(f)
            log.append((f["id"], "(nova)", "a-fazer", f"criada pela quebra de {i}"))
    tarefas += novas
    por_id = {t["id"]: t for t in tarefas}
    # quem dependia de uma tarefa quebrada ou absorvida passa a depender do passo certo (os passos novos já nascem certos)
    filhas = {f["id"] for _, fs in QUEBRAR.values() for f in fs}
    for t in tarefas:
        if t["id"] in filhas or not t.get("depende_de"):
            continue
        ds = list(dict.fromkeys(REDIRECIONAR.get(d, d) for d in t["depende_de"]))
        ds = [d for d in ds if d in por_id and d != t["id"]]
        if ds:
            t["depende_de"] = ds
        else:
            t.pop("depende_de")
    # Pós-MVP sem nenhuma tarefa dependente ativa (repete até estabilizar)
    ativa = lambda t: t["status"] not in ("feita", "arquivada")
    mudou = True
    while mudou:
        mudou = False
        for t in tarefas:
            if t["fase"] == "Pós-MVP" and ativa(t) and not any(ativa(o) and t["id"] in o.get("depende_de", []) for o in tarefas):
                t.update(status="arquivada", motivo="pós-MVP, sem tarefas dependentes")
                log.append((t["id"], "a-fazer", "arquivada", t["motivo"]))
                mudou = True
    # ciclos (busca em profundidade); se achar, corta a aresta que fecha o ciclo
    ciclos = []
    def visita(i, pilha):
        for d in por_id[i].get("depende_de", []):
            if d in pilha:
                ciclos.append(pilha[pilha.index(d):] + [d])
                por_id[i]["depende_de"] = [x for x in por_id[i]["depende_de"] if x != d]
            elif d in por_id:
                visita(d, pilha + [d])
    for t in tarefas:
        visita(t["id"], [t["id"]])
    for t in tarefas:
        if t["status"] == "arquivada":
            t.setdefault("motivo", "arquivada")
    return tarefas, decisoes, log, ciclos


def texto_decisoes(decisoes, tarefas):
    """Bloco estruturado de decisões pendentes (uma linha por decisão, detalhes indentados) para o decisoes.md."""
    linhas = ["## Pendentes", "Formato: `- [ ] DEC-NN · título`; as linhas indentadas são detalhes. A tela Decisões e a tela Tarefas leem este bloco.", ""]
    for d in sorted((x for x in decisoes if x["status"] != "done"), key=lambda x: x["id"]):
        bloqueia = sorted(t["id"] for t in tarefas if d["id"] in ([t["bloqueada_por_decisao"]] if isinstance(t.get("bloqueada_por_decisao"), str) else t.get("bloqueada_por_decisao", [])) and t["status"] not in ("feita", "arquivada"))
        linhas.append(f"- [ ] {d['id']} · {d['title']}")
        if d.get("desc"):
            linhas.append(f"  - Opções e contexto: {d['desc']}")
        nota = re.sub(r"\[revisão 13/11\][^\n]*", "", d.get("notes") or "").strip()
        if nota:
            linhas.append(f"  - Nota sua: {nota}")
        if d["id"] == "DEC-01":
            linhas.append("  - Atenção: a nota acima parece uma decisão. Confirme marcando a caixa para destravar as tarefas.")
        if d["id"] == "DEC-11":
            linhas.append("  - A porta já foi resolvida (back-end 4000, front-end 3000). Resta só o prefixo /api/v1.")
        linhas.append(f"  - Fase: {d['phase']} · Prioridade: {d['prio']}" + (f" · Refs: {d['refs']}" if d.get("refs") else ""))
        if bloqueia:
            linhas.append(f"  - Bloqueia: {', '.join(bloqueia)}")
    return "\n".join(linhas) + "\n"


def main():
    aplicar = "--aplicar" in sys.argv
    antigas = carregar()
    if any("titulo" in x for x in antigas):
        print("tasks.json já está no esquema novo; nada a fazer.")
        return
    tarefas, decisoes, log, ciclos = migrar(antigas)
    cont = lambda xs: dict(Counter(xs))
    antes = cont(STATUS[x["status"]] for x in antigas)
    depois = cont(t["status"] for t in tarefas)
    print(f"ANTES : {len(antigas)} itens {antes}")
    print(f"DEPOIS: {len(tarefas)} tarefas {depois} + {len(decisoes)} decisões movidas para decisoes.md")
    print(f"conta : {len(antigas)} - {len(decisoes)} (decisões) + {sum(len(f) for _, f in QUEBRAR.values())} (novas da quebra) = {len(antigas) - len(decisoes) + sum(len(f) for _, f in QUEBRAR.values())} (esperado {len(tarefas)})")
    print(f"ciclos quebrados: {ciclos or 'nenhum'}")
    for i, a, d, m in log:
        print(f"  {i:8} {a:>10} -> {d:<24} {m}")
    if not aplicar:
        print("\n(simulação: nada foi gravado; use --aplicar)")
        return
    if not BACKUP.exists():
        BACKUP.write_text(TASKS.read_text(encoding="utf-8"), encoding="utf-8")
    TASKS.write_text(json.dumps({"tasks": tarefas}, ensure_ascii=False, indent=1), encoding="utf-8")
    RESUMO.write_text(json.dumps({"antes": antes, "depois": depois, "decisoes_movidas": [d["id"] for d in decisoes], "log": log, "ciclos": ciclos}, ensure_ascii=False, indent=1), encoding="utf-8")
    md = DEC_MD.read_text(encoding="utf-8")
    ini = md.index("## Pendentes")
    fim = md.index("## Sugestões para destravar")
    antigo = md[ini:fim]
    arq = ROOT / ".claude" / "knowledge" / "_arquivo" / "decisoes-lista-antiga.md"
    arq.write_text("# Lista de pendentes antiga (sem ids), substituída em 13/11/2026\n\n" + antigo, encoding="utf-8")
    novo = texto_decisoes(decisoes, tarefas) + "\n(A lista anterior, sem ids, está em `../_arquivo/decisoes-lista-antiga.md`.)\n\n"
    resolvidas = [d for d in decisoes if d["status"] == "done"]
    if resolvidas:
        novo += "## Resolvidas que estavam na lista de tarefas\n" + "\n".join(f"- [x] {d['id']} · {d['title']} — {(d.get('notes') or d.get('desc') or '').strip()}" for d in resolvidas) + "\n\n"
    DEC_MD.write_text(md[:ini] + novo + md[fim:], encoding="utf-8")
    print("\ngravado: tasks.json, tasks.backup.json, migracao-tarefas.json e decisoes.md")


if __name__ == "__main__":
    main()
