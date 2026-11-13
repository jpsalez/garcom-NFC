"""Testes do servidor do painel (stdlib, sem dependências):  python3 -B -m unittest discover -s .claude/scripts/tests"""
import http.client
import json
import sys
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import gitinfo  # noqa: E402
import painel  # noqa: E402


class PainelServer(unittest.TestCase):
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

    def call(self, method, path, headers=None, body=None, host=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = {"Host": host or f"127.0.0.1:{self.port}", **(headers or {})}
        c.request(method, path, body=json.dumps(body) if body is not None else None, headers=h)
        r = c.getresponse()
        data = r.read()
        c.close()
        return r.status, dict(r.getheaders()), data

    def test_pagina_inicial_leva_token_e_csp(self):
        st, hd, body = self.call("GET", "/")
        self.assertEqual(st, 200)
        self.assertIn("script-src 'self'", hd["Content-Security-Policy"])
        self.assertEqual(hd["X-Content-Type-Options"], "nosniff")
        self.assertIn(painel.TOKEN.encode(), body)
        self.assertNotIn(b"<script>", body)  # sem JS inline

    def test_api_exige_token(self):
        self.assertEqual(self.call("GET", "/api/catalog")[0], 401)
        self.assertEqual(self.call("GET", "/api/catalog", {"X-Panel-Token": "errado"})[0], 401)
        self.assertEqual(self.call("GET", "/api/catalog", {"X-Panel-Token": painel.TOKEN})[0], 200)

    def test_host_diferente_e_recusado(self):
        for host in ("evil.example", "127.0.0.1", "127.0.0.1:1", f"evil.example:{self.port}"):
            self.assertEqual(self.call("GET", "/", host=host)[0], 403, host)
        self.assertEqual(self.call("GET", "/", host=f"localhost:{self.port}")[0], 200)

    def test_post_de_outra_origem_e_recusado(self):
        h = {"X-Panel-Token": painel.TOKEN, "Content-Type": "application/json"}
        for origin in ("http://evil.example", "http://127.0.0.1:1", "http://localhost"):
            st, _, _ = self.call("PUT", "/api/decisions", {**h, "Origin": origin}, {"text": "x"})
            self.assertEqual(st, 403, origin)

    def test_estatico_nao_sai_da_pasta(self):
        self.assertEqual(self.call("GET", "/static/js/main.js")[0], 200)
        self.assertEqual(self.call("GET", "/static/../painel.py")[0], 404)
        self.assertEqual(self.call("GET", "/static/%2e%2e/painel.py")[0], 404)
        self.assertEqual(self.call("GET", "/static/js")[0], 404)  # diretório

    def test_tipos_dos_modulos(self):
        _, hd, _ = self.call("GET", "/static/js/main.js")
        self.assertTrue(hd["Content-Type"].startswith("text/javascript"))


class Transporte(PainelServer):
    """gzip e ETag: respostas grandes vão comprimidas e quem repete o GET sem mudança recebe 304."""

    H = {}

    def test_json_grande_vai_comprimido_e_igual_ao_original(self):
        import gzip
        h = {"X-Panel-Token": painel.TOKEN}
        st, hd, raw = self.call("GET", "/api/dictionary", h)
        st2, hd2, comp = self.call("GET", "/api/dictionary", {**h, "Accept-Encoding": "gzip"})
        self.assertEqual((st, st2), (200, 200))
        self.assertNotIn("Content-Encoding", hd)
        self.assertEqual(hd2["Content-Encoding"], "gzip")
        self.assertLess(len(comp), len(raw) / 2)
        self.assertEqual(gzip.decompress(comp), raw)

    def test_etag_devolve_304_sem_corpo(self):
        h = {"X-Panel-Token": painel.TOKEN}
        _, hd, _ = self.call("GET", "/api/dictionary", h)
        st, hd2, corpo = self.call("GET", "/api/dictionary", {**h, "If-None-Match": hd["ETag"]})
        self.assertEqual((st, corpo), (304, b""))
        self.assertEqual(hd2["ETag"], hd["ETag"])
        st3, _, corpo3 = self.call("GET", "/api/dictionary", {**h, "If-None-Match": 'W/"outro"'})
        self.assertEqual(st3, 200)
        self.assertTrue(corpo3)

    def test_estaticos_usam_etag_e_erros_nao_ficam_em_cache(self):
        _, hd, _ = self.call("GET", "/static/js/main.js")
        self.assertEqual(hd["Cache-Control"], "no-cache")
        self.assertEqual(self.call("GET", "/static/js/main.js", {"If-None-Match": hd["ETag"]})[0], 304)
        st, hd404, _ = self.call("GET", "/static/nao-existe.js")
        self.assertEqual((st, hd404["Cache-Control"]), (404, "no-store"))


class Validacao(unittest.TestCase):
    def test_sha_invalido(self):
        for bad in ("", "zz", "--output=x", "abc", "g" * 40, "a" * 41, "HEAD", "abc1234;rm"):
            with self.assertRaises(ValueError, msg=bad):
                gitinfo.commit_diff(bad)

    def test_worktree_diff_barra_caminhos_perigosos(self):
        for bad in ("../etc/passwd", "back-end/.env", ".git/config", "/etc/passwd"):
            with self.assertRaises((ValueError, PermissionError), msg=bad):
                gitinfo.worktree_diff(bad)


class RepoTemporario(unittest.TestCase):
    """Grafo e comparação num repositório descartável: main com 2 commits, feat com 2, e um merge."""

    @classmethod
    def setUpClass(cls):
        import os
        import subprocess
        import tempfile
        from unittest import mock

        import _common

        cls.tmp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.tmp.name).resolve()
        env = {**os.environ, "GIT_AUTHOR_NAME": "Ana", "GIT_COMMITTER_NAME": "Ana", "GIT_AUTHOR_EMAIL": "a@x", "GIT_COMMITTER_EMAIL": "a@x"}

        def git(*a, who="Ana"):
            e = {**env, "GIT_AUTHOR_NAME": who, "GIT_COMMITTER_NAME": who}
            return subprocess.run(["git", "-C", str(cls.root), *a], env=e, capture_output=True, text=True, check=True).stdout.strip()

        def commit(name, text, who="Ana"):
            (cls.root / name).write_text(text)
            git("add", name)
            git("commit", "-m", f"adiciona {name}", who=who)
            return git("rev-parse", "HEAD")

        git("init", "-b", "main")
        cls.c1 = commit("a.txt", "um\n")
        git("checkout", "-b", "feat")
        cls.f1 = commit("b.txt", "dois\n", who="Bia")
        cls.f2 = commit("c.txt", "tres\n", who="Bia")
        git("checkout", "main")
        cls.m1 = commit("d.txt", "quatro\n")
        git("merge", "--no-ff", "feat", "-m", "merge feat")
        cls.merge = git("rev-parse", "HEAD")
        cls.patches = [mock.patch.object(m, n, v) for m, n, v in ((_common, "ROOT", cls.root), (gitinfo, "ROOT", cls.root), (gitinfo, "REPO", cls.root))]
        [x.start() for x in cls.patches]

    @classmethod
    def tearDownClass(cls):
        [x.stop() for x in cls.patches]
        cls.tmp.cleanup()

    def test_grafo_tem_merge_com_dois_pais_e_ordem_topologica(self):
        cs = gitinfo.graph(50)["commits"]
        self.assertEqual({c["sha"] for c in cs}, {self.c1, self.f1, self.f2, self.m1, self.merge})
        merge = next(c for c in cs if c["sha"] == self.merge)
        self.assertTrue(merge["merge"])
        self.assertEqual(set(merge["parents"]), {self.m1, self.f2})
        pos = {c["sha"]: i for i, c in enumerate(cs)}
        for c in cs:  # um commit sempre aparece antes dos pais
            for p in c["parents"]:
                self.assertLess(pos[c["sha"]], pos[p])
        self.assertIn({"name": "main", "kind": "branch", "current": True}, merge["refs"])
        self.assertIn("feat", [r["name"] for r in next(c for c in cs if c["sha"] == self.f2)["refs"]])

    def test_paginacao_e_filtros(self):
        todos = [c["sha"] for c in gitinfo.graph(50)["commits"]]
        pag = [c["sha"] for c in gitinfo.graph(2, 0)["commits"]] + [c["sha"] for c in gitinfo.graph(2, 2)["commits"]] + [c["sha"] for c in gitinfo.graph(2, 4)["commits"]]
        self.assertEqual(pag, todos)
        self.assertEqual(gitinfo.graph(50, branch="feat")["total"], 3)
        self.assertEqual(gitinfo.graph(50, author="Bia")["total"], 2)
        self.assertEqual(gitinfo.graph(50, path="b.txt")["total"], 1)
        self.assertEqual(gitinfo.graph(50, since="2030-01-01")["total"], 0)
        self.assertEqual(sorted(gitinfo.graph(50)["authors"]), ["Ana", "Bia"])

    def test_grep_por_id_de_tarefa(self):
        import subprocess
        (self.root / "g.txt").write_text("x\n")
        subprocess.run(["git", "-C", str(self.root), "add", "g.txt"], check=True)
        subprocess.run(["git", "-C", str(self.root), "-c", "user.name=Ana", "-c", "user.email=a@x", "commit", "-q", "-m", "feat: SES-01 abre a mesa"], check=True)
        self.addCleanup(lambda: subprocess.run(["git", "-C", str(self.root), "reset", "-q", "--hard", "HEAD~1"], check=True))
        self.assertEqual(gitinfo.graph(10, grep="SES-01")["total"], 1)
        self.assertEqual(gitinfo.graph(10, grep="SES-02")["total"], 0)
        for ruim in ("--all", "a b", "SES-01\nx", ".*"):
            with self.assertRaises(ValueError, msg=ruim):
                gitinfo.graph(10, grep=ruim)

    def test_cache_do_grafo_invalida_ao_commitar(self):
        import subprocess
        antes = gitinfo.graph(50)
        self.assertIs(gitinfo.graph(50), antes)  # mesma assinatura: devolve o guardado
        (self.root / "h.txt").write_text("y\n")
        subprocess.run(["git", "-C", str(self.root), "add", "h.txt"], check=True)
        subprocess.run(["git", "-C", str(self.root), "-c", "user.name=Ana", "-c", "user.email=a@x", "commit", "-q", "-m", "novo commit"], check=True)
        self.addCleanup(lambda: subprocess.run(["git", "-C", str(self.root), "reset", "-q", "--hard", "HEAD~1"], check=True))
        depois = gitinfo.graph(50)
        self.assertIsNot(depois, antes)
        self.assertEqual(depois["total"], antes["total"] + 1)

    def test_filtros_recusam_entrada_perigosa(self):
        for kw in ({"branch": "--output=/tmp/x"}, {"branch": "nao-existe"}, {"author": "a\nb"}, {"since": "ontem"}, {"path": "../x"}, {"branch": "a..b"}):
            with self.assertRaises((ValueError, PermissionError), msg=str(kw)):
                gitinfo.graph(10, **kw)

    def test_detalhe_comparacao_e_blob(self):
        info = gitinfo.commit_info(self.merge)
        self.assertEqual(info["parents"], [self.m1, self.f2])
        self.assertIn("main", info["branches"])
        cmp = gitinfo.compare(self.c1, "feat")
        self.assertEqual([c["sha"] for c in cmp["commits"]], [self.f2, self.f1])
        self.assertIn("b.txt", cmp["diff"])
        self.assertNotIn("d.txt", cmp["diff"])  # a...b parte do ancestral comum
        self.assertEqual(gitinfo.blob(self.f2, "b.txt")["text"], "dois\n")
        for bad in ("--help", "HEAD; rm", "a" * 3):
            with self.assertRaises(ValueError, msg=bad):
                gitinfo.compare(bad, "main")

    def test_diff_confere_com_git_show(self):
        import subprocess
        esperado = subprocess.run(["git", "-C", str(self.root), "show", "--no-color", "--format=", "--patch", "--stat=100", self.f1], capture_output=True, text=True).stdout
        self.assertEqual(gitinfo.commit_diff(self.f1)["diff"], esperado)

    def test_worktree_separa_staged_unstaged_e_novos(self):
        import subprocess
        (self.root / "a.txt").write_text("um\nmodificado\n")
        (self.root / "b.txt").write_text("dois\nstaged\n")
        subprocess.run(["git", "-C", str(self.root), "add", "b.txt"], check=True)
        (self.root / "novo.txt").write_text("x\n")
        g = gitinfo.worktree_groups()
        self.assertEqual([f["path"] for f in g["staged"]], ["b.txt"])
        self.assertEqual([f["path"] for f in g["unstaged"]], ["a.txt"])
        self.assertEqual([f["path"] for f in g["untracked"]], ["novo.txt"])
        self.assertIn("+modificado", gitinfo.worktree_diff("a.txt", "unstaged")["diff"])
        self.assertIn("+staged", gitinfo.worktree_diff("b.txt", "staged")["diff"])
        self.assertIn("+x", gitinfo.worktree_diff("novo.txt", "untracked")["diff"])
        subprocess.run(["git", "-C", str(self.root), "reset", "--hard", "-q"], check=True)
        (self.root / "novo.txt").unlink()


