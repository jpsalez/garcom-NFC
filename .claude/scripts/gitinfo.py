"""Informações de git e saúde do código para o painel (somente leitura).

Commits, alterações não commitadas, detalhe com diff, churn e candidatos a refatoração.
Nenhum comando altera o repositório.
"""
import os
import re
import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path

import analise
import monitor as mon
from _common import BACK, ROOT, safe

# Raiz do git: o monorepo inteiro. PAINEL_GIT_ROOT existe só para os testes apontarem para um repositório descartável.
REPO = Path(os.environ["PAINEL_GIT_ROOT"]) if os.environ.get("PAINEL_GIT_ROOT") else ROOT
SHA = re.compile(r"^[0-9a-f]{7,40}$")
TEST_RX = re.compile(r"(^|/)(tests?|__tests__)/|\.(test|spec)\.[tj]sx?$")
_cache = {}


# ---------- cache invalidado por assinatura (só recalcula quando o git ou os fontes mudaram) ----------
def refs_sig():
    """Muda a cada commit, troca de branch, tag ou fetch: mtime de HEAD, packed-refs e de cada arquivo em refs/."""
    g = REPO / ".git"
    out = []
    try:
        for name in ("HEAD", "packed-refs"):
            f = g / name
            out.append(f.stat().st_mtime_ns if f.exists() else 0)
        for dp, _, fns in os.walk(g / "refs"):
            out += [(Path(dp) / x).stat().st_mtime_ns for x in fns]
    except OSError:
        pass
    return tuple(out)


def src_sig():
    """Muda quando qualquer .ts de back-end/src (e tests/) é criado, apagado ou editado."""
    out = []
    for base in (BACK / "src", BACK / "tests"):
        for dp, _, fns in os.walk(base):
            out += [(x, (Path(dp) / x).stat().st_mtime_ns) for x in fns if x.endswith(".ts")]
    return tuple(sorted(out))


def memo(*sigs):
    """Guarda o resultado da função enquanto as assinaturas não mudarem (até 32 combinações de argumentos)."""
    def deco(fn):
        cache = {}
        def wrap(*a, **k):
            key = (a, tuple(sorted(k.items())))
            sig = tuple(s() for s in sigs)
            hit = cache.get(key)
            if hit and hit[0] == sig:
                return hit[1]
            val = fn(*a, **k)
            cache[key] = (sig, val)
            if len(cache) > 32:
                cache.pop(next(iter(cache)))
            return val
        wrap.__wrapped__ = fn
        return wrap
    return deco


def git(*args, timeout=25):
    try:
        r = subprocess.run(["git", "-C", str(REPO), *args], capture_output=True, text=True, timeout=timeout, stdin=subprocess.DEVNULL)
        return r.stdout if r.returncode == 0 else ""
    except (OSError, subprocess.TimeoutExpired):
        return ""


def _ts(iso):
    try:
        return datetime.fromisoformat(iso).timestamp()
    except ValueError:
        return 0


def commits(limit=60):
    fmt = "%x1e%H%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s%x1f%b%x1f"
    out = git("log", "--all", "--date-order", "-n", str(limit), "--numstat", "--pretty=format:" + fmt)
    res = []
    for rec in [r for r in out.split("\x1e") if r.strip()]:
        parts = rec.split("\x1f", 7)
        if len(parts) < 8:
            continue
        sha, par, au, iso, refs, subj, body, stat = parts
        files = []
        for line in stat.strip().splitlines():
            m = re.match(r"^(\d+|-)\t(\d+|-)\t(.+)$", line)
            if m:
                files.append({"path": m.group(3), "add": 0 if m.group(1) == "-" else int(m.group(1)), "del": 0 if m.group(2) == "-" else int(m.group(2))})
        t = _ts(iso)
        res.append({"sha": sha, "short": sha[:7], "parents": par.split(), "author": au, "t": iso, "ts": t,
                    "refs": [x.strip() for x in refs.split(",") if x.strip()], "subject": subj, "body": body.strip()[:500],
                    "files": files, "add": sum(f["add"] for f in files), "del": sum(f["del"] for f in files), "nfiles": len(files),
                    "tests": any(TEST_RX.search(f["path"]) for f in files), "merge": len(par.split()) > 1})
    return res


def repo_path(rel):
    """Caminho relativo à raiz do repo, validado: dentro do projeto, sem `..`, sem segredos, sem começar com `-`."""
    if not isinstance(rel, str) or not rel or "\x00" in rel or rel.startswith(("-", "/")) or ".." in Path(rel).parts:
        raise ValueError("caminho inválido")
    return safe(rel).relative_to(ROOT).as_posix()


def commit_diff(sha, limit=90_000, path=None):
    if not SHA.match(sha):
        raise ValueError("sha inválido")
    spec = ["--", repo_path(path)] if path else []
    out = git("show", "-m", "--first-parent", "--no-color", "--format=", "--patch", "--stat=100", sha, *spec, timeout=30)
    cut = len(out) > limit
    return {"sha": sha, "diff": out[:limit], "truncated": cut}


def commit_text(sha, limit=20_000):
    """Texto do commit (mensagem + diff) para anexar ao contexto de um agente."""
    if not SHA.match(sha):
        raise ValueError("sha inválido")
    out = git("show", "--no-color", "--stat", "--patch", sha, timeout=30)
    return out[:limit] + ("\n[... truncado ...]" if len(out) > limit else "")


def churn(days=30):
    out = git("log", f"--since={days}.days", "--numstat", "--pretty=format:%x1e%H")
    agg = {}
    for rec in out.split("\x1e"):
        for line in rec.strip().splitlines()[1:]:
            m = re.match(r"^(\d+|-)\t(\d+|-)\t(.+)$", line)
            if m:
                a = agg.setdefault(m.group(3), {"commits": 0, "add": 0, "del": 0})
                a["commits"] += 1
                a["add"] += 0 if m.group(1) == "-" else int(m.group(1))
                a["del"] += 0 if m.group(2) == "-" else int(m.group(2))
    return agg


FN_RX = re.compile(r"^(\s*)(?:export\s+)?(?:(?:public|private|protected|static)\s+)*(?:async\s+)?(?:function\s+\w+|(\w+)\s*(?:=\s*(?:async\s*)?)?\([^;{]*\)\s*(?::\s*[^={]+?)?(?:=>)?\s*)\{\s*$")
NOT_FN = {"if", "for", "while", "switch", "catch", "return", "else", "try", "do"}
NAME_RX = re.compile(r"function\s+(\w+)|(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*\(")
DECISION = re.compile(r"\b(?:if|for|while|case|catch)\b|&&|\|\||\?\?|(?<!\?)\?(?![.?:=])")

DEFINITIONS = [
    {"term": "LOC lógico", "def": "Linhas de código sem comentários e sem linhas em branco. Mede tamanho real, não formatação.", "limit": "atenção > 250 por arquivo; alto > 400 (convenção, não norma)"},
    {"term": "Complexidade ciclomática (CC)", "def": "Número de caminhos independentes de uma função (McCabe, 1976): 1 + decisões (if, for, while, case, catch, &&, ||, ??, ?:). Cada caminho precisa de pelo menos um teste. Aqui é uma aproximação por expressão regular, não um parser.", "limit": "atenção > 10; alto > 20 (limite clássico de McCabe/NIST)"},
    {"term": "Função longa", "def": "Linhas entre a abertura e o fechamento da função. Funções longas costumam acumular responsabilidades.", "limit": "atenção > 40; alto > 80 (convenção)"},
    {"term": "Churn (30 dias)", "def": "Quantos commits tocaram o arquivo nos últimos 30 dias, com linhas adicionadas e removidas. Alto churn indica instabilidade ou requisito mudando. Reescrita = removidas ÷ adicionadas.", "limit": "≥ 4 commits em 30 dias merece atenção (convenção)"},
    {"term": "Hotspot", "def": "Churn × CC máxima do arquivo (ideia de Adam Tornhill, 'Your Code as a Crime Scene'): código complexo que muda muito é onde bugs e custo de manutenção se concentram.", "limit": "atenção ≥ 20; alto ≥ 45 (convenção)"},
    {"term": "Fan-in / Fan-out", "def": "Fan-in: quantos arquivos importam este. Fan-out: quantos arquivos este importa. Fan-in alto = mudança se propaga; fan-out alto = muitas dependências.", "limit": "fan-in ≥ 5 pede cuidado com o contrato público"},
    {"term": "Teste correspondente (proxy)", "def": "Existe um arquivo em tests/ cujo nome contém o do módulo. Não é cobertura de código: para cobertura real é preciso rodar o Vitest com cobertura.", "limit": "—"},
    {"term": "Dívida marcada", "def": "Comentários TODO, FIXME, HACK ou XXX: pendências que o autor deixou registradas.", "limit": "—"},
]


