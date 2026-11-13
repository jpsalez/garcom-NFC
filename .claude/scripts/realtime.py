"""Tempo real do painel: servidor Socket.IO mínimo (Engine.IO v4, só WebSocket), feito com a biblioteca padrão.

Por que não a biblioteca python-socketio: o painel não tem dependências. O cliente é o `socket.io-client` oficial
(static/vendor/socketio) e fala o protocolo normal; aqui só existe o que o painel usa: conectar com `auth.token`, ping/pong e
UM evento do servidor para o cliente, `changed` com {"topics": [...]}. O cliente então refaz só a consulta do assunto que mudou.

Não há loop de atualização por segundo. Os assuntos nascem de duas formas:
  - o próprio painel chama `publish(...)` quando algo muda (conversas, pipelines, tarefas, decisões, limite de gasto);
  - um vigia olha só `mtime` de arquivos e a assinatura do git, e SÓ enquanto houver alguém conectado.
Nada disso chama LLM: não gasta token.

Assuntos: runs · pipelines · live · git · tasks · decisions
"""
import base64
import hashlib
import json
import secrets
import select
import socket
import struct
import sys
import threading
import time
from pathlib import Path

from _common import KNOW, ROOT

MAX_CONN = 16            # conexões simultâneas
PING_INTERVAL = 20.0     # segundos entre pings do servidor (o cliente responde com pong)
PING_TIMEOUT = 15.0      # sem pong nesse prazo, a conexão é encerrada
COALESCE = 0.12          # junta avisos que chegam quase juntos em uma única mensagem
WATCH_TICK = 1.0         # vigia: frequência da checagem de mtime (barata)
GIT_EVERY = 3            # vigia: o git é conferido a cada N ticks
MAX_PAYLOAD = 1_000_000
HANDSHAKE_WAIT = 5.0     # tempo para o cliente mandar o CONNECT com o token
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

_lock = threading.Lock()
_wake = threading.Condition(_lock)
_open = 0                # conexões abertas (inclui as que ainda não mandaram o token)
_conns = set()           # conexões autenticadas (recebem os avisos)
_pending = set()
_threads = {"dispatcher": None, "watcher": None}
_stop = threading.Event()


def active():
    return len(_conns)


def stop_all():
    """Encerra as conexões e os vigias (desligamento e testes)."""
    _stop.set()
    with _wake:
        _wake.notify_all()


# ---------- quadros WebSocket ----------
def _frame(opcode, payload=b""):
    n = len(payload)
    head = bytes([0x80 | opcode])
    if n < 126:
        head += bytes([n])
    elif n < 65536:
        head += bytes([126]) + struct.pack(">H", n)
    else:
        head += bytes([127]) + struct.pack(">Q", n)
    return head + payload


def _recv(sock, n):
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("fechada")
        buf += chunk
    return buf


def _read_frame(sock):
    """(fin, opcode, payload) de um quadro do cliente. Clientes sempre mascaram; o resto é violação do protocolo."""
    b1, b2 = _recv(sock, 2)
    n = b2 & 0x7F
    if n == 126:
        n = struct.unpack(">H", _recv(sock, 2))[0]
    elif n == 127:
        n = struct.unpack(">Q", _recv(sock, 8))[0]
    if not b2 & 0x80:
        raise ValueError("quadro sem máscara")
    if n > MAX_PAYLOAD:
        raise ValueError("quadro grande demais")
    mask = _recv(sock, 4)
    data = bytearray(_recv(sock, n))
    for i in range(n):
        data[i] ^= mask[i % 4]
    return bool(b1 & 0x80), b1 & 0x0F, bytes(data)


class Conn:
    def __init__(self, sock):
        self.sock = sock
        self.alive = True
        self.wlock = threading.Lock()

    def _send(self, data):
        with self.wlock:
            try:
                self.sock.sendall(data)
            except OSError:
                self.alive = False

    def send_text(self, text):
        self._send(_frame(1, text.encode("utf-8")))

    def close(self, code=1000):
        self._send(_frame(8, struct.pack(">H", code)))
        self.alive = False


# ---------- avisos ----------
def publish(*topics):
    """Avisa os clientes de que estes assuntos mudaram. Barato e sem efeito se ninguém estiver conectado."""
    if not _conns:
        return
    with _wake:
        _pending.update(topics)
        _wake.notify()
    _ensure("dispatcher", _dispatcher)


_ensure_lock = threading.Lock()


def _ensure(name, fn):
    with _ensure_lock:  # dois chamadores ao mesmo tempo não podem criar dois threads
        if _threads[name] is None or not _threads[name].is_alive():
            _threads[name] = threading.Thread(target=fn, name="realtime-" + name, daemon=True)
            _threads[name].start()


def _dispatcher():
    while not _stop.is_set():
        with _wake:
            while not _pending and not _stop.is_set():
                _wake.wait()
        if _stop.is_set():
            return
        time.sleep(COALESCE)
        with _wake:
            topics, conns = sorted(_pending), list(_conns)
            _pending.clear()
        if not topics:
            continue
        msg = "42" + json.dumps(["changed", {"topics": topics}], ensure_ascii=False)
        for c in conns:
            c.send_text(msg)


# ---------- vigia: só mtime e a assinatura do git, só com gente conectada ----------
def _live_sig():
    import monitor as mon
    proj = mon.PROJ
    if not proj.is_dir():
        return ()
    files = sorted(((p.stat().st_mtime_ns, p.name) for p in proj.glob("*.jsonl")))[-3:]
    sig = list(files)
    if files:
        sub = proj / Path(files[-1][1]).stem / "subagents"
        if sub.is_dir():
            sig += sorted((p.stat().st_mtime_ns, p.name) for p in sub.glob("agent-*.jsonl"))[-12:]
    return tuple(sig)