class Arquivos(unittest.TestCase):
    def test_blame_confere_com_git_blame(self):
        import subprocess
        for rel in ("back-end/src/main.ts", "back-end/prisma/schema.prisma"):
            raw = subprocess.run(["git", "-C", str(gitinfo.ROOT), "blame", "-l", "-s", "--", rel], capture_output=True, text=True, check=True).stdout
            esperado = [ln.split(" ", 1)[0].lstrip("^")[:39] for ln in raw.splitlines()]
            obtido = []
            for g in gitinfo.blame(rel)["groups"]:
                obtido += [g["sha"][:39]] * g["n"]
            self.assertEqual(obtido, esperado, rel)

    def test_endpoints_de_arquivo_validam_caminho(self):
        ruins = ("../etc/passwd", "/etc/passwd", "-p", "back-end/.env", "back-end/../.env", "", ".git/config", "back-end/\x00x")
        for fn in (gitinfo.blame, gitinfo.file_log, gitinfo.file_meta):
            for bad in ruins:
                with self.assertRaises((ValueError, PermissionError), msg=f"{fn.__name__}({bad!r})"):
                    fn(bad)

    def test_historico_do_arquivo(self):
        log = gitinfo.file_log("back-end/src/main.ts")["commits"]
        self.assertTrue(log and all(len(c["sha"]) == 40 for c in log))

    def test_grafo_de_imports(self):
        g = gitinfo.import_graph()["back-end/src/routes.ts"]
        self.assertIn("back-end/src/modules/auth/auth.controller.ts", g["imports"])
        self.assertIn("back-end/src/main.ts", g["imported_by"])

    def test_busca_traz_coluna(self):
        hit = painel.grep("swaggerUi")[0]
        self.assertEqual(hit["text"][hit["col"]:hit["col"] + hit["len"]].lower(), "swaggerui")


if __name__ == "__main__":
    unittest.main()
