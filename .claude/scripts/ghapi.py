"""Integração com o GitHub pelo `gh` (somente leitura).

Toda chamada usa lista de argumentos, tem timeout e saída limitada. Sem `gh` instalado/autenticado ou sem remoto do GitHub,
cada endpoint responde 200 com {"unavailable": true, "reason": ..., "message": ..., "help": [...]} e o resto do painel segue.
Respostas ficam em cache por 60 s (`?refresh=1` ignora o cache). PAINEL_GH_BIN aponta outro binário (usado nos testes).
"""
import json
import os
import re
import shutil
import subprocess
import threading
import time
from datetime import datetime

import gitinfo
from _common import ROOT

TTL = 60
TTL_FAIL = 8          # falhas ficam pouco no cache: quem acabou de rodar `gh auth login` não espera 1 min
MAX_OUT = 2_000_000
MAX_DIFF = 300_000
MAX_LOG = 20_000
_cache = {}
_lock = threading.Lock()
NUM = re.compile(r"^\d{1,9}$")
STATES = ("open", "closed", "all")
TOKEN_RX = re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}")
ANSI_RX = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
TASK_RX = re.compile(r"\b(?:[A-Z]{2,4}-\d{1,3}|RF\d{1,3})\b")


class Unavailable(Exception):
    def __init__(self, reason, message, help_=()):
        super().__init__(message)
        self.reason, self.message, self.help = reason, message, list(help_)

    def payload(self):
        return {"unavailable": True, "reason": self.reason, "message": self.message, "help": self.help}


HELP_INSTALL = ["Instale o GitHub CLI: https://cli.github.com (Arch/Omarchy: sudo pacman -S github-cli).", "Depois rode no terminal: gh auth login"]
HELP_AUTH = ["Rode no terminal: gh auth login", "Escolha GitHub.com, HTTPS e autentique pelo navegador.", "Volte aqui e clique em \"Verificar de novo\"."]
HELP_REMOTE = ["Este repositório não tem um remoto do GitHub (origin).", "Adicione um: git remote add origin https://github.com/<usuário>/<repositório>.git"]


def gh_bin():
    return os.environ.get("PAINEL_GH_BIN") or "gh"


def _clean(text, limit=300):
    return TOKEN_RX.sub("[token]", ANSI_RX.sub("", text or "")).strip()[-limit:]


def _run(args, timeout=25, limit=MAX_OUT):
    """Executa o gh. Devolve (código, saída, erro). Levanta Unavailable se o binário não existir."""
    exe = shutil.which(gh_bin())
    if not exe:
        raise Unavailable("not_installed", "O GitHub CLI (gh) não está instalado.", HELP_INSTALL)
    env = {**os.environ, "GH_PROMPT_DISABLED": "1", "NO_COLOR": "1", "GH_NO_UPDATE_NOTIFIER": "1", "GH_PAGER": "cat", "PAGER": "cat"}
    try:
        r = subprocess.run([exe, *args], cwd=str(gitinfo.REPO), capture_output=True, text=True, timeout=timeout, stdin=subprocess.DEVNULL, env=env)
    except subprocess.TimeoutExpired:
        raise Unavailable("error", f"O gh demorou mais de {timeout} s para responder.")
    except OSError as e:
        raise Unavailable("not_installed", "Não foi possível executar o gh: " + _clean(str(e)), HELP_INSTALL)
    return r.returncode, r.stdout[:limit], r.stderr


def _gh(args, **kw):
    """Roda e exige sucesso; falhas viram Unavailable (autenticação ou erro genérico)."""
    code, out, err = _run(args, **kw)
    if code != 0:
        low = err.lower()
        if "gh auth login" in low or "authentication" in low or "not logged in" in low or "http 401" in low:
            raise Unavailable("not_authenticated", "O gh não está autenticado no GitHub.", HELP_AUTH)
        raise Unavailable("error", "Erro do gh: " + (_clean(err) or f"código {code}"))
    return out


def _json(args, **kw):
    out = _gh(args, **kw)
    try:
        return json.loads(out or "null")
    except ValueError:
        raise Unavailable("error", "Resposta do gh não é JSON.")


def _failed(val):
    """Aviso de indisponibilidade ou status "ainda não pronto": ficam pouco tempo no cache."""
    return isinstance(val, dict) and (val.get("unavailable") is True or val.get("installed") is False or val.get("authenticated") is False or ("installed" in val and not val.get("repo")))


def _cached(key, fn, ttl=TTL):
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < hit[2]:
            return hit[1]
    try:
        val = fn()
    except Unavailable as e:
        val = e.payload()
    life = TTL_FAIL if _failed(val) else ttl
    with _lock:
        _cache[key] = (time.time(), val, life)
    return val


def clear_cache():
    with _lock:
        _cache.clear()


# ---------- estado ----------
def repo_slug():
    r = gitinfo.github_remote()
    if not r:
        raise Unavailable("no_remote", "Não há remoto do GitHub neste repositório.", HELP_REMOTE)
    slug = r["url"].removeprefix("https://github.com/")
    if not re.fullmatch(r"[\w.-]+/[\w.-]+", slug):
        raise Unavailable("no_remote", "Remoto do GitHub inválido.", HELP_REMOTE)
    return slug


def _status():
    base = {"installed": False, "authenticated": False, "repo": None, "user": None, "message": "", "help": []}
    try:
        _run(["--version"], timeout=10)
    except Unavailable as e:
        return {**base, "message": e.message, "help": e.help}
    base["installed"] = True
    try:
        base["repo"] = repo_slug()
    except Unavailable as e:
        return {**base, "message": e.message, "help": e.help}
    try:
        code, out, err = _run(["auth", "status"], timeout=15)
    except Unavailable as e:
        return {**base, "message": e.message, "help": e.help}
    if code != 0:
        return {**base, "message": "O gh não está autenticado no GitHub.", "help": HELP_AUTH}
    m = re.search(r"account\s+(\S+)", ANSI_RX.sub("", out + err))
    return {**base, "authenticated": True, "user": m.group(1) if m else None, "message": "Conectado ao GitHub."}


def status():
    return _cached(("status", gh_bin()), _status)


def _ready():
    """Repositório pronto para consultas, ou Unavailable com o motivo."""
    st = status()
    if not st["installed"]:
        raise Unavailable("not_installed", st["message"], st["help"])
    if not st["repo"]:
        raise Unavailable("no_remote", st["message"], st["help"])
    if not st["authenticated"]:
        raise Unavailable("not_authenticated", st["message"], st["help"])
    return st["repo"]


def _serve(key, fn):
    """Cache + disponibilidade: devolve o payload ou o aviso 'unavailable' (sempre 200)."""
    def work():
        return fn(_ready())
    return _cached((gh_bin(),) + key, work)


# ---------- formatação ----------
def _low(v):
    return v.lower() if isinstance(v, str) and v else None


def rollup(items):
    """Resumo dos checks de um PR/commit: success | failure | pending | none."""
    if not items:
        return "none"
    states = []
    for it in items:
        if it.get("__typename") == "StatusContext":
            s = (it.get("state") or "").upper()
            states.append("failure" if s in ("FAILURE", "ERROR") else "pending" if s in ("PENDING", "EXPECTED") else "success")
        else:
            if (it.get("status") or "").upper() != "COMPLETED":
                states.append("pending")
                continue
            c = (it.get("conclusion") or "").upper()
            states.append("failure" if c in ("FAILURE", "TIMED_OUT", "STARTUP_FAILURE", "ACTION_REQUIRED") else "success")
    return "failure" if "failure" in states else "pending" if "pending" in states else "success"


def _review(decision):
    return {"APPROVED": "approved", "CHANGES_REQUESTED": "changes_requested", "REVIEW_REQUIRED": "review_required"}.get((decision or "").upper(), "none")


def _pr_row(p):
    return {"number": p["number"], "title": p.get("title", ""), "state": p.get("state", "OPEN"), "draft": bool(p.get("isDraft")),
            "author": (p.get("author") or {}).get("login", ""), "branch": p.get("headRefName", ""), "base": p.get("baseRefName", ""),
            "labels": [x["name"] for x in p.get("labels") or []], "checks": rollup(p.get("statusCheckRollup")),
            "review": _review(p.get("reviewDecision")), "updated_at": p.get("updatedAt", ""), "url": p.get("url", "")}