def _git_sig():
    import gitinfo
    g = gitinfo.git
    return hashlib.sha1("\0".join((g("status", "--porcelain=v1", "-z", "--untracked-files=all"), g("rev-parse", "HEAD"), g("for-each-ref", "--format=%(refname) %(objectname)"))).encode()).hexdigest()


def _mtime(path):
    try:
        return path.stat().st_mtime_ns
    except OSError:
        return 0


def _watcher():
    last, n = {}, 0
    probes = {"live": _live_sig, "tasks": lambda: _mtime(ROOT / ".claude" / "painel" / "tasks.json"), "decisions": lambda: _mtime(KNOW / "decisoes.md")}
    while not _stop.is_set():
        _stop.wait(WATCH_TICK)
        if not _conns:
            last.clear()  # sem ninguém: não gasta nada e recomeça do zero quando alguém voltar
            continue
        n += 1
        checks = dict(probes)
        if n % GIT_EVERY == 0:
            checks["git"] = _git_sig
        for topic, probe in checks.items():
            try:
                sig = probe()
            except Exception:
                continue
            if topic in last and last[topic] != sig:
                publish(topic)
            last[topic] = sig


def start():
    """Liga o vigia (o painel chama uma vez ao subir)."""
    _stop.clear()
    _ensure("watcher", _watcher)


# ---------- conexão Socket.IO ----------
def _token_ok(handler, given):
    expected = getattr(sys.modules[type(handler).__module__], "TOKEN", "")
    return isinstance(given, str) and bool(expected) and secrets.compare_digest(given.encode(), expected.encode())


def serve(handler, q):
    """GET /socket.io/?EIO=4&transport=websocket: troca para WebSocket e atende a conexão neste thread."""
    global _open
    h = handler.headers
    if (q.get("EIO") != "4" or q.get("transport") != "websocket" or h.get("Upgrade", "").lower() != "websocket"
            or "upgrade" not in h.get("Connection", "").lower() or h.get("Sec-WebSocket-Version") != "13" or not h.get("Sec-WebSocket-Key")):
        handler.reply({"error": "use WebSocket (Socket.IO v4, transports: ['websocket'])"}, 400)
        return
    with _lock:
        if _open >= MAX_CONN:
            full = True
        else:
            full, _open = False, _open + 1
    if full:
        handler.reply({"error": "conexões demais"}, 429)
        return
    try:
        accept = base64.b64encode(hashlib.sha1((h["Sec-WebSocket-Key"] + GUID).encode()).digest()).decode()
        handler.send_response(101, "Switching Protocols")
        handler.send_header("Upgrade", "websocket")
        handler.send_header("Connection", "Upgrade")
        handler.send_header("Sec-WebSocket-Accept", accept)
        handler.end_headers()
        handler.wfile.flush()
        handler.close_connection = True
        conn = Conn(handler.connection)
        _session(handler, conn)
    except (OSError, ValueError, ConnectionError):
        pass
    finally:
        with _lock:
            _open -= 1
            _conns.discard(locals().get("conn"))
        try:
            handler.connection.close()
        except OSError:
            pass


def _session(handler, conn):
    sid = secrets.token_urlsafe(12)
    conn.send_text("0" + json.dumps({"sid": sid, "upgrades": [], "pingInterval": int(PING_INTERVAL * 1000), "pingTimeout": int(PING_TIMEOUT * 1000), "maxPayload": MAX_PAYLOAD}))
    sock = conn.sock
    authed, started = False, time.time()
    next_ping, waiting = time.time() + PING_INTERVAL, None
    parts = bytearray()
    while conn.alive and not _stop.is_set():
        now = time.time()
        due = (waiting + PING_TIMEOUT) if waiting else next_ping
        if not authed:
            due = min(due, started + HANDSHAKE_WAIT)
        ready, _, _ = select.select([sock], [], [], max(0.05, min(due - now, 1.0)))
        now = time.time()
        if not ready:
            if not authed and now - started > HANDSHAKE_WAIT:
                return
            if waiting and now - waiting > PING_TIMEOUT:
                return
            if not waiting and now >= next_ping:
                conn.send_text("2")
                waiting = now
            continue
        sock.settimeout(10)
        fin, op, data = _read_frame(sock)
        sock.settimeout(None)
        if op == 8:
            conn.close()
            return
        if op == 9:
            conn._send(_frame(10, data))
            continue
        if op not in (0, 1, 2):
            continue
        parts += data
        if len(parts) > MAX_PAYLOAD:
            conn.close(1009)
            return
        if not fin:
            continue
        text, parts = bytes(parts).decode("utf-8", "replace") if op != 2 else "", bytearray()
        if text == "3":
            waiting, next_ping = None, time.time() + PING_INTERVAL
        elif text == "2":
            conn.send_text("3")
        elif text.startswith("40") and not authed:
            try:
                auth = json.loads(text[2:] or "{}")
            except ValueError:
                auth = {}
            if not _token_ok(handler, auth.get("token") if isinstance(auth, dict) else None):
                conn.send_text('44{"message":"não autorizado"}')
                conn.close(1008)
                return
            authed = True
            conn.send_text("40" + json.dumps({"sid": secrets.token_urlsafe(12)}))
            with _lock:
                _conns.add(conn)
            _ensure("dispatcher", _dispatcher)
        elif text == "1" or text.startswith("41"):
            conn.close()
            return
