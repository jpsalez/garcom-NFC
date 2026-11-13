#!/usr/bin/env python3
"""Painel em tempo real dos agentes do Claude Code neste projeto (somente leitura).

  python3 .claude/scripts/monitor.py                 abre http://127.0.0.1:8765
  python3 .claude/scripts/monitor.py --port 9000     outra porta
  python3 .claude/scripts/monitor.py --session ID    sessão específica (padrão: a mais recente)
  python3 .claude/scripts/monitor.py --text --watch  versão no terminal, atualiza a cada 2 s

Fonte dos dados: os transcritos que o próprio Claude Code grava em ~/.claude/projects/<projeto>/
(sessão principal e subagentes). Não usa hooks e não altera nada. Mostra só o nome da ferramenta
e o alvo (arquivo, padrão, comando truncado), além do último prompt recebido para identificar a tarefa.
Não devolve o conteúdo dos arquivos lidos nem os resultados das ferramentas.
Escuta apenas em 127.0.0.1.
"""
import argparse
import json
import re
import threading
import time
import webbrowser
from collections import Counter, deque
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from _common import ROOT

PROJ = Path.home() / ".claude" / "projects" / str(ROOT).replace("/", "-")
KIND = {
    "Read": "ler", "Grep": "buscar", "Glob": "buscar", "Edit": "editar", "Write": "editar",
    "NotebookEdit": "editar", "Bash": "executar", "Agent": "delegar", "Task": "delegar",
    "WebFetch": "web", "WebSearch": "web", "SendMessage": "delegar",
}
EDIT_TOOLS = {"Edit", "Write", "NotebookEdit"}
SECRET = re.compile(r"(?i)(password|senha|secret|token|authorization|api[_-]?key)([\"']?\s*[:=]\s*)\S+")
JWT = re.compile(r"eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}")
LOCK = threading.Lock()


def clean(s, n=110):
    s = JWT.sub("<jwt>", SECRET.sub(r"\1\2<oculto>", SCRATCH.sub("<scratchpad>", str(s)))).replace("\n", " ").strip()
    return s if len(s) <= n else s[: n - 1] + "…"


SCRATCH = re.compile(r"/tmp/claude-\d+/[^/]+/[^/]+/scratchpad")


def short(p):
    p = SCRATCH.sub("<scratchpad>", str(p))
    r = str(ROOT) + "/"
    return p[len(r):] if p.startswith(r) else p


def target_of(name, inp):
    if not isinstance(inp, dict):
        return ""
    for k in ("file_path", "path", "notebook_path"):
        if inp.get(k):
            return short(inp[k])
    if name in ("Grep", "Glob") and inp.get("pattern"):
        return clean(inp["pattern"], 60) + (f"  em {short(inp['path'])}" if inp.get("path") else "")
    if name == "Bash":
        return clean(inp.get("command", ""), 100)
    if name in ("Agent", "Task"):
        return clean(inp.get("description") or inp.get("subagent_type") or "", 80)
    if name == "SendMessage":
        return "→ " + clean(inp.get("to", ""), 40)
    return clean(inp.get("url") or inp.get("query") or inp.get("description") or "", 80)


class Tail:
    """Lê um .jsonl de forma incremental (só os bytes novos) e guarda os eventos de ferramenta."""

    def __init__(self, path):
        self.path, self.off = Path(path), 0
        self.events, self.counts, self.edited = deque(maxlen=300), Counter(), {}
        self.first = self.last = None
        self.prompt = ""

    def pump(self):
        try:
            size = self.path.stat().st_size
        except OSError:
            return
        if size < self.off:
            self.__init__(self.path)
        if size == self.off:
            return
        with open(self.path, "rb") as f:
            f.seek(self.off)
            data = f.read()
        cut = data.rfind(b"\n")
        if cut < 0:
            return
        self.off += cut + 1
        for line in data[:cut].split(b"\n"):
            try:
                d = json.loads(line)
            except ValueError:
                continue
            ts = d.get("timestamp")
            if ts:
                self.first = self.first or ts
                self.last = ts
            content = (d.get("message") or {}).get("content")
            if d.get("type") == "user":
                text = content if isinstance(content, str) else "\n".join(
                    b.get("text", "") for b in (content or []) if isinstance(b, dict) and b.get("type") == "text"
                ) if isinstance(content, list) else ""
                if text.strip():
                    self.prompt = text[:30000]
            if d.get("type") != "assistant" or not isinstance(content, list):
                continue
            for b in content:
                if b.get("type") != "tool_use":
                    continue
                name, tgt = b.get("name", "?"), target_of(b.get("name"), b.get("input"))
                if name == "SubagentHandback":  # só devolve o relatório: é ruído no painel
                    continue
                self.counts[name] += 1
                self.events.append({"t": ts, "tool": name, "kind": KIND.get(name, "outro"), "target": tgt})
                if name in EDIT_TOOLS and tgt:
                    e = self.edited.setdefault(tgt, {"n": 0, "t": ts})
                    e["n"] += 1
                    e["t"] = ts