def strip_code(text):
    text = re.sub(r"\"(?:\\.|[^\"\\\n])*\"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`", "''", text, flags=re.S)
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def fn_spans(lines):
    """Funções detectadas por indentação: (nome, início, fim). Aproximação."""
    out = []
    for i, ln in enumerate(lines):
        m = FN_RX.match(ln)
        if not m or (m.group(2) and m.group(2) in NOT_FN):
            continue
        ind = m.group(1)
        for j in range(i + 1, min(i + 400, len(lines))):
            if lines[j] == ind + "}" or (lines[j].startswith(ind + "}") and not lines[j].startswith(ind + "} ")):
                nm = NAME_RX.search(ln.strip())
                name = next((g for g in (nm.groups() if nm else ()) if g), "anônima")
                out.append((name, i, j))
                break
    return out


def level_of(cc, longest, loc, hot):
    if cc > 20 or longest > 80 or loc > 400 or hot >= 45:
        return "alto"
    if cc > 10 or longest > 40 or loc > 250 or hot >= 20:
        return "atenção"
    return "ok"


@memo(refs_sig, src_sig)
def health():
    # git devolve caminhos a partir da raiz do monorepo; aqui trabalhamos relativo a back-end/
    cur = {k[len('back-end/'):]: v for k, v in churn(30).items() if k.startswith('back-end/')}
    src = BACK / "src"
    tests = [p.name.lower() for p in (BACK / "tests").rglob("*.ts")] if (BACK / "tests").is_dir() else []
    paths = [p for p in sorted(src.rglob("*.ts")) if not p.name.endswith(".d.ts")]
    rel_of = {p: str(p.relative_to(BACK)) for p in paths}
    by_rel = {r: p for p, r in rel_of.items()}
    fan_in = {r: 0 for r in by_rel}
    fan_out = {}
    for p in paths:
        txt = p.read_text(encoding="utf-8", errors="replace")
        deps = set()
        for imp in re.findall(r"from\s+[\"'](\.[^\"']+)[\"']", txt):
            tgt = str((p.parent / imp).resolve().relative_to(BACK.resolve())) if (p.parent / imp).resolve().is_relative_to(BACK.resolve()) else ""
            if tgt in fan_in:
                deps.add(tgt)
                fan_in[tgt] += 1
        fan_out[rel_of[p]] = len(deps)
    rows, funcs = [], []
    for p in paths:
        rel = rel_of[p]
        text = p.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        loc = sum(1 for ln in strip_code(text).splitlines() if ln.strip())
        spans = fn_spans(lines)
        cc_max, longest = 1, 0
        for name, a, b in spans:
            body = strip_code("\n".join(lines[a:b + 1]))
            cc = 1 + len(DECISION.findall(body))
            ln = b - a + 1
            cc_max, longest = max(cc_max, cc), max(longest, ln)
            funcs.append({"name": name, "path": rel, "line": a + 1, "lines": ln, "cc": cc})
        todos = len(re.findall(r"\b(?:TODO|FIXME|HACK|XXX)\b", text))
        ch = cur.get(rel, {"commits": 0, "add": 0, "del": 0})
        stem = p.stem.split(".")[0].lower()
        has_test = any(stem in t for t in tests)
        hot = ch["commits"] * cc_max
        rows.append({"path": rel, "loc": loc, "functions": len(spans), "cc_max": cc_max, "longest_fn": longest, "todos": todos, "churn": ch,
                     "hotspot": hot, "fan_in": fan_in.get(rel, 0), "fan_out": fan_out.get(rel, 0), "has_test": has_test,
                     "level": level_of(cc_max, longest, loc, hot),
                     "rewrite": round(ch["del"] / max(1, ch["add"]), 2) if ch["commits"] else 0})
    order = {"alto": 0, "atenção": 1, "ok": 2}
    rows.sort(key=lambda r: (order[r["level"]], -r["hotspot"], -r["cc_max"], -r["loc"]))
    funcs.sort(key=lambda f: (-f["cc"], -f["lines"]))

    def advice(r):
        out = []
        top = max((f for f in funcs if f["path"] == r["path"]), key=lambda f: f["cc"], default=None)
        if r["cc_max"] > 10 and top:
            out.append(f"Reduza a complexidade de `{top['name']}` (CC {top['cc']}): use guard clauses para sair cedo, extraia ramos para funções nomeadas ou troque cadeias de if por uma tabela de decisão.")
        if r["longest_fn"] > 40:
            out.append(f"Divida a maior função ({r['longest_fn']} linhas) em partes com uma responsabilidade cada.")
        if r["loc"] > 250:
            out.append(f"{r['loc']} linhas lógicas: verifique se o arquivo mistura responsabilidades e separe por módulo.")
        if r["churn"]["commits"] >= 4:
            out.append(f"Alterado {r['churn']['commits']} vezes em 30 dias: estabilize o contrato e, antes de mexer, escreva um teste de caracterização do comportamento atual.")
        if not r["has_test"] and r["loc"] > 60:
            out.append("Sem teste correspondente: cubra o comportamento atual antes de refatorar.")
        if r["fan_in"] >= 5:
            out.append(f"{r['fan_in']} arquivos dependem deste: a mudança se propaga, preserve a assinatura pública.")
        return out

    flagged = [r for r in rows if r["level"] != "ok"]
    watch = flagged or sorted(rows, key=lambda r: -(r["churn"]["commits"] * 10 + r["loc"] / 10))[:3]
    prio = [{"path": r["path"], "level": r["level"], "advice": advice(r), "row": r} for r in watch[:5]]
    bands = {"ok": 0, "atenção": 0, "alto": 0}
    for r in rows:
        bands[r["level"]] += 1
    return {"summary": {"files": len(rows), "functions": len(funcs), "complex_functions": sum(1 for f in funcs if f["cc"] > 10), "hotspots": sum(1 for r in rows if r["hotspot"] >= 20),
                        "todos": sum(r["todos"] for r in rows), "untested": sum(1 for r in rows if not r["has_test"] and r["loc"] > 60), "bands": bands,
                        "max_cc": max((f["cc"] for f in funcs), default=0), "loc": sum(r["loc"] for r in rows)},
            "priorities": prio, "all_ok": not flagged, "files": rows, "functions": funcs[:10], "all_functions": funcs,
            "top_churn": sorted(({"path": k, **v} for k, v in cur.items() if k.startswith("src/")), key=lambda x: -(x["commits"] * 10 + x["add"] + x["del"]))[:8],
            "definitions": DEFINITIONS,
            "note": "Métricas estáticas aproximadas (regex, sem parser). Limites são convenções, não normas. Servem para priorizar leitura, não para julgar o código."}


