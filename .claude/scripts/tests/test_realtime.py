"""Testes do Socket.IO do painel (realtime.py): protocolo, token, avisos coalescidos, ping/pong e limpeza de conexões."""
import base64
import hashlib
import json
import os
import socket
import struct
import sys
import threading
import time
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import painel  # noqa: E402
import realtime  # noqa: E402

PATH = "/socket.io/?EIO=4&transport=websocket"


class WS:
    """Cliente WebSocket mínimo, só para os testes."""

    def __init__(self, port, path=PATH, host=None, headers=None):
        self.s = socket.create_connection(("127.0.0.1", port), timeout=5)
        key = base64.b64encode(os.urandom(16)).decode()
        extra = "".join(f"{k}: {v}\r\n" for k, v in (headers or {}).items())
        self.s.sendall((f"GET {path} HTTP/1.1\r\nHost: {host or f'127.0.0.1:{port}'}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                        f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n{extra}\r\n").encode())
        raw = b""
        while b"\r\n\r\n" not in raw:
            raw += self.s.recv(4096)
        head, _, self.buf = raw.partition(b"\r\n\r\n")
        self.status = int(head.split()[1])
        self.head = head.decode()
        self.key = key

    def send(self, text, op=1):
        data = text.encode()
        mask = os.urandom(4)
        n = len(data)
        hdr = bytes([0x80 | op]) + (bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n))
        self.s.sendall(hdr + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _need(self, n):
        while len(self.buf) < n:
            chunk = self.s.recv(4096)
            if not chunk:
                raise ConnectionError("fechada")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def recv(self, timeout=3):
        """Texto do próximo quadro; None se fechar; levanta TimeoutError se nada chegar."""
        self.s.settimeout(timeout)
        try:
            b1, b2 = self._need(2)
            n = b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._need(2))[0]
            data = self._need(n)
        except socket.timeout:
            raise TimeoutError("nada recebido")
        except ConnectionError:
            return None
        return None if b1 & 0x0F == 8 else data.decode()

    def close(self):
        self.s.close()


class Tempo(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), painel.Handler)
        cls.port = cls.srv.server_address[1]
        painel.ALLOWED_HOSTS.clear()
        painel.ALLOWED_HOSTS.update({f"127.0.0.1:{cls.port}", f"localhost:{cls.port}"})
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()

    def conectar(self, token=None):
        ws = WS(self.port)
        self.assertEqual(ws.status, 101)
        self.assertTrue(ws.recv().startswith("0{"))
        ws.send("40" + json.dumps({"token": painel.TOKEN if token is None else token}))
        return ws

    def esperar(self, cond, secs=2.0):
        fim = time.time() + secs
        while time.time() < fim:
            if cond():
                return True
            time.sleep(0.02)
        return False

    def test_handshake_devolve_accept_certo_e_pacote_open(self):
        ws = WS(self.port)
        accept = base64.b64encode(hashlib.sha1((ws.key + realtime.GUID).encode()).digest()).decode()
        self.assertIn(accept, ws.head)
        abertura = json.loads(ws.recv()[1:])
        self.assertTrue(abertura["sid"] and abertura["upgrades"] == [] and abertura["pingInterval"] > 0)
        ws.close()

    def test_token_errado_e_recusado_e_certo_entra(self):
        ruim = self.conectar("errado")
        self.assertTrue(ruim.recv().startswith("44"))
        self.assertIsNone(ruim.recv())
        ok = self.conectar()
        self.assertTrue(ok.recv().startswith('40{"sid"'))
        ok.close()

    def test_requisicoes_que_nao_sao_websocket_ou_de_outro_host_sao_recusadas(self):
        self.assertEqual(WS(self.port, path="/socket.io/?EIO=4&transport=polling").status, 400)
        self.assertEqual(WS(self.port, host="evil.example").status, 403)
        self.assertEqual(WS(self.port, headers={"Origin": "http://evil.example"}).status, 403)

    def test_aviso_chega_e_avisos_proximos_viram_um_so(self):
        ws = self.conectar()
        ws.recv()
        self.assertTrue(self.esperar(lambda: realtime.active() >= 1))
        realtime.publish("git")
        realtime.publish("runs")
        realtime.publish("git")
        msg = ws.recv()
        self.assertEqual(json.loads(msg[2:]), ["changed", {"topics": ["git", "runs"]}])
        with self.assertRaises(TimeoutError):
            ws.recv(0.5)  # nada além do aviso único
        ws.close()

    def test_sem_ninguem_conectado_publish_nao_acumula(self):
        self.assertTrue(self.esperar(lambda: realtime.active() == 0))
        realtime.publish("runs")
        self.assertEqual(realtime._pending, set())

    def test_desconectar_libera_a_conexao(self):
        ws = self.conectar()
        ws.recv()
        self.assertTrue(self.esperar(lambda: realtime.active() == 1))
        ws.close()
        self.assertTrue(self.esperar(lambda: realtime.active() == 0 and realtime._open == 0, 3))

    def test_limite_de_conexoes(self):
        with mock.patch.object(realtime, "MAX_CONN", 1):
            a = self.conectar()
            a.recv()
            self.assertEqual(WS(self.port).status, 429)
            a.close()
        self.assertTrue(self.esperar(lambda: realtime._open == 0, 3))

    def test_quem_nao_manda_o_token_a_tempo_e_derrubado(self):
        with mock.patch.object(realtime, "HANDSHAKE_WAIT", 0.3):
            ws = WS(self.port)
            ws.recv()
            self.assertIsNone(ws.recv(3))
        self.assertTrue(self.esperar(lambda: realtime._open == 0, 3))

    def test_ping_pong_mantem_e_falta_de_pong_derruba(self):
        with mock.patch.object(realtime, "PING_INTERVAL", 0.3), mock.patch.object(realtime, "PING_TIMEOUT", 0.6):
            vivo = self.conectar()
            vivo.recv()
            for _ in range(3):  # responde aos pings: segue conectado
                self.assertEqual(vivo.recv(2), "2")
                vivo.send("3")
            mudo = self.conectar()
            mudo.recv()
            self.assertEqual(mudo.recv(2), "2")  # não responde
            self.assertIsNone(mudo.recv(3))      # o servidor encerra
            vivo.close()
        self.assertTrue(self.esperar(lambda: realtime._open == 0, 3))


if __name__ == "__main__":
    unittest.main()
