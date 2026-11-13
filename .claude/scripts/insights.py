"""Saúde e arquitetura (fase 4): treemap de hotspots, evolução da complexidade, dependências entre módulos e acoplamento
de mudanças. Somente leitura. Todo parâmetro numérico é validado e todo caminho passa por gitinfo.repo_path."""
import os
import re
import time
from itertools import combinations
from pathlib import Path

import gitinfo

CODE_EXT = (".ts", ".tsx", ".js", ".mjs")
SKIP_DIRS = {"node_modules", ".next", ".git", "generated", "dist", "coverage"}
# arquivos que mudam por motivos mecânicos: não dizem nada sobre acoplamento
NOISE = re.compile(r"(^|/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$|(^|/)prisma/migrations/|(^|/)(generated|dist|build|\.next|coverage)/|\.min\.(js|css)$|\.map$|\.snap$")
MAX_FILES_PER_COMMIT = 40
_cache = {}


def _cached(key, ttl, fn):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    val = fn()
    _cache[key] = (time.time(), val)
    return val


def _num(q, key, default, lo, hi):
    """Parâmetro inteiro dentro de [lo, hi]; fora disso é erro (vira HTTP 400), não ajuste silencioso."""
    try:
        v = int(q.get(key, default))
    except (TypeError, ValueError):
        raise ValueError(f"{key} inválido")
    if not lo <= v <= hi:
        raise ValueError(f"{key} fora do intervalo {lo}–{hi}")
    return v


# ---------- métricas de um texto ----------
# O detector da aba Saúde (gitinfo.fn_spans) só enxerga métodos de classe. Aqui também entram `function nome()`,
# arrows com bloco e componentes: o front-end não pode aparecer com complexidade 1 por limitação do detector.
_ARGS = r"\((?:[^()]|\([^()]*\))*\)"
_FN_START = re.compile(
    r"(?:\bfunction\s*\*?\s*(?P<f>[A-Za-z_$][\w$]*)?\s*" + _ARGS + r"\s*(?::[^{;=]+)?\{)"
    r"|(?:\b(?:const|let|var)\s+(?P<a>[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:" + _ARGS + r"|[A-Za-z_$][\w$]*)\s*(?::[^={;]+?)?=>\s*\{)"
    r"|(?:^[ \t]*(?:(?:public|private|protected|static|async|get|set|readonly)\s+)*(?P<m>[A-Za-z_$][\w$]*)\s*" + _ARGS + r"\s*(?::[^{;=]+)?\{)", re.M)
_NOT_NAMES = {"if", "for", "while", "switch", "catch", "return", "else", "try", "do", "with", "function"}


def function_spans(clean):
    """(nome, linha inicial, linha final) de cada função com bloco, achando o `}` por contagem de chaves. `clean` = fonte sem strings/comentários."""
    out = []
    for m in _FN_START.finditer(clean):
        name = m.group("f") or m.group("a") or m.group("m") or "anônima"
        if m.group("m") and name in _NOT_NAMES:
            continue
        depth, i = 0, m.end() - 1
        while i < len(clean):
            c = clean[i]
            depth += (c == "{") - (c == "}")
            if depth == 0:
                break
            i += 1
        else:
            continue
        out.append((name, clean.count("\n", 0, m.start()) + 1, clean.count("\n", 0, i) + 1, m.end(), i))
    return out


def text_metrics(text):
    """(loc lógico, CC máxima, maior função em linhas) de um fonte TS/JS."""
    clean = gitinfo.strip_code(text)
    loc = sum(1 for ln in clean.splitlines() if ln.strip())
    cc_max, longest = 1, 0
    for _name, a, b, s0, s1 in function_spans(clean):
        cc_max = max(cc_max, 1 + len(gitinfo.DECISION.findall(clean[s0:s1])))
        longest = max(longest, b - a + 1)
    return loc, cc_max, longest


def _source_files():
    """Código-fonte do back-end (src/) e do front-end, como caminhos absolutos."""
    base = Path(gitinfo.ROOT)
    for root in (base / "back-end" / "src", base / "front-end"):
        for dp, dns, fns in os.walk(root):
            dns[:] = [d for d in dns if d not in SKIP_DIRS]
            for f in fns:
                if f.endswith(CODE_EXT) and not f.endswith(".d.ts"):
                    yield Path(dp) / f