# ---------- árvore de trabalho e ramos ----------
def worktree():
    out = git("status", "--porcelain=v1", "-b", "--untracked-files=all")
    lines = out.splitlines()
    branch, ahead, behind = "", 0, 0
    if lines and lines[0].startswith("## "):
        h = lines[0][3:]
        branch = h.split("...")[0].split(" ")[0]
        m = re.search(r"ahead (\d+)", h)
        ahead = int(m.group(1)) if m else 0
        m = re.search(r"behind (\d+)", h)
        behind = int(m.group(1)) if m else 0
        lines = lines[1:]
    num = {}
    for ln in git("diff", "HEAD", "--numstat").splitlines():
        m = re.match(r"^(\d+|-)\t(\d+|-)\t(.+)$", ln)
        if m:
            num[m.group(3)] = (0 if m.group(1) == "-" else int(m.group(1)), 0 if m.group(2) == "-" else int(m.group(2)))
    files = []
    for ln in lines:
        code, path = ln[:2], ln[3:].split(" -> ")[-1].strip('"')
        st = "novo" if code == "??" else "apagado" if "D" in code else "renomeado" if "R" in code else "adicionado" if "A" in code else "modificado"
        add, dele = num.get(path, (0, 0))
        if code == "??":
            try:
                add = sum(1 for _ in (REPO / path).read_text(encoding="utf-8", errors="ignore").splitlines()) if (REPO / path).stat().st_size < 300_000 else 0
            except OSError:
                add = 0
        files.append({"path": path, "status": st, "add": add, "del": dele})
    return {"branch": branch, "ahead": ahead, "behind": behind, "files": files, "clean": not files, "groups": worktree_groups()}


def worktree_diff(path, kind="all"):
    """Diff de um arquivo não commitado. kind: staged | unstaged | untracked | all (tudo contra o HEAD)."""
    rel = repo_path(path)
    if kind not in ("all", "staged", "unstaged", "untracked"):
        raise ValueError("tipo inválido")
    p = REPO / rel
    if kind == "staged":
        return {"path": rel, "diff": git("diff", "--cached", "--no-color", "--", rel)[:90_000]}
    if kind == "unstaged":
        return {"path": rel, "diff": git("diff", "--no-color", "--", rel)[:90_000]}
    if kind == "all" and git("ls-files", "--error-unmatch", rel):
        return {"path": rel, "diff": git("diff", "HEAD", "--no-color", "--", rel)[:90_000]}
    try:
        txt = p.read_text(encoding="utf-8", errors="replace")[:60_000]
    except OSError:
        raise ValueError("arquivo ilegível")
    body = "\n".join("+" + ln for ln in txt.splitlines())
    return {"path": rel, "diff": f"diff --git a/{rel} b/{rel}\nnew file mode 100644\n--- /dev/null\n+++ b/{rel}\n@@ -0,0 +1,{len(txt.splitlines())} @@\n{body}\n"}


def branches():
    fmt = "%(refname:short)%1f%(objectname:short)%1f%(committerdate:iso-strict)%1f%(subject)"
    out = git("for-each-ref", "--sort=-committerdate", "--format=" + fmt, "refs/heads", "refs/remotes")
    res = []
    for ln in out.splitlines():
        p = ln.split("\x1f")
        if len(p) == 4 and not p[0].endswith("/HEAD"):
            res.append({"name": p[0], "sha": p[1], "t": p[2], "subject": p[3], "remote": "/" in p[0]})
    return res


# ---------- visualizador de arquivos: status, blame, histórico, imports ----------
def status_map():
    """{caminho: M|A|D|?} das alterações não commitadas (staged, não staged e novos)."""
    out = git("status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames")
    res = {}
    for ent in out.split("\0"):
        if len(ent) > 3:
            code = ent[:2]
            res[ent[3:]] = "?" if code == "??" else "D" if "D" in code else "A" if "A" in code else "M"
    return res


def blame(rel):
    """Blame do arquivo na versão do disco: grupos de linhas consecutivas do mesmo commit."""
    path = repo_path(rel)
    out = git("blame", "--porcelain", "--", path, timeout=40)
    if not out:
        raise ValueError("sem blame (arquivo não rastreado pelo git?)")
    commits, shas, cur = {}, [], ""
    for ln in out.split("\n"):
        if ln.startswith("\t"):
            shas.append(cur)
            continue
        m = re.match(r"^([0-9a-f]{40}) \d+ \d+(?: \d+)?$", ln)
        if m:
            cur = m.group(1)
            commits.setdefault(cur, {})
            continue
        k, _, v = ln.partition(" ")
        if k in ("author", "author-time", "summary"):
            commits[cur][k] = v
    groups = []
    for i, sha in enumerate(shas, 1):
        if groups and groups[-1]["sha"] == sha:
            groups[-1]["n"] += 1
            continue
        c = commits[sha]
        groups.append({"start": i, "n": 1, "sha": sha, "short": sha[:7], "author": c.get("author", ""),
                       "ts": int(c.get("author-time", 0)), "summary": c.get("summary", ""), "uncommitted": set(sha) == {"0"}})
    return {"path": path, "lines": len(shas), "groups": groups}


def file_log(rel, limit=100):
    """Commits que mexeram no arquivo (segue renomeações)."""
    path = repo_path(rel)
    out = git("log", "--follow", f"-n{int(limit)}", "--format=%H%x1f%an%x1f%aI%x1f%s", "--", path, timeout=30)
    res = []
    for ln in out.splitlines():
        p = ln.split("\x1f")
        if len(p) == 4:
            res.append({"sha": p[0], "short": p[0][:7], "author": p[1], "t": p[2], "ts": _ts(p[2]), "subject": p[3]})
    return {"path": path, "commits": res}


CODE_EXT = (".ts", ".tsx", ".js", ".mjs", ".cjs")
IMPORT_RX = re.compile(r"""(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)""")
_graph = {"t": 0.0, "g": {}}


def _code_files():
    roots = [BACK / "src", BACK / "prisma", ROOT / "front-end"]
    for root in roots:
        for dp, dns, fns in os.walk(root):
            dns[:] = [d for d in dns if d not in ("node_modules", ".next", ".git", "generated")]
            for f in fns:
                if f.endswith(CODE_EXT) and not f.endswith(".d.ts"):
                    yield Path(dp) / f


def _resolve(src, spec, files):
    if spec.startswith("@/"):
        base = ROOT / "front-end" / spec[2:]
    elif spec.startswith("."):
        base = (src.parent / spec)
    else:
        return None
    base = Path(os.path.normpath(base))
    for cand in [base] + [Path(str(base) + e) for e in CODE_EXT] + [base / ("index" + e) for e in CODE_EXT]:
        if cand in files:
            return cand
    return None


