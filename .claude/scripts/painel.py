#!/usr/bin/env python3
"""Painel de controle do garcom-NFC (servidor local).

  python3 .claude/scripts/painel.py            http://127.0.0.1:8765
  python3 .claude/scripts/painel.py --open     abre o navegador

O que faz:
  - Agentes: inicia agentes do projeto (.claude/agents) como sessões próprias do Claude Code em modo
    não interativo, deixa você conversar (continua a sessão), anexar contexto, pausar, continuar e parar.
  - Ao vivo: mostra agentes, tarefa/prompt e origem; controla processos do painel e observa sessões externas.
  - Projeto: navega, busca e lê arquivos; anexa arquivos ao contexto dos agentes.
  - Verificar: roda os scripts de verificação e mostra o git; Decisões: edita decisoes.md.

Segurança: escuta só em 127.0.0.1; toda chamada exige um token que só a página servida pelo painel recebe; agentes do painel rodam
com permissões mínimas (somente leitura, salvo a edição da base de conhecimento pelo doc-sync); leitura de
arquivos bloqueia .env, chaves e node_modules; só scripts de uma lista fixa são executados.
"""
import argparse
import gzip
import hashlib
import json
import os
import secrets
import signal
import subprocess
import sys
import time
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import agentes
import analise
import ghapi
import gitinfo
import insights
import quality
import realtime
import tarefas
import monitor as mon
from agentes import LOCK, PIPES, RUNS, load_runs
from _common import KNOW, MAX_FILE, ROOT, blocked, now, read_text, safe

SCRIPTS = ROOT / ".claude" / "scripts"
TOKEN = secrets.token_urlsafe(18)
SKIP_DIRS = {"node_modules", ".git", "generated", "__pycache__", ".vscode", ".next", "dist", "coverage"}
TEXT_EXT = {".ts", ".js", ".json", ".md", ".prisma", ".sql", ".yml", ".yaml", ".toml", ".py", ".sh", ".html",
            ".css", ".txt", ".example", ".test", ".dot", ".svg", ".tsx", ".mjs", ".cjs", ".env"}
SCRIPT_CMDS = {
    "verify": [sys.executable, "-B", str(SCRIPTS / "verify.py")],
    "check_tenant": [sys.executable, "-B", str(SCRIPTS / "check_tenant.py")],
    "routes": [sys.executable, "-B", str(SCRIPTS / "routes_inventory.py")],
    "doc_drift": [sys.executable, "-B", str(SCRIPTS / "doc_drift.py")],
    "repo_map": [sys.executable, "-B", str(SCRIPTS / "repo_map.py")],
    "ai_mode": [sys.executable, "-B", str(SCRIPTS / "ai_mode.py"), "status"],
}
STATIC = SCRIPTS / "static"
COMPRESSIBLE = {"application/json", "text/javascript", "text/css", "text/html", "image/svg+xml"}
ALLOWED_HOSTS = set()  # preenchido em main() com a porta escolhida
STATIC_TYPES = {".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
                ".svg": "image/svg+xml", ".woff2": "font/woff2", ".html": "text/html; charset=utf-8", ".map": "application/json"}
# Sem JS inline: só scripts do próprio painel. Estilo inline liberado porque as telas definem estilos por JS.
CSP = ("default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
       "font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")


def build_id():
    """Carimbo da versão que está no ar (mostrado no rodapé do menu): commit atual + hora do arquivo estático mais novo."""
    try:
        sha = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "--short", "HEAD"], capture_output=True, text=True, timeout=5).stdout.strip()
        novo = max(f.stat().st_mtime for f in STATIC.rglob("*") if f.is_file())
        return f"{sha or 'sem-git'} · {datetime.fromtimestamp(novo).strftime('%d/%m %H:%M')}"
    except (OSError, ValueError, subprocess.SubprocessError):
        return "?"


# ---------- arquivos (com bloqueios) ----------
def is_text(p: Path) -> bool:
    return p.suffix.lower() in TEXT_EXT or p.name in ("Dockerfile", ".gitignore", ".prettierignore")


def tree(rel: str):
    d = safe(rel)
    out = []
    for c in sorted(d.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower())):
        if c.name in SKIP_DIRS or (c.is_dir() and c.name == "painel") or blocked(c):
            continue
        out.append({"name": c.name, "dir": c.is_dir(), "size": 0 if c.is_dir() else c.stat().st_size,
                    "path": str(c.relative_to(ROOT))})
    return out