def _epoch(iso):
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()
    except (ValueError, AttributeError):
        return None


def _run_row(r):
    start, end = _epoch(r.get("startedAt")), _epoch(r.get("updatedAt"))
    done = (r.get("status") or "").lower() == "completed"
    dur = max(0, round((end if done else time.time()) - start)) if start and (end or not done) else None
    sha = r.get("headSha", "")
    return {"id": r["databaseId"], "workflow": r.get("workflowName", ""), "status": _low(r.get("status")), "conclusion": _low(r.get("conclusion")),
            "branch": r.get("headBranch", ""), "sha": sha, "short": sha[:7], "title": r.get("displayTitle", ""), "duration_s": dur,
            "created_at": r.get("createdAt", ""), "url": r.get("url", "")}


PR_FIELDS = "number,title,state,isDraft,author,headRefName,baseRefName,labels,reviewDecision,statusCheckRollup,updatedAt,url"
RUN_FIELDS = "databaseId,workflowName,status,conclusion,headBranch,headSha,displayTitle,createdAt,startedAt,updatedAt,url"


def _pr_list(repo, state):
    return _json(["pr", "list", "-R", repo, "--state", state, "--limit", "60", "--json", PR_FIELDS]) or []


def _run_list(repo):
    return _json(["run", "list", "-R", repo, "--limit", "60", "--json", RUN_FIELDS]) or []


# ---------- endpoints ----------
def prs(state="open"):
    if state not in STATES:
        raise ValueError("state inválido (open, closed ou all)")
    def go(repo):
        rows = [_pr_row(p) for p in _pr_list(repo, "all" if state != "open" else "open")]
        if state == "closed":
            rows = [r for r in rows if r["state"] != "OPEN"]
        return {"prs": rows}
    return _serve(("prs", state), go)


def pr(n):
    if not isinstance(n, str) or not NUM.fullmatch(n):
        raise ValueError("número de PR inválido")
    def go(repo):
        d = _json(["pr", "view", n, "-R", repo, "--json", "number,title,body,state,headRefName,baseRefName,url,statusCheckRollup,reviews,commits,labels,author,isDraft,reviewDecision"])
        diff = _gh(["pr", "diff", n, "-R", repo, "--color", "never"], timeout=40, limit=MAX_DIFF + 1)
        checks = [{"name": c.get("name") or c.get("context") or "", "status": _low(c.get("status")) or ("completed" if c.get("state") else None),
                   "conclusion": _low(c.get("conclusion")) or _low(c.get("state")), "url": c.get("detailsUrl") or c.get("targetUrl") or ""} for c in d.get("statusCheckRollup") or []]
        commits = []
        for c in d.get("commits") or []:
            au = (c.get("authors") or [{}])[0]
            commits.append({"sha": c.get("oid", ""), "short": c.get("oid", "")[:7], "subject": c.get("messageHeadline", ""), "author": au.get("login") or au.get("name") or "", "t": c.get("committedDate", "")})
        reviews = [{"author": (r.get("author") or {}).get("login", ""), "state": _low(r.get("state")), "body": (r.get("body") or "")[:400], "t": r.get("submittedAt", "")} for r in d.get("reviews") or []]
        row = _pr_row(d)
        return {**row, "body": (d.get("body") or "")[:6000], "checks": checks, "checks_state": row["checks"], "reviews": reviews, "commits": commits,
                "diff": diff[:MAX_DIFF], "diff_truncated": len(diff) > MAX_DIFF}
    return _serve(("pr", n), go)


def runs():
    def go(repo):
        rows = [_run_row(r) for r in _run_list(repo)]
        return {"runs": rows, "workflows": sorted({r["workflow"] for r in rows})}
    return _serve(("runs",), go)