def norm_path(path, base=None):
    """Caminhos de commits antigos (antes do monorepo: `src/x.ts`, `frontend/x`) viram os de hoje (`back-end/src/x.ts`)."""
    if path.startswith("frontend/"):
        return "front-end/" + path[9:]
    if path.startswith(("back-end/", "front-end/", ".claude/", ".github/")):
        return path
    if path.startswith(("src/", "prisma/")):
        return "back-end/" + path
    base = base or Path(gitinfo.ROOT)
    return path if (base / path).exists() or not (base / "back-end" / path).exists() else "back-end/" + path


def _log_files(days, extra=()):
    """Lista de conjuntos de arquivos por commit nos últimos `days` dias (git log --name-only), com caminhos normalizados."""
    out = gitinfo.git("log", "--all", f"--since={days}.days", "--name-only", "--format=%x1e%H", *extra, timeout=40)
    commits = []
    for rec in out.split("\x1e"):
        lines = [ln for ln in rec.strip().splitlines() if ln.strip()]
        if lines:
            commits.append((lines[0], {norm_path(f) for f in lines[1:]}))
    return commits


# ---------- 1. treemap ----------
def treemap(days=90):
    def build():
        churn = {}
        for _sha, files in _log_files(days):
            for f in files:
                churn[f] = churn.get(f, 0) + 1
        base, rows = Path(gitinfo.ROOT), []
        for p in _source_files():
            rel = p.relative_to(base).as_posix()
            try:
                loc, cc, longest = text_metrics(p.read_text(encoding="utf-8", errors="replace"))
            except OSError:
                continue
            commits = churn.get(rel, 0)
            rows.append({"path": rel, "loc": loc, "commits": commits, "cc_max": cc, "level": gitinfo.level_of(cc, longest, loc, commits * cc)})
        rows.sort(key=lambda r: r["path"])
        return {"days": days, "files": rows, "max_commits": max((r["commits"] for r in rows), default=0)}
    return _cached(("treemap", days), 30, build)


# ---------- 2. evolução da complexidade ----------
def complexity(top=10, points=12, budget_s=25):
    def build():
        worst = sorted(treemap(90)["files"], key=lambda r: (-r["cc_max"], -r["commits"] * r["cc_max"], -r["loc"]))[:top]
        deadline, files = time.time() + budget_s, []
        for r in worst:
            path = gitinfo.repo_path(r["path"])
            # --follow + --name-only: cada versão vem com o nome que o arquivo tinha naquele commit (renomeações, migração para monorepo)
            log = gitinfo.git("log", "--follow", "--name-only", f"-n{points}", "--format=%x1e%H%x1f%aI", "--", path, timeout=20)
            versions = []
            for rec in log.split("\x1e"):
                ln = [x for x in rec.splitlines() if x.strip()]
                if ln:
                    sha, _, iso = ln[0].partition("\x1f")
                    versions.append((sha, iso, ln[1] if len(ln) > 1 else path))
            series = []
            for sha, iso, old in reversed(versions):  # do mais antigo para o mais novo
                if time.time() > deadline or not gitinfo.SHA.match(sha):
                    break
                try:
                    src = gitinfo.git("show", f"{sha}:{gitinfo.repo_path(old)}", timeout=15)
                except (ValueError, PermissionError):
                    continue
                if src:
                    loc, cc, _ = text_metrics(src)
                    series.append({"sha": sha, "short": sha[:7], "t": iso, "ts": gitinfo._ts(iso), "cc_max": cc, "loc": loc})
            files.append({"path": r["path"], "cc_now": r["cc_max"], "series": series})
        return {"files": files, "points": points}
    return _cached(("complexity", top, points), 60, build)


# ---------- 3. dependências entre módulos ----------
def module_of(path):
    """back-end/src/modules/<nome>/... → <nome>; shared/ → shared; o resto de src/ → app."""
    parts = path.split("/")
    if len(parts) > 4 and parts[2] == "modules":
        return parts[3]
    return "shared" if len(parts) > 3 and parts[2] == "shared" else "app"


