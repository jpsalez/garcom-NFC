"""Análise de sessões do Claude Code (somente leitura) para o painel.

Lê o transcrito da sessão e os dos subagentes e devolve métricas: duração, tokens, ferramentas,
arquivos, linha do tempo, árvore de delegação e achados heurísticos sobre o orquestrador.
Não lê nem devolve o conteúdo das mensagens: só contagens, nomes de ferramentas e caminhos.
"""
import json
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import monitor as mon

_cache = {}


def _ts(s):
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except (AttributeError, ValueError):
        return None


_titles = {}


def title_of(path: Path):
    """Título (ai-title) de um .jsonl lendo só os bytes novos desde a última chamada: barato mesmo em sessões enormes."""
    st = path.stat()
    key = str(path)
    off, title, size = _titles.get(key, (0, None, 0))
    if st.st_size < size:  # arquivo recomeçou
        off, title = 0, None
    with open(path, "rb") as f:
        f.seek(off)
        chunk = f.read()
    end = chunk.rfind(b"\n") + 1  # só linhas completas
    for line in chunk[:end].splitlines():
        if b'"ai-title"' in line:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            if d.get("type") == "ai-title" and d.get("aiTitle"):
                title = d["aiTitle"]
    _titles[key] = (off + end, title, st.st_size)
    return title


def parse_file(path: Path):
    """Lê um .jsonl inteiro (com cache por tamanho/mtime) e extrai as métricas de um agente."""
    st = path.stat()
    key = (str(path), st.st_size, int(st.st_mtime))
    if key in _cache:
        return _cache[key]
    for k in [k for k in _cache if k[0] == key[0]]:  # só a versão mais nova de cada arquivo fica na memória
        del _cache[k]
    r = {"first": None, "last": None, "tools": Counter(), "read": Counter(), "edited": Counter(),
         "usage": {}, "model": None, "errors": 0, "calls": [], "briefing": 0, "title": None, "msgs": 0, "edit_events": []}
    ids = {}
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                d = json.loads(line)
            except ValueError:
                continue
            t = _ts(d.get("timestamp"))
            if t:
                r["first"] = r["first"] or t
                r["last"] = t
            if d.get("type") == "ai-title" and d.get("aiTitle"):
                r["title"] = d["aiTitle"]
            msg = d.get("message") or {}
            content = msg.get("content")
            if d.get("type") == "user" and r["briefing"] == 0:
                if isinstance(content, str):
                    r["briefing"] = len(content)
                elif isinstance(content, list):
                    r["briefing"] = sum(len(b.get("text", "")) for b in content if isinstance(b, dict) and b.get("type") == "text")
            if d.get("type") == "assistant":
                r["msgs"] += 1
                r["model"] = msg.get("model") or r["model"]
                if msg.get("id") and msg.get("usage"):
                    ids[msg["id"]] = msg["usage"]  # a mesma resposta pode aparecer em várias linhas
                for b in content if isinstance(content, list) else []:
                    if b.get("type") != "tool_use" or b.get("name") == "SubagentHandback":
                        continue
                    name, inp = b.get("name", "?"), b.get("input")
                    r["tools"][name] += 1
                    tgt = mon.target_of(name, inp)
                    r["calls"].append({"id": b.get("id"), "tool": name, "t": t, "target": tgt,
                                       "desc": (inp or {}).get("description") if isinstance(inp, dict) else None,
                                       "stype": (inp or {}).get("subagent_type") if isinstance(inp, dict) else None,
                                       "plen": len((inp or {}).get("prompt", "")) if isinstance(inp, dict) else 0})
                    if name == "Read" and tgt:
                        r["read"][tgt] += 1
                    elif name in mon.EDIT_TOOLS and tgt:
                        r["edited"][tgt] += 1
                        if t:
                            r["edit_events"].append((t, tgt))
            elif d.get("type") == "user" and isinstance(content, list):
                r["errors"] += sum(1 for b in content if isinstance(b, dict) and b.get("type") == "tool_result" and b.get("is_error"))
    u = Counter()
    for x in ids.values():
        u["in"] += x.get("input_tokens", 0)
        u["out"] += x.get("output_tokens", 0)
        u["cache_r"] += x.get("cache_read_input_tokens", 0)
        u["cache_w"] += x.get("cache_creation_input_tokens", 0)
    r["usage"] = dict(u)
    _cache[key] = r
    return r


def analyze(sid: str):
    main_path = mon.PROJ / f"{sid}.jsonl"
    if not main_path.exists():
        raise FileNotFoundError("sessão não encontrada")
    main = parse_file(main_path)
    spawn = {c["id"]: c for c in main["calls"] if c["tool"] in ("Agent", "Task")}
    agents = []
    sub = mon.PROJ / sid / "subagents"
    for jf in sorted(sub.glob("agent-*.jsonl")) if sub.is_dir() else []:
        try:
            meta = json.loads(jf.with_suffix(".meta.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            meta = {}
        p = parse_file(jf)
        sp = spawn.get(meta.get("toolUseId"), {})
        agents.append({"id": jf.stem[6:], "name": meta.get("description") or jf.stem, "type": meta.get("agentType", "?"),
                       "start": p["first"], "end": p["last"], "finished": meta.get("finished", True),
                       "calls": sum(p["tools"].values()), "tools": dict(p["tools"]), "errors": p["errors"],
                       "usage": p["usage"], "model": p["model"], "briefing": p["briefing"] or sp.get("plen", 0),
                       "spawned": sp.get("t"), "read": list(p["read"]), "edited": list(p["edited"])})
    agents.sort(key=lambda a: a["start"] or 0)
    t0 = min([x for x in [main["first"]] + [a["start"] for a in agents] if x] or [0])
    t1 = max([x for x in [main["last"]] + [a["end"] for a in agents] if x] or [0])

    # paralelismo máximo (varredura de eventos)
    ev = sorted([(a["start"], 1) for a in agents if a["start"] and a["end"]] + [(a["end"], -1) for a in agents if a["start"] and a["end"]])
    cur = mx = 0
    par_time = 0.0
    last_t = None
    for t, dlt in ev:
        if last_t is not None and cur > 1:
            par_time += t - last_t
        cur += dlt
        mx = max(mx, cur)
        last_t = t

    hot = defaultdict(set)
    reads = Counter()
    for a in agents:
        for rp in a["read"]:
            hot[rp].add(a["name"])
    for rp, c in main["read"].items():
        reads[rp] += c
        hot[rp].add("principal")
    for jf in sub.glob("agent-*.jsonl") if sub.is_dir() else []:
        for rp, c in parse_file(jf)["read"].items():
            reads[rp] += c
    hot_files = [{"path": p, "reads": reads[p], "agents": sorted(hot[p])} for p, _ in reads.most_common(12)]

    tools = Counter(main["tools"])
    for a in agents:
        tools.update(a["tools"])
    tot = lambda u: u.get("in", 0) + u.get("out", 0) + u.get("cache_w", 0)  # tokens NOVOS (sem leitura de cache)
    main_tokens = tot(main["usage"])
    sub_tokens = sum(tot(a["usage"]) for a in agents)
    all_tokens = main_tokens + sub_tokens
    cache_r = main["usage"].get("cache_r", 0) + sum(a["usage"].get("cache_r", 0) for a in agents)

    # achados heurísticos sobre a orquestração
    findings = []
    add = lambda sev, title, detail: findings.append({"sev": sev, "title": title, "detail": detail})
    if mx > 3:
        add("alta", f"Paralelismo máximo de {mx} agentes", "A regra do orquestrador é no máximo 3 em paralelo; mais que isso dispara custo e briefings rasos.")
    trivial = [a for a in agents if a["calls"] <= 2]
    if len(trivial) >= 2:
        add("media", f"{len(trivial)} agentes fizeram 2 chamadas ou menos", "Podem ser tarefas triviais que o orquestrador responderia sozinho: " + ", ".join(a["name"] for a in trivial[:4]) + ".")
    names = Counter(a["name"] for a in agents)
    dup = [n for n, c in names.items() if c > 1]
    if dup:
        add("media", "Agentes repetidos com a mesma descrição", "Para um follow-up prefira continuar o agente que já respondeu: " + ", ".join(dup[:3]) + ".")
    shared = [h for h in hot_files if len([x for x in h["agents"] if x != "principal"]) >= 3]
    if shared:
        add("media", f"{len(shared)} arquivo(s) lidos por 3+ agentes", "Contexto repetido custa tokens: anexe um resumo ou o arquivo no briefing. Ex.: " + shared[0]["path"] + ".")
    long_ = [a for a in agents if a["calls"] > 60]
    if long_:
        add("media", "Agentes muito longos (60+ chamadas)", "Divida a tarefa ou limite o escopo: " + ", ".join(a["name"] for a in long_[:3]) + ".")
    big = [a for a in agents if a["briefing"] > 6000]
    if big:
        add("baixa", "Briefings muito grandes", "Mais de 6 mil caracteres no prompt de " + ", ".join(a["name"] for a in big[:3]) + ".")
    bad = [a for a in agents if a["calls"] >= 5 and a["errors"] / max(a["calls"], 1) > 0.1]
    if bad:
        add("media", "Taxa de erro de ferramenta acima de 10%", ", ".join(a["name"] for a in bad[:3]) + ".")
    if all_tokens and sub_tokens / all_tokens > 0.6:
        add("baixa", f"Subagentes consumiram {round(100 * sub_tokens / all_tokens)}% dos tokens", "Esperado em fases de extração; confira se cada um precisava de tanto contexto.")
    if all_tokens > 200_000 and cache_r / (cache_r + all_tokens) < 0.5:
        add("baixa", "Baixo reaproveitamento de cache", "Poucos tokens vieram do cache de prompt; sessões longas e briefings estáveis ajudam.")
    if not findings:
        add("ok", "Nenhum problema de orquestração detectado", "Heurísticas simples: paralelismo, tarefas triviais, repetição, contexto repetido, tamanho e erros.")

    spawns = [c for c in main["calls"] if c["tool"] in ("Agent", "Task")]
    first_deleg = (min(c["t"] for c in spawns if c["t"]) - (main["first"] or 0)) if spawns else None
    batches, last = 0, None
    for c in sorted(spawns, key=lambda c: c["t"] or 0):
        if last is None or (c["t"] or 0) - last > 5:
            batches += 1
        last = c["t"]
    orch = {"spawns": len(spawns), "batches": batches, "send_message": main["tools"].get("SendMessage", 0),
            "avg_briefing": round(sum(c["plen"] for c in spawns) / len(spawns)) if spawns else 0,
            "first_delegation_s": round(first_deleg) if first_deleg is not None else None,
            "by_type": dict(Counter((c["stype"] or "general-purpose") for c in spawns)),
            "main_calls": sum(main["tools"].values()), "main_tokens": main_tokens, "sub_tokens": sub_tokens,
            "main_errors": main["errors"]}
    return {
        "session": sid, "title": main["title"] or sid[:8], "t0": t0, "t1": t1,
        "kpis": {"agents": len(agents), "duration": round(t1 - t0), "tokens": all_tokens, "cache_read": cache_r, "max_parallel": mx,
                 "parallel_time": round(par_time), "edited": len({e for a in agents for e in a["edited"]} | set(main["edited"])),
                 "errors": main["errors"] + sum(a["errors"] for a in agents), "calls": sum(tools.values())},
        "agents": [{k: v for k, v in a.items() if k not in ("read",)} for a in agents],
        "main": {"calls": sum(main["tools"].values()), "tokens": main_tokens, "tools": dict(main["tools"])},
        "hot_files": hot_files, "tools": dict(tools.most_common(12)), "findings": findings, "orch": orch,
    }