def import_graph():
    """{caminho: {imports: [...], imported_by: [...]}} entre os arquivos de código do monorepo (cache de 20 s)."""
    if time.time() - _graph["t"] < 20:
        return _graph["g"]
    files = set(_code_files())
    edges = {f: set() for f in files}
    for f in files:
        try:
            txt = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for m in IMPORT_RX.finditer(txt):
            spec = next((g for g in m.groups() if g), "")
            tgt = _resolve(f, spec, files)
            if tgt and tgt != f:
                edges[f].add(tgt)
    rel = lambda x: x.relative_to(ROOT).as_posix()
    g = {rel(f): {"imports": sorted(rel(t) for t in ts), "imported_by": []} for f, ts in edges.items()}
    for f, ts in edges.items():
        for t in ts:
            g[rel(t)]["imported_by"].append(rel(f))
    for v in g.values():
        v["imported_by"].sort()
    _graph.update(t=time.time(), g=g)
    return g


health_cached = health  # health() já é memoizada por assinatura


def github_remote():
    """{url, branch} se o origin for do GitHub (https ou ssh); senão None."""
    url = git("remote", "get-url", "origin").strip()
    m = re.match(r"^(?:https://github\.com/|git@github\.com:)([\w.-]+/[\w.-]+?)(?:\.git)?$", url)
    if not m:
        return None
    return {"url": "https://github.com/" + m.group(1), "branch": git("rev-parse", "--abbrev-ref", "HEAD").strip() or "main"}


def file_meta(rel):
    """Tudo o que o painel de contexto do arquivo mostra (sem tarefas/decisões, que vêm do servidor do painel)."""
    path = repo_path(rel)
    last = git("log", "-1", "--format=%H%x1f%an%x1f%aI%x1f%s", "--", path).strip().split("\x1f")
    g = import_graph().get(path, {"imports": [], "imported_by": []})
    row = None
    if path.startswith("back-end/src/"):
        row = next((r for r in health_cached()["files"] if r["path"] == path[len("back-end/"):]), None)
    return {"path": path, "status": status_map().get(path, ""),
            "last_commit": {"sha": last[0], "short": last[0][:7], "author": last[1], "t": last[2], "subject": last[3]} if len(last) == 4 else None,
            "imports": g["imports"], "imported_by": g["imported_by"], "health": row, "github": github_remote()}


# ---------- grafo, detalhe, comparação, worktree e atividade ----------
DATE_RX = re.compile(r"^\d{4}-\d{2}-\d{2}$")
REF_RX = re.compile(r"^[A-Za-z0-9_][\w./-]{0,99}$")
GRAPH_FMT = "%x1e%H%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s%x1f"


def check_ref(ref):
    """Aceita sha (hex 7–40) ou nome de branch/tag que exista; recusa o resto (nada começa com `-`)."""
    if not isinstance(ref, str):
        raise ValueError("referência inválida")
    if SHA.match(ref):
        return ref
    if REF_RX.match(ref) and ".." not in ref and not ref.endswith((".lock", "/")) and git("rev-parse", "--verify", "--quiet", "--end-of-options", ref + "^{commit}").strip():
        return ref
    raise ValueError("referência inválida: " + str(ref)[:40])


def parse_refs(raw):
    """'HEAD -> main, origin/main, tag: v1' → lista de {name, kind, current}."""
    res = []
    for item in [x.strip() for x in raw.split(",") if x.strip()]:
        if item.startswith("HEAD -> "):
            res.append({"name": item[8:], "kind": "branch", "current": True})
        elif item == "HEAD":
            res.append({"name": "HEAD", "kind": "head", "current": True})
        elif item.startswith("tag: "):
            res.append({"name": item[5:], "kind": "tag", "current": False})
        elif item.endswith("/HEAD"):
            continue
        else:
            res.append({"name": item, "kind": "remote" if "/" in item else "branch", "current": False})
    return res


GREP_RX = re.compile(r"^[A-Z]{2,4}-\d{1,3}[a-z]?$")


def _filters(branch, author, path, since, until, grep=None):
    """Argumentos de filtro do `git log` (sempre validados; cada valor é um único argumento)."""
    args = [check_ref(branch)] if branch else ["--all"]
    if author:
        if len(author) > 60 or "\n" in author:
            raise ValueError("autor inválido")
        args += ["--fixed-strings", f"--author={author}"]
    if grep:
        if not GREP_RX.match(grep):
            raise ValueError("grep aceita só ids de tarefa (ex.: SES-01)")
        args += ["--fixed-strings", f"--grep={grep}"]
    for flag, v in (("--since", since), ("--until", until)):
        if v:
            if not DATE_RX.match(v):
                raise ValueError("data inválida (use AAAA-MM-DD)")
            args.append(f"{flag}={v}" + (" 23:59:59" if flag == "--until" else ""))
    return args, (["--", repo_path(path)] if path else [])


