"""Tarefas e decisões do painel.

- tasks.json guarda só TAREFAS, no esquema abaixo; o servidor valida ao salvar e recusa JSON inválido.
- Decisões de produto (DEC-NN) vivem no decisoes.md (fonte única); aqui só se lê e se marca a caixa.

Tarefa: obrigatórios id, titulo, status (a-fazer|fazendo|bloqueada|feita|arquivada), fase, prioridade.
Opcionais: depende_de[], bloqueada_por_decisao (DEC-NN ou lista), criterios[], arquivos[], motivo, atualizada_em,
          e ainda descricao, modulo, refs, quem ("você" | "IA ok"), notas.
"""
import json
import re
import threading
from datetime import date
from pathlib import Path

from _common import KNOW, ROOT

TASKS = ROOT / ".claude" / "painel" / "tasks.json"
DEC = KNOW / "decisoes.md"
STATUS = ("a-fazer", "fazendo", "bloqueada", "feita", "arquivada")
FASES = ("Agora", "MVP-1", "MVP-2", "MVP-3", "Pós-MVP")
PRIORIDADES = ("P0", "P1", "P2", "P3")
QUEM = ("você", "IA ok")
TEXTOS = {"titulo": 200, "descricao": 1500, "notas": 3000, "modulo": 80, "refs": 120, "motivo": 300}
LISTAS = {"depende_de": (30, 20), "criterios": (20, 300), "arquivos": (30, 200)}
ID_RX = re.compile(r"^(?:[A-Z]{2,4}-\d{1,3}[a-z]?|T-\d{3})$")
DEC_RX = re.compile(r"^DEC-\d{2,3}$")
LOCK = threading.Lock()


def hoje():
    return date.today().isoformat()


def validar(t):
    """Confere (e normaliza) uma tarefa. Levanta ValueError dizendo qual campo está errado."""
    if not isinstance(t, dict):
        raise ValueError("tarefa deve ser um objeto")
    i = t.get("id", "?")
    def erro(msg):
        return ValueError(f"tarefa {i}: {msg}")
    if not isinstance(t.get("id"), str) or not ID_RX.match(t["id"]):
        raise erro("id inválido")
    for k in ("titulo", "status", "fase", "prioridade"):
        if not str(t.get(k, "")).strip():
            raise erro(f"campo obrigatório ausente: {k}")
    if t["status"] not in STATUS:
        raise erro(f"status inválido ({t['status']})")
    if t["fase"] not in FASES:
        raise erro(f"fase inválida ({t['fase']})")
    if t["prioridade"] not in PRIORIDADES:
        raise erro(f"prioridade inválida ({t['prioridade']})")
    if t.get("quem") not in (None, *QUEM):
        raise erro("quem deve ser 'você' ou 'IA ok'")
    for k, limite in TEXTOS.items():
        if k in t and (not isinstance(t[k], str) or len(t[k]) > limite):
            raise erro(f"{k} deve ser texto de até {limite} caracteres")
    for k, (n, tam) in LISTAS.items():
        if k in t:
            if not isinstance(t[k], list) or len(t[k]) > n or not all(isinstance(x, str) and 0 < len(x) <= tam for x in t[k]):
                raise erro(f"{k} deve ser lista de até {n} textos de até {tam} caracteres")
    d = t.get("bloqueada_por_decisao")
    if d is not None:
        ds = [d] if isinstance(d, str) else d
        if not isinstance(ds, list) or not ds or not all(isinstance(x, str) and DEC_RX.match(x) for x in ds):
            raise erro("bloqueada_por_decisao deve ser DEC-NN ou uma lista de DEC-NN")
    if t["status"] == "arquivada" and not str(t.get("motivo", "")).strip():
        raise erro("arquivada exige motivo")
    if "atualizada_em" in t and not re.match(r"^\d{4}-\d{2}-\d{2}$", str(t["atualizada_em"])):
        raise erro("atualizada_em deve ser AAAA-MM-DD")
    extras = set(t) - {"id", "status", "fase", "prioridade", "quem", "bloqueada_por_decisao", "atualizada_em", *TEXTOS, *LISTAS}
    if extras:
        raise erro(f"campos desconhecidos: {', '.join(sorted(extras))}")
    return t