def strongly_connected(nodes, edges):
    """Componentes fortemente conectados (Tarjan, iterativo) com mais de um nó: são os ciclos entre módulos."""
    adj = {n: sorted({b for a, b in edges if a == n and b != n}) for n in nodes}
    index, low, on, stack, out, counter = {}, {}, set(), [], [], [0]
    for root in sorted(nodes):
        if root in index:
            continue
        work = [(root, iter(adj[root]))]
        index[root] = low[root] = counter[0]; counter[0] += 1; stack.append(root); on.add(root)
        while work:
            v, it = work[-1]
            for w in it:
                if w not in index:
                    index[w] = low[w] = counter[0]; counter[0] += 1; stack.append(w); on.add(w)
                    work.append((w, iter(adj[w])))
                    break
                if w in on:
                    low[v] = min(low[v], index[w])
            else:
                work.pop()
                if work:
                    low[work[-1][0]] = min(low[work[-1][0]], low[v])
                if low[v] == index[v]:
                    comp = []
                    while True:
                        w = stack.pop(); on.discard(w); comp.append(w)
                        if w == v:
                            break
                    if len(comp) > 1:
                        out.append(sorted(comp))
    return sorted(out)


def modules():
    def build():
        graph = gitinfo.import_graph()
        base = Path(gitinfo.ROOT)
        files = {p: m for p, m in ((p, module_of(p)) for p in graph) if p.startswith("back-end/src/")}
        nodes = {}
        for p, m in files.items():
            try:
                loc = text_metrics((base / p).read_text(encoding="utf-8", errors="replace"))[0]
            except OSError:
                loc = 0
            n = nodes.setdefault(m, {"id": m, "file_list": [], "loc": 0})
            n["file_list"].append({"path": p, "loc": loc}); n["loc"] += loc
        weights = {}
        for p, m in files.items():
            for t in graph[p]["imports"]:
                tm = files.get(t)
                if tm and tm != m:
                    weights[(m, tm)] = weights.get((m, tm), 0) + 1
        for m, n in nodes.items():
            n["files"] = len(n["file_list"]); n["file_list"].sort(key=lambda f: f["path"])
            n["fan_in"] = len({a for (a, b) in weights if b == m})
            n["fan_out"] = len({b for (a, b) in weights if a == m})
        edges = [{"from": a, "to": b, "weight": w} for (a, b), w in sorted(weights.items())]
        cycles = strongly_connected(list(nodes), list(weights))
        mx = max((n["fan_in"] for n in nodes.values()), default=0)
        return {"nodes": sorted(nodes.values(), key=lambda n: n["id"]), "edges": edges, "cycles": cycles,
                "high_fan_in": sorted(n["id"] for n in nodes.values() if n["fan_in"] >= 3 or (mx > 1 and n["fan_in"] == mx))}
    return _cached(("modules",), 20, build)


# ---------- 4. acoplamento de mudanças ----------
def coupling(days=180, minimum=2, limit=100):
    def build():
        per_file, together, used, skipped = {}, {}, 0, 0
        for _sha, files in _log_files(days):
            files = sorted(f for f in files if not NOISE.search(f))
            if len(files) > MAX_FILES_PER_COMMIT:
                skipped += 1
                continue
            if not files:
                continue
            used += 1
            for f in files:
                per_file[f] = per_file.get(f, 0) + 1
            for a, b in combinations(files, 2):
                together[(a, b)] = together.get((a, b), 0) + 1
        pairs = [{"a": a, "b": b, "together": n, "a_commits": per_file[a], "b_commits": per_file[b], "confidence": round(n / min(per_file[a], per_file[b]), 2)}
                 for (a, b), n in together.items() if n >= minimum]
        pairs.sort(key=lambda x: (-x["together"], -x["confidence"], x["a"], x["b"]))
        return {"days": days, "min": minimum, "commits": used, "skipped_big": skipped, "pairs": pairs[:limit], "total_pairs": len(pairs)}
    return _cached(("coupling", days, minimum), 60, build)


def handle(method, parts, q):
    if method != "GET" or len(parts) != 1:
        raise ValueError("rota desconhecida")
    if parts[0] == "treemap":
        return treemap(_num(q, "days", 90, 7, 730))
    if parts[0] == "complexity":
        return complexity(_num(q, "top", 10, 1, 20), _num(q, "points", 12, 3, 30))
    if parts[0] == "modules":
        return modules()
    if parts[0] == "coupling":
        return coupling(_num(q, "days", 180, 7, 730), _num(q, "min", 2, 1, 50))
    raise ValueError("rota desconhecida")