class Monitor:
    def __init__(self, session=None):
        self.session = session
        self.tails = {}
        self.exclude = set()  # sessões criadas pelo painel: não são a sessão interativa

    def pick_session(self):
        if self.session:
            return self.session
        fs = [p for p in sorted(PROJ.glob("*.jsonl"), key=lambda p: p.stat().st_mtime) if p.stem not in self.exclude]
        return fs[-1].stem if fs else None

    def tail(self, path):
        t = self.tails.get(str(path))
        if t is None:
            t = self.tails[str(path)] = Tail(path)
        t.pump()
        return t

    def snapshot(self):
        sid = self.pick_session()
        now = time.time()
        out = {"project": short(ROOT), "session": sid, "now": datetime.now().isoformat(timespec="seconds"),
               "agents": [], "files": []}
        if not sid:
            return out
        main = PROJ / f"{sid}.jsonl"
        cards = [("principal", "Agente principal", "orquestração", main, None)]
        sub = PROJ / sid / "subagents"
        if sub.is_dir():
            for jf in sorted(sub.glob("agent-*.jsonl")):
                meta = {}
                try:
                    meta = json.loads(jf.with_suffix(".meta.json").read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    pass
                cards.append((jf.stem[6:], meta.get("description") or jf.stem, meta.get("agentType", "?"), jf, meta))
        files = {}
        for aid, name, typ, path, meta in cards:
            if not path.exists():
                continue
            t = self.tail(path)
            idle = now - path.stat().st_mtime
            if meta is not None and "finished" in meta:
                status = "concluido" if meta["finished"] else "rodando"
            else:
                status = "rodando" if idle < (15 if meta is None else 25) else "ocioso"
            out["agents"].append({
                "id": aid, "name": name, "type": typ, "status": status, "idle": int(idle),
                "first": t.first, "last": t.last, "counts": dict(t.counts.most_common()),
                "events": list(t.events)[-12:], "edited": sorted(t.edited, key=lambda k: -t.edited[k]["n"])[:8],
                "prompt": t.prompt,
                "triggered_by": (meta or {}).get("parentAgentId") or ("Usuário da sessão" if aid == "principal" else "Não registrado"),
            })
            for p, e in t.edited.items():
                f = files.setdefault(p, {"path": p, "agents": [], "edits": 0, "t": e["t"]})
                f["agents"].append(name if aid != "principal" else "principal")
                f["edits"] += e["n"]
                f["t"] = max(f["t"], e["t"])
        order = {"rodando": 0, "ocioso": 1, "concluido": 2}
        out["agents"].sort(key=lambda a: (order[a["status"]], a["idle"]))
        out["files"] = sorted(files.values(), key=lambda f: f["t"], reverse=True)[:40]
        for f in out["files"]:
            f["conflict"] = len(set(f["agents"])) > 1
        return out


def render_text(s):
    hhmm = lambda t: datetime.fromisoformat(t.replace("Z", "+00:00")).astimezone().strftime("%H:%M:%S") if t else "--"
    lines = [f"projeto {s['project']}  sessão {str(s['session'])[:8]}  {s['now']}", ""]
    for a in s["agents"]:
        ev = a["events"][-1] if a["events"] else None
        act = f"{ev['kind']}: {ev['tool']} {ev['target']}" if ev else "—"
        lines.append(f"[{a['status']:9}] {a['name'][:34]:34} ({a['type']}) {hhmm(a['last'])}  {act[:70]}")
    lines += ["", "arquivos editados:"] + [
        f"  {'!! ' if f['conflict'] else '   '}{f['path']}  ({f['edits']}x) {', '.join(sorted(set(f['agents'])))}" for f in s["files"][:12]]
    return "\n".join(lines)


HTML = r"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Painel de agentes</title><style>
:root{--bg:#f6f8fb;--card:#fff;--tx:#18212b;--mut:#66758a;--bd:#dbe3ee;--run:#1e7b34;--idle:#b7791f;--done:#66758a;
--editar:#c2410c;--ler:#475569;--executar:#7c3aed;--buscar:#0f766e;--delegar:#15803d;--web:#2563eb;--outro:#64748b;--warn:#b42318}
@media(prefers-color-scheme:dark){:root{--bg:#0f141b;--card:#171e28;--tx:#e6ebf2;--mut:#8b9bb0;--bd:#263243;--run:#4ade80;--idle:#fbbf24;--done:#8b9bb0;
--editar:#fb923c;--ler:#94a3b8;--executar:#a78bfa;--buscar:#2dd4bf;--delegar:#4ade80;--web:#60a5fa;--outro:#94a3b8;--warn:#f87171}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.45 system-ui,sans-serif}
header{display:flex;flex-wrap:wrap;gap:8px 20px;align-items:baseline;padding:14px 20px;border-bottom:1px solid var(--bd)}
h1{font-size:17px;margin:0}header span{color:var(--mut);font-size:13px}
main{padding:16px 20px;display:grid;align-items:start;gap:16px;grid-template-columns:repeat(auto-fill,minmax(360px,1fr))}
.card{background:var(--card);border:1px solid var(--bd);border-radius:10px;padding:12px 14px;min-width:0}
.card.done .now{opacity:.8}.card.rodando{border-color:var(--run)}.top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.name{font-weight:600;overflow-wrap:anywhere}.type{color:var(--mut);font-size:12px}
.badge{font-size:12px;border-radius:999px;padding:1px 9px;border:1px solid currentColor;white-space:nowrap}
.rodando .badge{color:var(--run)}.ocioso .badge{color:var(--idle)}.concluido .badge{color:var(--done)}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:currentColor;margin-right:5px}
.rodando .dot{animation:p 1.1s infinite}@keyframes p{50%{opacity:.25}}
.now{margin:8px 0;padding:6px 8px;border-radius:6px;background:var(--bg);font-size:13px;overflow-wrap:anywhere}
.k{font-weight:600;margin-right:6px}.counts{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}
.counts i{font-style:normal;font-size:12px;border:1px solid var(--bd);border-radius:5px;padding:0 6px;color:var(--mut)}
ul{list-style:none;margin:6px 0 0;padding:0;font-size:12.5px}li{display:flex;gap:6px;padding:1px 0}li time{color:var(--mut);flex:none}
li span.t{overflow-wrap:anywhere;min-width:0}.ed{margin-top:6px;font-size:12.5px;color:var(--mut)}
section{grid-column:1/-1}h2{font-size:15px;margin:0 0 8px}table{width:100%;border-collapse:collapse;font-size:13px;background:var(--card);border:1px solid var(--bd);border-radius:8px}
th,td{text-align:left;padding:5px 9px;border-bottom:1px solid var(--bd);overflow-wrap:anywhere}th{color:var(--mut);font-weight:600}
.conf{color:var(--warn);font-weight:600}.empty{color:var(--mut)}
.editar{color:var(--editar)}.ler{color:var(--ler)}.executar{color:var(--executar)}.buscar{color:var(--buscar)}.delegar{color:var(--delegar)}.web{color:var(--web)}.outro{color:var(--outro)}
</style></head><body><header><h1>Painel de agentes</h1><span id="meta"></span><span id="sum"></span></header><main id="m"></main><script>
const h=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!==undefined)e.textContent=x;return e};
const hh=t=>t?new Date(t).toLocaleTimeString('pt-BR'):'--';
const lbl={rodando:'rodando',ocioso:'ocioso',concluido:'concluído'};
function card(a){const c=h('div','card '+a.status),top=h('div','top'),l=h('div');
l.append(h('div','name',a.name),h('div','type',a.type+' · último evento '+hh(a.last)));
const b=h('span','badge');b.append(h('span','dot'),document.createTextNode(lbl[a.status]));top.append(l,b);c.append(top);
const ev=a.events[a.events.length-1],n=h('div','now');
if(ev){n.append(h('span','k '+ev.kind,ev.kind),document.createTextNode(ev.tool+' '+ev.target))}else n.textContent='sem atividade registrada';c.append(n);
if(a.status==='concluido'){c.classList.add('done');const t=Object.values(a.counts).reduce((x,y)=>x+y,0);c.append(h('div','ed',t+' chamadas de ferramenta'+(a.edited.length?' · editou '+a.edited.length+' arquivo(s)':'')));return c}
const cs=h('div','counts');Object.entries(a.counts).slice(0,8).forEach(([k,v])=>cs.append(h('i','',k+' '+v)));c.append(cs);
if(a.edited.length)c.append(h('div','ed','editou: '+a.edited.join(', ')));
const u=h('ul');a.events.slice().reverse().forEach(e=>{const li=h('li'),t=h('time','',hh(e.t)),s=h('span','t');
s.append(h('b',e.kind,e.tool+' '),document.createTextNode(e.target));li.append(t,s);u.append(li)});c.append(u);return c}
async function tick(){try{const s=await (await fetch('/api/state')).json(),m=document.getElementById('m');m.replaceChildren();
document.getElementById('meta').textContent=s.project+' · sessão '+String(s.session).slice(0,8);
const r=s.agents.filter(a=>a.status==='rodando').length;document.getElementById('sum').textContent=r+' rodando · '+s.agents.length+' no total · '+new Date(s.now).toLocaleTimeString('pt-BR');
s.agents.forEach(a=>m.append(card(a)));
const sec=h('section');sec.append(h('h2','','Arquivos alterados (mais recentes primeiro)'));
if(!s.files.length)sec.append(h('div','empty','nenhum arquivo editado nesta sessão'));else{const t=h('table'),hd=h('tr');
['Arquivo','Edições','Quem','Hora'].forEach(x=>hd.append(h('th','',x)));t.append(hd);
s.files.forEach(f=>{const r=h('tr');r.append(h('td',f.conflict?'conf':'',(f.conflict?'⚠ ':'')+f.path),h('td','',f.edits),h('td','',[...new Set(f.agents)].join(', ')),h('td','',hh(f.t)));t.append(r)});sec.append(t)}
m.append(sec)}catch(e){document.getElementById('sum').textContent='sem conexão com o monitor'}}
tick();setInterval(tick,1000);</script></body></html>"""


def make_handler(mon):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            host = (self.headers.get("Host") or "").split(":")[0]
            if host not in ("127.0.0.1", "localhost"):
                self.send_error(403)
                return
            if self.path.startswith("/api/state"):
                with LOCK:
                    body = json.dumps(mon.snapshot()).encode()
                ctype = "application/json"
            elif self.path in ("/", "/index.html"):
                body, ctype = HTML.encode(), "text/html; charset=utf-8"
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return H


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--session")
    ap.add_argument("--text", action="store_true")
    ap.add_argument("--watch", action="store_true")
    ap.add_argument("--open", action="store_true", help="abre o navegador")
    a = ap.parse_args()
    mon = Monitor(a.session)
    if a.text:
        while True:
            print(("\033[2J\033[H" if a.watch else "") + render_text(mon.snapshot()), flush=True)
            if not a.watch:
                break
            time.sleep(2)
    else:
        srv = ThreadingHTTPServer(("127.0.0.1", a.port), make_handler(mon))
        url = f"http://127.0.0.1:{a.port}"
        print(f"Painel em {url} (Ctrl+C para parar)", flush=True)
        if a.open:
            webbrowser.open(url)
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass
