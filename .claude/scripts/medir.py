#!/usr/bin/env python3
"""Mede o painel e o harness (tamanhos, endpoints, tokens fixos por sessão). Uso: python3 .claude/scripts/medir.py [saida.json]

Sobe o painel numa porta própria só para medir. Tokens = caracteres ÷ 4 (aproximação)."""
import json
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SC = ROOT / ".claude" / "scripts"
ST = SC / "static"
PORT = 8899
ENDPOINTS = ["catalog", "runs", "teams", "tasks", "sessions", "live", "analysis", "history", "timeline?days=7", "spend", "health", "git", "gitsummary",
             "graph?limit=300", "commits?limit=100", "activity?days=84", "worktree", "branches", "tree?path=", "files?q=main", "search?q=swagger", "decisions",
             "dictionary", "recipes", "pipelines", "settings", "gitstatus", "blame?path=back-end/src/routes.ts", "filelog?path=back-end/src/routes.ts",
             "file?path=back-end/src/routes.ts", "file/meta?path=back-end/src/routes.ts", "insights/treemap?days=90", "insights/modules", "insights/coupling?days=180&min=2",
             "insights/complexity?top=10&points=12", "gh/status", "gh/overview"]


def sizes():
    out = {}
    for label, pat in (("html", "**/*.html"), ("css", "css/*.css"), ("js_proprio", "js/**/*.js"), ("vendor", "vendor/**/*.js")):
        fs = [p for p in ST.glob(pat) if p.is_file()]
        out[label] = {"arquivos": len(fs), "bytes": sum(p.stat().st_size for p in fs), "linhas": sum(len(p.read_text(encoding="utf-8", errors="ignore").splitlines()) for p in fs)}
    js = "\n".join(p.read_text(encoding="utf-8", errors="ignore") for p in ST.glob("js/**/*.js"))
    out["funcoes_js"] = len(re.findall(r"(?:async\s+)?function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>", js))
    py = [p for p in SC.glob("*.py")]
    out["python"] = {"arquivos": len(py), "linhas": sum(len(p.read_text(encoding="utf-8").splitlines()) for p in py), "funcoes": sum(len(re.findall(r"^\s*def ", p.read_text(encoding="utf-8"), re.M)) for p in py)}
    return out


def tokens_fixos():
    """O que entra em toda sessão do Claude Code neste projeto: CLAUDE.md, descrições de agentes e skills (listadas no prompt), settings."""
    def chars(p):
        return len(p.read_text(encoding="utf-8")) if p.exists() else 0
    def desc(p):
        m = re.search(r"^description:\s*(.+?)(?=^\w+:|^---)", p.read_text(encoding="utf-8"), re.S | re.M)
        return len(m.group(1).strip()) if m else 0
    agentes = {p.stem: desc(p) for p in sorted((ROOT / ".claude" / "agents").glob("*.md"))}
    skills = {p.parent.name: desc(p) for p in sorted((ROOT / ".claude" / "skills").glob("*/SKILL.md"))}
    memoria = Path.home() / ".claude" / "projects" / ("-" + str(ROOT).strip("/").replace("/", "-")) / "memory" / "MEMORY.md"
    itens = {"CLAUDE.md": chars(ROOT / ".claude" / "CLAUDE.md"), "MEMORY.md (índice)": chars(memoria), "settings.json": chars(ROOT / ".claude" / "settings.json"),
             "descrições dos agentes": sum(agentes.values()), "descrições das skills": sum(skills.values())}
    return {"itens_caracteres": itens, "total_caracteres": sum(itens.values()), "tokens_aprox": sum(itens.values()) // 4,
            "agentes": agentes, "skills": skills,
            "sob_demanda_caracteres": {"corpo dos agentes": sum(chars(p) for p in (ROOT / ".claude" / "agents").glob("*.md")), "knowledge": sum(chars(p) for p in (ROOT / ".claude" / "knowledge").rglob("*.md"))}}


def endpoints(base, token):
    res = {}
    for ep in ENDPOINTS:
        row = {}
        for tentativa in ("1a", "2a"):
            req = urllib.request.Request(f"{base}/api/{ep}", headers={"X-Panel-Token": token, "Accept-Encoding": "gzip"})
            t = time.perf_counter()
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    body = r.read()
                    row[tentativa] = {"ms": round((time.perf_counter() - t) * 1000), "bytes": len(body), "status": r.status, "gzip": r.headers.get("Content-Encoding") == "gzip", "etag": bool(r.headers.get("ETag"))}
            except Exception as e:  # noqa: BLE001
                row[tentativa] = {"ms": round((time.perf_counter() - t) * 1000), "erro": str(e)[:80]}
        res[ep] = row
    return res


def main():
    saida = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    srv = subprocess.Popen([sys.executable, "-B", str(SC / "painel.py"), "--port", str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        base = f"http://127.0.0.1:{PORT}"
        for _ in range(60):
            try:
                html = urllib.request.urlopen(base + "/", timeout=2).read().decode()
                break
            except Exception:  # noqa: BLE001
                time.sleep(0.25)
        token = re.search(r'name="panel-token" content="([^"]+)"', html).group(1)
        dados = {"quando": time.strftime("%Y-%m-%dT%H:%M:%S"), "tamanhos": sizes(), "tokens_fixos": tokens_fixos(), "endpoints": endpoints(base, token)}
    finally:
        srv.terminate()
    txt = json.dumps(dados, ensure_ascii=False, indent=1)
    if saida:
        saida.parent.mkdir(parents=True, exist_ok=True)
        saida.write_text(txt, encoding="utf-8")
    print(txt if not saida else f"gravado em {saida}")


if __name__ == "__main__":
    main()