_walk_cache = {"t": 0, "files": []}


def all_files():
    if time.time() - _walk_cache["t"] > 20:
        files = []
        for dp, dns, fns in os.walk(ROOT):
            dns[:] = [x for x in dns if x not in SKIP_DIRS and x != "painel"]
            for f in fns:
                p = Path(dp) / f
                if not blocked(p) and is_text(p):
                    files.append(p)
        _walk_cache.update(t=time.time(), files=files)
    return _walk_cache["files"]


def find_files(q: str):
    q = q.lower()
    return [str(p.relative_to(ROOT)) for p in all_files() if q in str(p.relative_to(ROOT)).lower()][:30]


def grep(q: str):
    """Busca no conteúdo: cada achado traz o trecho em volta e onde, nele, está o termo (col/len)."""
    if len(q) < 2:
        return []
    ql, hits = q.lower(), []
    for p in all_files():
        try:
            if p.stat().st_size > MAX_FILE:
                continue
            for i, line in enumerate(p.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
                at = line.lower().find(ql)
                if at >= 0:
                    start = max(0, at - 50)
                    snippet = line[start:start + 160]
                    hits.append({"path": str(p.relative_to(ROOT)), "line": i, "text": snippet, "col": at - start, "len": len(q)})
                    if len(hits) >= 120:
                        return hits
        except OSError:
            pass
    return hits


# ---------- execução de scripts / git / decisões ----------
def run_cmd(cmd, timeout=180):
    try:
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=timeout, stdin=subprocess.DEVNULL)
        return {"code": r.returncode, "out": (r.stdout + r.stderr)[-30_000:]}
    except subprocess.TimeoutExpired:
        return {"code": -1, "out": f"tempo esgotado ({timeout}s)"}
    except OSError as e:
        return {"code": -1, "out": str(e)}


def git_info():
    g = ["git", "-C", str(ROOT / "back-end")]
    return {"status": run_cmd(g + ["status", "--short", "--branch"], 20)["out"],
            "diffstat": run_cmd(g + ["diff", "--stat"], 20)["out"],
            "log": run_cmd(g + ["log", "-8", "--oneline"], 20)["out"]}


DEC = KNOW / "decisoes.md"
MON = None


def live(session=None):
    panel_sessions = {r.session for r in RUNS.values() if r.session}
    mon_ = mon.Monitor(session)
    mon_.tails = MON.tails  # reaproveita leitura incremental
    mon_.exclude = panel_sessions
    snap = mon_.snapshot()
    files = sorted(mon.PROJ.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)[:8]
    snap["sessions"] = [{"id": f.stem, "mtime": datetime.fromtimestamp(f.stat().st_mtime).strftime("%d/%m %H:%M"),
                         "panel": f.stem in panel_sessions} for f in files]
    return snap


def activity(session=None):
    """Resumo de atribuição e controle, sem devolver o rastro de ferramentas."""
    agents = []
    for r in RUNS.values():
        prompt = next((e.get("text", "") for e in reversed(r.events) if e.get("k") == "user"), "")
        prompt = prompt.split("\n\n[Contexto compartilhado", 1)[0]
        pipe = PIPES.get(r.pipeline) if r.pipeline else None
        process = bool(r.proc and r.proc.poll() is None)
        agents.append({
            "id": r.id, "agent": r.agent, "status": r.status, "prompt": prompt[:30000],
            "task": r.team_task or (pipe.task if pipe else "") or r.title,
            "triggered_by": ("Receita: " + pipe.recipe.get("nome", pipe.recipe["id"])) if pipe else "Você / painel",
            "source": "receita" if pipe else r.source, "session": r.session,
            "controllable": process, "resumable": bool(not process and r.session and r.status not in ("rodando", "pausado")),
            "can_pause": process and hasattr(os, "killpg") and hasattr(signal, "SIGSTOP"),
            "can_resume": process and hasattr(os, "killpg") and hasattr(signal, "SIGCONT"),
            "started": r.started, "budget": r.budget,
        })
    try:
        snap = live(session)
        external = [{"id": "external:" + str(snap["session"]) + ":" + a["id"],
                     "agent": a["type"] if a["id"] != "principal" else a["name"],
                     "status": a["status"], "prompt": a.get("prompt", ""), "task": a["name"],
                     "triggered_by": a.get("triggered_by", "Não registrado"), "source": "externo",
                     "session": snap["session"], "controllable": False, "resumable": False,
                     "started": a["first"], "budget": None} for a in snap["agents"]]
        agents.extend(external)
        external_error = None
    except (OSError, ValueError, RuntimeError, AttributeError) as e:
        external_error = "Não foi possível consultar a sessão externa."
    return {"agents": agents, "external_error": external_error, "updated_at": now()}