def run(rid):
    if not isinstance(rid, str) or not NUM.fullmatch(rid):
        raise ValueError("id de execução inválido")
    def go(repo):
        d = _json(["run", "view", rid, "-R", repo, "--json", "jobs,status,conclusion,workflowName,headBranch,headSha,displayTitle,url"])
        jobs = [{"name": j.get("name", ""), "status": _low(j.get("status")), "conclusion": _low(j.get("conclusion")),
                 "steps": [{"name": s.get("name", ""), "status": _low(s.get("status")), "conclusion": _low(s.get("conclusion"))} for s in j.get("steps") or []]} for j in d.get("jobs") or []]
        log = ""
        if any(j["conclusion"] == "failure" for j in jobs):
            code, out, _ = _run(["run", "view", rid, "-R", repo, "--log-failed"], timeout=40, limit=MAX_OUT)
            if code == 0:
                out = re.sub(r"\d{4}-\d\d-\d\dT[\d:.]+Z ?", "", ANSI_RX.sub("", out))
                log = TOKEN_RX.sub("[token]", out)
                if len(log) > MAX_LOG:
                    log = "[… início cortado]\n" + log[-MAX_LOG:]
        return {"id": int(rid), "workflow": d.get("workflowName", ""), "status": _low(d.get("status")), "conclusion": _low(d.get("conclusion")),
                "branch": d.get("headBranch", ""), "sha": d.get("headSha", ""), "title": d.get("displayTitle", ""), "url": d.get("url", ""), "jobs": jobs, "failed_log": log}
    return _serve(("run", rid), go)


def task_ids():
    p = ROOT / ".claude" / "painel" / "tasks.json"
    try:
        return {t["id"] for t in json.loads(p.read_text(encoding="utf-8")).get("tasks", [])}
    except (OSError, ValueError, KeyError):
        return set()


def issues():
    def go(repo):
        known, rows = task_ids(), []
        for i in _json(["issue", "list", "-R", repo, "--state", "open", "--limit", "60", "--json", "number,title,body,labels,assignees,url,updatedAt,author"]) or []:
            text = (i.get("title") or "") + "\n" + (i.get("body") or "")[:4000]
            rows.append({"number": i["number"], "title": i.get("title", ""), "labels": [x["name"] for x in i.get("labels") or []], "assignees": [a["login"] for a in i.get("assignees") or []],
                         "author": (i.get("author") or {}).get("login", ""), "updated_at": i.get("updatedAt", ""), "url": i.get("url", ""), "body": (i.get("body") or "")[:600],
                         "task_ids": sorted({t for t in TASK_RX.findall(text) if t in known})})
        return {"issues": rows}
    return _serve(("issues",), go)


def overview():
    def go(repo):
        plist, rlist = _pr_list(repo, "all"), _run_list(repo)
        by_branch, open_prs = {}, []
        for p in plist:  # a lista vem do mais recente para o mais antigo; PR aberto vence os demais do mesmo branch
            b = p.get("headRefName", "")
            if b and (b not in by_branch or (p.get("state") == "OPEN" and by_branch[b]["state"] != "OPEN")):
                by_branch[b] = {"number": p["number"], "state": p.get("state", "OPEN"), "url": p.get("url", "")}
            if p.get("state") == "OPEN":
                open_prs.append({"number": p["number"], "title": p.get("title", ""), "branch": b, "checks": rollup(p.get("statusCheckRollup")), "url": p.get("url", "")})
        by_sha = {}
        for r in map(_run_row, rlist):
            by_sha.setdefault(r["sha"], {"status": r["status"], "conclusion": r["conclusion"], "workflow": r["workflow"], "url": r["url"]})
        latest = None
        if rlist:
            r = _run_row(rlist[0])
            latest = {"sha": r["sha"], "branch": r["branch"], "status": r["status"], "conclusion": r["conclusion"], "workflow": r["workflow"], "url": r["url"]}
        return {"unavailable": False, "repo": repo, "open_prs": open_prs, "runs_by_sha": by_sha, "prs_by_branch": by_branch, "latest_run": latest}
    return _serve(("overview",), go)


def handle(method, parts, q):
    if method != "GET" or not parts:
        raise ValueError("rota desconhecida")
    if q.get("refresh") == "1":
        clear_cache()
    name = parts[0]
    if name == "status":
        return status()
    if name == "prs":
        return prs(q.get("state", "open"))
    if name == "pr":
        return pr(q.get("n", ""))
    if name == "runs":
        return runs()
    if name == "run":
        return run(q.get("id", ""))
    if name == "issues":
        return issues()
    if name == "overview":
        return overview()
    raise ValueError("rota desconhecida")