def validar_todas(lista):
    """Valida cada tarefa, ids únicos, dependências que existem e ausência de ciclos."""
    if not isinstance(lista, list):
        raise ValueError("tasks.json deve conter uma lista de tarefas")
    ids = set()
    for t in lista:
        validar(t)
        if t["id"] in ids:
            raise ValueError(f"id repetido: {t['id']}")
        ids.add(t["id"])
    por_id = {t["id"]: t for t in lista}
    for t in lista:
        for d in t.get("depende_de", []):
            if d not in por_id:
                raise ValueError(f"tarefa {t['id']}: depende de {d}, que não existe")
            if d == t["id"]:
                raise ValueError(f"tarefa {t['id']}: depende de si mesma")
    estado = {}
    def visita(i, pilha):
        estado[i] = 1
        for d in por_id[i].get("depende_de", []):
            if estado.get(d) == 1:
                raise ValueError("ciclo de dependências: " + " → ".join(pilha + [d]))
            if d not in estado:
                visita(d, pilha + [d])
        estado[i] = 2
    for i in por_id:
        if i not in estado:
            visita(i, [i])
    return lista


def carregar():
    if not TASKS.exists():
        return []
    dados = json.loads(TASKS.read_text(encoding="utf-8"))
    lista = dados.get("tasks", []) if isinstance(dados, dict) else dados
    if lista and "title" in lista[0]:
        raise RuntimeError("tasks.json está no formato antigo: rode python3 .claude/scripts/migrar_tarefas.py --aplicar")
    return lista