def sessions_list():
    panel = {r.session for r in RUNS.values() if r.session}
    out = []
    for f in sorted(mon.PROJ.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)[:12]:
        try:
            title = analise.title_of(f) or f.stem[:8]
        except OSError:
            title = f.stem[:8]
        out.append({"id": f.stem, "title": title, "mtime": datetime.fromtimestamp(f.stat().st_mtime).strftime("%d/%m %H:%M"),
                    "size": f.stat().st_size, "panel": f.stem in panel})
    return out


# ---------- orquestrador local (sem LLM): roteamento por gatilhos, equipes, histórico, linha do tempo ----------
HISTORY = ROOT / ".claude" / "painel" / "history.jsonl"
def record_check(name, res):
    if name not in ("verify", "check_tenant", "doc_drift"):
        return
    first = (res["out"].strip().splitlines() or [""])[0][:120]
    if name == "check_tenant":
        ok = "OK" in first
    elif name == "doc_drift":
        ok = "sem diferenças" in res["out"]
    else:
        ok = res["code"] == 0
    HISTORY.parent.mkdir(parents=True, exist_ok=True)
    with open(HISTORY, "a", encoding="utf-8") as f:
        f.write(json.dumps({"t": time.time(), "name": name, "ok": bool(ok), "summary": first}, ensure_ascii=False) + "\n")


def history(limit=120):
    if not HISTORY.exists():
        return []
    rows = []
    for ln in HISTORY.read_text(encoding="utf-8").splitlines()[-limit:]:
        try:
            rows.append(json.loads(ln))
        except ValueError:
            pass
    return rows


def timeline(days):
    now_t = time.time()
    t0 = now_t - days * 86400
    sessions = []
    for f in sorted(mon.PROJ.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)[:14]:
        try:
            p = analise.parse_file(f)
        except OSError:
            continue
        if not p["first"] or (p["last"] or 0) < t0:
            continue
        sub = mon.PROJ / f.stem / "subagents"
        sessions.append({"id": f.stem, "title": p["title"] or f.stem[:8], "start": p["first"], "end": p["last"],
                         "agents": len(list(sub.glob("agent-*.jsonl"))) if sub.is_dir() else 0,
                         "panel": f.stem in {r.session for r in RUNS.values() if r.session}})
    runs = []
    for r in RUNS.values():
        st = analise._ts(r.started) or 0
        en = analise._ts(r.events[-1]["t"]) if r.events else st
        if en and en >= t0:
            runs.append({"id": r.id, "agent": r.agent, "title": r.title, "start": st, "end": max(en or st, st + 1), "status": r.status, "team": r.team, "cost": round(r.cost, 4)})
    cm = [{"sha": c["sha"], "short": c["short"], "t": c["ts"], "subject": c["subject"], "add": c["add"], "del": c["del"]}
          for c in gitinfo.commits(100) if c["ts"] >= t0]
    checks = [h for h in history(400) if h["t"] >= t0]
    return {"t0": t0, "t1": now_t, "sessions": sessions, "runs": runs, "commits": cm, "checks": checks}


# ---------- Tarefas (painel/tasks.json) ----------
def mentions(rel):
    """Tarefas e trechos do registro de decisões que citam o arquivo (pelo caminho ou, se longo o bastante, pelo nome)."""
    base = Path(rel).name
    keys = {rel} | ({base} if len(base) >= 8 else set())
    text = DEC.read_text(encoding="utf-8") if DEC.exists() else ""
    decisions = [ln.strip()[:200] for ln in text.splitlines() if any(k in ln for k in keys)][:5]
    return {"tasks": tarefas.citam(keys), "decisions": decisions}