@memo(refs_sig)
def graph(limit=300, skip=0, branch=None, author=None, path=None, since=None, until=None, grep=None):
    """Commits em ordem topológica com `parents` (para o desenho do grafo), sem a lista de arquivos."""
    limit, skip = max(1, min(int(limit), 1000)), max(0, int(skip))
    flt, spec = _filters(branch, author, path, since, until, grep)
    out = git("log", "--topo-order", f"-n{limit}", f"--skip={skip}", "--numstat", "--pretty=format:" + GRAPH_FMT, *flt, *spec, timeout=40)
    res = []
    for rec in [r for r in out.split("\x1e") if r.strip()]:
        parts = rec.split("\x1f", 6)
        if len(parts) < 7:
            continue
        sha, par, au, iso, refs, subj, stat = parts
        add = dele = n = 0
        tests = False
        for line in stat.strip().splitlines():
            m = re.match(r"^(\d+|-)\t(\d+|-)\t(.+)$", line)
            if m:
                n += 1
                add += 0 if m.group(1) == "-" else int(m.group(1))
                dele += 0 if m.group(2) == "-" else int(m.group(2))
                tests = tests or bool(TEST_RX.search(m.group(3)))
        res.append({"sha": sha, "short": sha[:7], "parents": par.split(), "author": au, "t": iso, "ts": _ts(iso), "refs": parse_refs(refs),
                    "subject": subj, "add": add, "del": dele, "nfiles": n, "tests": tests, "merge": len(par.split()) > 1})
    total = git("rev-list", "--count", *flt, *spec).strip()
    authors = sorted({a for a in git("log", "--all", "--format=%an").splitlines() if a})
    return {"commits": res, "total": int(total or 0), "skip": skip, "authors": authors}


def commit_info(sha):
    """Cabeçalho completo do commit: mensagem, arquivos (+/−) e branches que o contêm."""
    if not SHA.match(sha):
        raise ValueError("sha inválido")
    out = git("show", "-m", "--first-parent", "--no-color", "--numstat", "--format=%H%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s%x1f%b%x1e", sha, timeout=30)
    head, _, stat = out.partition("\x1e")
    p = head.split("\x1f", 6)
    if len(p) < 7:
        raise ValueError("commit não encontrado")
    files = []
    for line in stat.strip().splitlines():
        m = re.match(r"^(\d+|-)\t(\d+|-)\t(.+)$", line)
        if m:
            files.append({"path": m.group(3), "add": 0 if m.group(1) == "-" else int(m.group(1)), "del": 0 if m.group(2) == "-" else int(m.group(2))})
    remotes = set(git("remote").split())
    branches = [b for b in git("branch", "-a", "--contains", p[0], "--format=%(refname:short)").splitlines() if b and b not in remotes and not b.endswith("/HEAD")][:20]
    return {"sha": p[0], "short": p[0][:7], "parents": p[1].split(), "author": p[2], "t": p[3], "ts": _ts(p[3]), "refs": parse_refs(p[4]),
            "subject": p[5], "body": p[6].strip(), "files": files, "branches": branches}


def blob(sha, path, limit=400_000):
    """Texto do arquivo numa revisão (para expandir o contexto escondido de um diff)."""
    if not SHA.match(sha):
        raise ValueError("sha inválido")
    out = git("show", f"{sha}:{repo_path(path)}", timeout=20)
    if not out:
        raise ValueError("arquivo não existe nessa versão")
    return {"text": out[:limit], "truncated": len(out) > limit}


def compare(a, b, limit=90_000):
    """Diff entre dois pontos (`a...b`, a partir do ancestral comum) e os commits que b tem a mais."""
    a, b = check_ref(a), check_ref(b)
    diff = git("diff", "--no-color", "--stat=100", "--patch", f"{a}...{b}", timeout=40)
    log = git("log", "--topo-order", "-n200", "--format=%H%x1f%an%x1f%aI%x1f%s", f"{a}..{b}").splitlines()
    commits = []
    for ln in log:
        q = ln.split("\x1f")
        if len(q) == 4:
            commits.append({"sha": q[0], "short": q[0][:7], "author": q[1], "t": q[2], "ts": _ts(q[2]), "subject": q[3]})
    return {"a": a, "b": b, "b_sha": git("rev-parse", "--verify", "--end-of-options", b + "^{commit}").strip(), "diff": diff[:limit], "truncated": len(diff) > limit, "commits": commits}