def salvar(lista):
    from realtime import publish  # import tardio: só avisa os clientes; sem socket não faz nada
    validar_todas(lista)
    TASKS.parent.mkdir(parents=True, exist_ok=True)
    tmp = TASKS.with_suffix(".tmp")
    tmp.write_text(json.dumps({"tasks": lista}, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(TASKS)
    publish("tasks")


def _aplicar(t, corpo):
    campos = {"status", "fase", "prioridade", "quem", "bloqueada_por_decisao", *TEXTOS, *LISTAS}
    desconhecidos = set(corpo) - campos - {"id"}
    if desconhecidos:
        raise ValueError("campos desconhecidos: " + ", ".join(sorted(desconhecidos)))
    for k in campos & set(corpo):
        v = corpo[k].strip() if isinstance(corpo[k], str) else corpo[k]
        if v in (None, "", []) and k not in ("titulo", "status", "fase", "prioridade"):
            t.pop(k, None)
        else:
            t[k] = v
    t["atualizada_em"] = hoje()
    return validar(t)


def atualizar(tid, corpo):
    with LOCK:
        lista = carregar()
        t = next((x for x in lista if x["id"] == tid), None)
        if not t:
            raise KeyError("tarefa não encontrada")
        _aplicar(t, corpo)
        salvar(lista)
        return t


def criar(corpo):
    with LOCK:
        lista = carregar()
        n = 1 + max([int(x["id"][2:]) for x in lista if x["id"].startswith("T-") and x["id"][2:].isdigit()] or [0])
        t = {"id": f"T-{n:03d}", "titulo": "", "status": "a-fazer", "fase": "MVP-2", "prioridade": "P2", "quem": "você"}
        t["titulo"] = str(corpo.get("titulo", "")).strip()
        _aplicar(t, {k: v for k, v in corpo.items() if k != "id"})
        lista.append(t)
        salvar(lista)
        return t


def apagar(tid):
    with LOCK:
        lista = carregar()
        if not any(x["id"] == tid for x in lista):
            raise KeyError("tarefa não encontrada")
        for x in lista:
            if tid in x.get("depende_de", []):
                x["depende_de"] = [d for d in x["depende_de"] if d != tid]
                if not x["depende_de"]:
                    del x["depende_de"]
        salvar([x for x in lista if x["id"] != tid])
        return {"ok": True}


# ---------- decisões (decisoes.md) ----------
LINHA_DEC = re.compile(r"^- \[( |x)\] (DEC-\d{2,3}) · (.+?)(?: — (.*))?$")


def _blocos():
    """[(índice da linha, caixa, id, título, nota, detalhes[])] do decisoes.md."""
    linhas = DEC.read_text(encoding="utf-8").splitlines() if DEC.exists() else []
    out = []
    for n, ln in enumerate(linhas):
        m = LINHA_DEC.match(ln)
        if not m:
            continue
        det = []
        for ln2 in linhas[n + 1:]:
            if ln2.startswith("  "):
                det.append(ln2.strip().lstrip("- ").strip())
            else:
                break
        out.append((n, m.group(1) == "x", m.group(2), m.group(3), m.group(4) or "", det))
    return linhas, out


def ativa(t):
    return t["status"] not in ("feita", "arquivada")


def bloqueadas_por(tarefas, dec_id):
    """Tarefas ativas bloqueadas por esta decisão."""
    r = []
    for t in tarefas:
        d = t.get("bloqueada_por_decisao")
        if ativa(t) and d and dec_id in ([d] if isinstance(d, str) else d):
            r.append(t["id"])
    return sorted(r)


def decisoes():
    """{pendentes, resolvidas, bloqueadas}: pendentes têm 'bloqueia' (ids das tarefas), calculado a partir do tasks.json."""
    _, blocos = _blocos()
    try:
        tarefas = carregar()
    except (RuntimeError, ValueError):
        tarefas = []
    pend, res = [], []
    for _, feita, i, titulo, nota, det in blocos:
        item = {"id": i, "titulo": titulo, "detalhes": [d for d in det if not d.startswith("Bloqueia:")], "nota": nota, "bloqueia": bloqueadas_por(tarefas, i)}
        (res if feita else pend).append(item)
    bloqueadas = sorted({t for d in pend for t in d["bloqueia"]})
    return {"pendentes": pend, "resolvidas": res, "tarefas_bloqueadas": bloqueadas}


def marcar_decisao(dec_id, resolvida, nota=""):
    """Marca ou desmarca a caixa da decisão no decisoes.md (a decisão em si é sempre sua)."""
    if not DEC_RX.match(dec_id):
        raise ValueError("id de decisão inválido")
    with LOCK:
        linhas, blocos = _blocos()
        b = next((x for x in blocos if x[2] == dec_id), None)
        if not b:
            raise KeyError("decisão não encontrada")
        n, _, i, titulo, nota_antiga, _ = b
        nota = str(nota or "").strip()[:300]
        if resolvida:
            sufixo = f" — {nota or nota_antiga or 'decidida em ' + date.today().strftime('%d/%m/%Y')}"
            linhas[n] = f"- [x] {i} · {titulo}{sufixo}"
        else:
            linhas[n] = f"- [ ] {i} · {titulo}"
        DEC.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    from realtime import publish
    publish("decisions", "tasks")
    return decisoes()


def ids_conhecidos():
    """Ids de tarefas e de decisões (para ligar issues e commits a eles)."""
    try:
        ids = {t["id"] for t in carregar()}
    except (RuntimeError, ValueError, OSError):
        ids = set()
    return ids | {b[2] for b in _blocos()[1]}


def citam(chaves):
    """Tarefas que citam algum dos textos (caminho ou nome de arquivo) em qualquer campo."""
    try:
        tarefas = carregar()
    except (RuntimeError, ValueError):
        return []
    return [{"id": t["id"], "title": t["titulo"], "status": t["status"]} for t in tarefas if any(k in json.dumps(t, ensure_ascii=False) for k in chaves)][:10]


def texto_da_tarefa(tid):
    """A tarefa em texto simples (para anexar ao contexto de um agente): título, critérios, dependências e notas."""
    t = next((x for x in carregar() if x["id"] == tid), None)
    if not t:
        raise ValueError("tarefa não encontrada: " + str(tid)[:20])
    linhas = [f"{t['id']} · {t['titulo']}", f"Status: {t['status']} · Fase: {t['fase']} · Prioridade: {t['prioridade']}" + (f" · Quem: {t['quem']}" if t.get("quem") else "")]
    for rotulo, chave in (("Descrição", "descricao"), ("Notas", "notas"), ("Motivo", "motivo"), ("Módulo", "modulo"), ("Refs", "refs")):
        if t.get(chave):
            linhas.append(f"{rotulo}: {t[chave]}")
    if t.get("depende_de"):
        linhas.append("Depende de: " + ", ".join(t["depende_de"]))
    d = t.get("bloqueada_por_decisao")
    if d:
        linhas.append("Bloqueada pela decisão: " + (d if isinstance(d, str) else ", ".join(d)))
    if t.get("arquivos"):
        linhas.append("Arquivos: " + ", ".join(t["arquivos"]))
    if t.get("criterios"):
        linhas.append("Critérios de pronto:\n" + "\n".join(f"- {c}" for c in t["criterios"]))
    return "\n".join(linhas)