def route_ext(h, m, parts, q):
    """Rotas novas; devolve None quando a rota não é daqui."""
    if parts and parts[0] == "tasks":
        if m == "GET" and len(parts) == 1:
            return {"tasks": tarefas.carregar()}
        if m == "POST" and len(parts) == 1:
            return tarefas.criar(h.body())
        if m == "PUT" and len(parts) == 2:
            return tarefas.atualizar(parts[1], h.body())
        if m == "DELETE" and len(parts) == 2:
            return tarefas.apagar(parts[1])
    if parts and parts[0] == "decisoes":
        if m == "GET" and len(parts) == 1:
            return tarefas.decisoes()
        if m == "PUT" and len(parts) == 2:
            b = h.body()
            return tarefas.marcar_decisao(parts[1], bool(b.get("resolvida")), b.get("nota", ""))
    if m == "GET":
        if parts == ["commit"]:
            return gitinfo.commit_diff(q["sha"], path=q.get("path"))
        if parts == ["graph"]:
            return gitinfo.graph(q.get("limit", 300), q.get("skip", 0), q.get("branch"), q.get("author"), q.get("path"), q.get("since"), q.get("until"), q.get("grep"))
        if parts == ["commit", "info"]:
            return gitinfo.commit_info(q["sha"])
        if parts == ["blob"]:
            return gitinfo.blob(q["sha"], q["path"])
        if parts == ["compare"]:
            return gitinfo.compare(q["a"], q["b"])
        if parts == ["activity"]:
            return gitinfo.activity(q.get("days", 84))
        if parts == ["gitsummary"]:
            return gitinfo.summary()
        if parts == ["gitstatus"]:
            return {"files": gitinfo.status_map()}
        if parts == ["blame"]:
            return gitinfo.blame(q["path"])
        if parts == ["filelog"]:
            return gitinfo.file_log(q["path"])
        if parts == ["file", "meta"]:
            return {**gitinfo.file_meta(q["path"]), **mentions(q["path"])}
        if parts == ["health"]:
            return gitinfo.health()
        if parts == ["worktree"]:
            return gitinfo.worktree()
        if parts == ["worktree", "diff"]:
            return gitinfo.worktree_diff(q["path"], q.get("kind", "all"))
        if parts == ["branches"]:
            return gitinfo.branches()
        if parts == ["dictionary"]:
            return json.loads((ROOT / ".claude" / "painel" / "dicionario.json").read_text(encoding="utf-8"))
        if parts == ["history"]:
            return history()
        if parts == ["timeline"]:
            return timeline(max(1, min(int(q.get("days", 7)), 60)))
        if parts == ["agent-activity"]:
            return activity(q.get("session"))
        if parts == ["sessions"]:
            return sessions_list()
        if parts == ["analysis"]:
            sid = q.get("session") or mon.Monitor(None).pick_session()
            return analise.analyze(sid)
    return None