def activity(days=84):
    """Commits e linhas +/− por dia (para o calendário e o gráfico), arquivos mais mexidos e % de commits que tocam testes."""
    days = max(7, min(int(days), 365))
    out = git("log", "--all", f"--since={days}.days", "--date=short", "--numstat", "--pretty=format:%x1e%ad", timeout=40)
    per, files, ncommits, with_tests = {}, {}, 0, 0
    for rec in [r for r in out.split("\x1e") if r.strip()]:
        lines = rec.strip().splitlines()
        d = per.setdefault(lines[0], {"commits": 0, "add": 0, "del": 0})
        d["commits"] += 1
        ncommits += 1
        touched = False
        for ln in lines[1:]:
            m = re.match(r"^(\d+|-)\t(\d+|-)\t(.+)$", ln)
            if m:
                d["add"] += 0 if m.group(1) == "-" else int(m.group(1))
                d["del"] += 0 if m.group(2) == "-" else int(m.group(2))
                files[m.group(3)] = files.get(m.group(3), 0) + 1
                touched = touched or bool(TEST_RX.search(m.group(3)))
        with_tests += touched
    today = datetime.now().astimezone().date()
    series = []
    for i in range(days - 1, -1, -1):
        day = (today - timedelta(days=i)).isoformat()
        series.append({"d": day, **per.get(day, {"commits": 0, "add": 0, "del": 0})})
    top = sorted(({"path": k, "commits": v} for k, v in files.items() if not k.endswith(("lock", "lock.yaml", "lock.json"))), key=lambda x: -x["commits"])[:5]
    return {"days": series, "commits": ncommits, "with_tests": with_tests, "top_files": top,
            "add": sum(x["add"] for x in series), "del": sum(x["del"] for x in series)}


def worktree_groups():
    """Alterações não commitadas separadas em staged / não staged / não rastreados, com +/− de cada."""
    out = git("status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames")
    staged_n, unstaged_n = {}, {}
    for key, args in ((staged_n, ["--cached"]), (unstaged_n, [])):
        for ln in git("diff", *args, "--numstat").splitlines():
            m = re.match(r"^(\d+|-)\t(\d+|-)\t(.+)$", ln)
            if m:
                key[m.group(3)] = (0 if m.group(1) == "-" else int(m.group(1)), 0 if m.group(2) == "-" else int(m.group(2)))
    groups = {"staged": [], "unstaged": [], "untracked": []}
    st = lambda c: {"M": "modificado", "A": "adicionado", "D": "apagado"}.get(c, "modificado")
    for ent in out.split("\0"):
        if len(ent) <= 3:
            continue
        x, y, path = ent[0], ent[1], ent[3:]
        if x + y == "??":
            groups["untracked"].append({"path": path, "status": "novo", "add": 0, "del": 0})
            continue
        if x not in " ?":
            a, d = staged_n.get(path, (0, 0))
            groups["staged"].append({"path": path, "status": st(x), "add": a, "del": d})
        if y not in " ?":
            a, d = unstaged_n.get(path, (0, 0))
            groups["unstaged"].append({"path": path, "status": st(y), "add": a, "del": d})
    return groups


def summary():
    """Resumo do monorepo: branch, à frente/atrás do remoto, alterações por pasta e últimos commits."""
    out = git("status", "--porcelain=v2", "--branch", "--untracked-files=all")
    info = {"branch": "", "upstream": "", "ahead": 0, "behind": 0}
    areas = {"back-end": {}, "front-end": {}, "raiz": {}}
    for ln in out.splitlines():
        if ln.startswith("# branch.head "):
            info["branch"] = ln[14:]
        elif ln.startswith("# branch.upstream "):
            info["upstream"] = ln[18:]
        elif ln.startswith("# branch.ab "):
            m = re.match(r"# branch\.ab \+(\d+) -(\d+)", ln)
            if m:
                info["ahead"], info["behind"] = int(m.group(1)), int(m.group(2))
    for path, code in status_map().items():
        top = path.split("/")[0]
        area = areas[top] if top in ("back-end", "front-end") else areas["raiz"]
        area[code] = area.get(code, 0) + 1
    return {**info, "areas": areas, "recent": graph(10)["commits"], "clean": not any(areas[a] for a in areas)}