# ---------- HTTP ----------
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def reply(self, obj, code=200, ctype="application/json"):
        """Resposta com gzip (corpo grande e texto) e ETag: quem repete o GET sem mudança recebe 304 sem corpo."""
        body = obj if isinstance(obj, bytes) else json.dumps(obj, ensure_ascii=False).encode()
        cacheable = code == 200 and self.command == "GET"
        etag = 'W/"' + hashlib.sha1(body).hexdigest()[:20] + '"' if cacheable else ""
        if etag and self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self.send_header("ETag", etag)
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            return
        gz = len(body) > 1024 and "gzip" in (self.headers.get("Accept-Encoding") or "") and ctype.split(";")[0] in COMPRESSIBLE
        if gz:
            body = gzip.compress(body, 5)
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-cache" if cacheable else "no-store")  # no-cache = pode guardar, mas pergunta antes (ETag)
        if etag:
            self.send_header("ETag", etag)
        if gz:
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Vary", "Accept-Encoding")
        self.send_header("X-Content-Type-Options", "nosniff")
        if ctype.startswith("text/html"):
            self.send_header("Content-Security-Policy", CSP)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def static(self, rel):
        p = (STATIC / rel).resolve()
        if STATIC.resolve() not in p.parents or not p.is_file():
            self.reply({"error": "não encontrado"}, 404)
            return
        self.reply(p.read_bytes(), 200, STATIC_TYPES.get(p.suffix, "application/octet-stream"))

    def guard(self):
        # Host e Origin têm de ser exatamente o endereço do painel (com a porta): barra DNS rebinding e páginas de outros sites
        if (self.headers.get("Host") or "") not in ALLOWED_HOSTS:
            self.reply({"error": "host"}, 403)
            return False
        origin = self.headers.get("Origin")
        if origin and origin not in {"http://" + h for h in ALLOWED_HOSTS}:
            self.reply({"error": "origem"}, 403)
            return False
        return True

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 1_000_000:
            raise ValueError("corpo grande demais")
        return json.loads(self.rfile.read(n) or b"{}")

    def dispatch(self, method):
        if not self.guard():
            return
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        if method == "GET" and u.path in ("/", "/index.html"):
            self.reply((STATIC / "index.html").read_bytes().replace(b"__TOKEN__", TOKEN.encode()).replace(b"__BUILD__", build_id().encode()), 200, "text/html; charset=utf-8")
            return
        if method == "GET" and u.path.startswith("/static/"):
            self.static(u.path[len("/static/"):])
            return
        if method == "GET" and u.path == "/socket.io/":
            realtime.serve(self, q)  # troca para WebSocket; o token vem no pacote CONNECT
            return
        if not u.path.startswith("/api/") or self.headers.get("X-Panel-Token") != TOKEN:
            self.reply({"error": "não autorizado"}, 401)
            return
        try:
            self.reply(self.route(method, u.path, q))
        except PermissionError as e:
            self.reply({"error": str(e)}, 403)
        except (KeyError, ValueError, RuntimeError, TypeError, FileNotFoundError, NotADirectoryError, IsADirectoryError) as e:
            self.reply({"error": f"{e.__class__.__name__}: {e}"}, 400)

    do_GET = lambda self: self.dispatch("GET")
    do_POST = lambda self: self.dispatch("POST")
    do_PUT = lambda self: self.dispatch("PUT")
    do_DELETE = lambda self: self.dispatch("DELETE")

    def route(self, m, path, q):
        parts = path.strip("/").split("/")[1:]
        if m == "POST" and parts == ["quality", "scan"]:
            return quality.scan()
        if parts and parts[0] == "gh":
            return ghapi.handle(m, parts[1:], q)
        if parts and parts[0] == "insights":
            return insights.handle(m, parts[1:], q)
        for found in (agentes.handle(m, parts, q, self.body), route_ext(self, m, parts, q)):
            if found is not None:
                return found
        if m == "GET":
            if parts == ["live"]:
                with LOCK:
                    return live(q.get("session"))
            if parts == ["tree"]:
                return tree(q.get("path", ""))
            if parts == ["file"]:
                p = safe(q["path"])
                if not is_text(p):
                    raise ValueError("arquivo não é texto")
                text, cut = read_text(p)
                return {"path": q["path"], "size": p.stat().st_size, "truncated": cut, "text": text}
            if parts == ["files"]:
                return find_files(q.get("q", ""))
            if parts == ["search"]:
                return grep(q.get("q", ""))
            if parts == ["git"]:
                return git_info()
            if parts == ["decisions"]:
                return {"text": DEC.read_text(encoding="utf-8") if DEC.exists() else ""}
        if m == "POST" and len(parts) == 2 and parts[0] == "script":
            res = run_cmd(SCRIPT_CMDS[parts[1]])
            record_check(parts[1], res)
            return res
        if m == "PUT" and parts == ["decisions"]:
            b = self.body()
            text = str(b["text"])
            if len(text) > 50_000:
                raise ValueError("texto grande demais")
            DEC.write_text(text, encoding="utf-8")
            realtime.publish("decisions")
            return {"ok": True}
        raise ValueError("rota desconhecida")


def allowed_hosts(port, public_port=0):
    """Hosts que o navegador pode usar (com a porta): barra DNS rebinding e páginas de outros sites."""
    return {f"{h}:{p}" for h in ("127.0.0.1", "localhost") for p in {port, public_port or port}}


def main():
    global MON
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1", help="endereço de escuta; no Docker use 0.0.0.0 e publique só em 127.0.0.1 no compose")
    ap.add_argument("--public-port", type=int, default=0, help="porta que o navegador usa, se o Docker publicar em outra")
    ap.add_argument("--open", action="store_true")
    a = ap.parse_args()
    ALLOWED_HOSTS.update(allowed_hosts(a.port, a.public_port))
    MON = mon.Monitor()
    load_runs()
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    realtime.start()
    url = f"http://127.0.0.1:{a.port}/"
    print(f"Painel: {url}\n(Ctrl+C para parar)", flush=True)
    if a.open:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        realtime.stop_all()
        for r in RUNS.values():
            r.stop()


if __name__ == "__main__":
    main()
