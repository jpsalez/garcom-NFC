"""Testes da integração com o GitHub (sem rede e sem conta): usam o gh de mentira em tests/fake_gh/.
   python3 -B -m unittest discover -s .claude/scripts/tests"""
import http.client
import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import ghapi  # noqa: E402
import gitinfo  # noqa: E402
import painel  # noqa: E402

FAKE = str(Path(__file__).resolve().parent / "fake_gh" / "gh")
ENDPOINTS = [("status", {}), ("prs", {}), ("pr", {"n": "12"}), ("runs", {}), ("run", {"id": "1002"}), ("issues", {}), ("overview", {})]


class Base(unittest.TestCase):
    def setUp(self):
        ghapi.clear_cache()
        self.log = tempfile.NamedTemporaryFile(delete=False)
        self.log.close()
        self.env = mock.patch.dict(os.environ, {"PAINEL_GH_BIN": FAKE, "PAINEL_FAKE_GH_MODE": "ok", "PAINEL_FAKE_GH_LOG": self.log.name})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        os.unlink(self.log.name)
        ghapi.clear_cache()

    def calls(self, *needles):
        """Chamadas ao gh registradas pelo shim que contêm todos os trechos dados."""
        return [ln for ln in Path(self.log.name).read_text().splitlines() if all(n in ln for n in needles)]

    def get(self, name, **q):
        return ghapi.handle("GET", [name], q)


class Contrato(Base):
    def test_status(self):
        s = self.get("status")
        self.assertEqual((s["installed"], s["authenticated"], s["repo"], s["user"]), (True, True, "jpsalez/garcom-NFC", "fulano"))

    def test_prs_filtra_por_estado(self):
        todos = self.get("prs", state="all")["prs"]
        self.assertEqual([p["number"] for p in todos], [12, 11, 9])
        self.assertEqual([p["number"] for p in self.get("prs", state="open")["prs"]], [12, 11])
        self.assertEqual([p["number"] for p in self.get("prs", state="closed")["prs"]], [9])
        p = todos[0]
        self.assertEqual((p["checks"], p["review"], p["branch"], p["base"], p["labels"], p["draft"]), ("success", "approved", p["branch"], "main", ["frontend", "feature"], False))
        self.assertEqual([p["checks"] for p in todos], ["success", "failure", "pending"])
        self.assertEqual([p["review"] for p in todos], ["approved", "none", "changes_requested"])

    def test_detalhe_do_pr(self):
        d = self.get("pr", n="12")
        for k in ("number", "title", "body", "state", "branch", "base", "url", "checks", "reviews", "commits", "diff"):
            self.assertIn(k, d)
        self.assertEqual(d["checks"][0], {"name": "build", "status": "completed", "conclusion": "success", "url": d["checks"][0]["url"]})
        self.assertEqual(len(d["commits"][0]["short"]), 7)
        self.assertIn("-const port = 3000;", d["diff"])

    def test_execucoes_e_detalhe(self):
        r = self.get("runs")
        self.assertEqual(r["workflows"], ["CI", "Deploy"])
        run = r["runs"][0]
        self.assertEqual((run["workflow"], run["conclusion"], run["duration_s"]), ("CI", "success", 150))
        self.assertEqual(r["runs"][2]["status"], "in_progress")
        d = self.get("run", id="1002")
        self.assertEqual([j["conclusion"] for j in d["jobs"]], ["success", "failure"])
        self.assertEqual(d["jobs"][1]["steps"][1], {"name": "Run tests", "status": "completed", "conclusion": "failure"})
        self.assertIn("expected 200 got 500", d["failed_log"])
        self.assertNotIn("2026-11-12T", d["failed_log"])  # timestamps removidos
        self.assertEqual(self.get("run", id="1001")["failed_log"], "")  # sucesso: sem log

    def test_log_e_cortado_em_20kb(self):
        with mock.patch.object(ghapi, "_run", side_effect=[(0, "x" * 50_000, "")]), mock.patch.object(ghapi, "_json", return_value={"jobs": [{"name": "a", "conclusion": "failure", "steps": []}]}), mock.patch.object(ghapi, "_ready", return_value="a/b"):
            d = ghapi.run("5")
        self.assertLessEqual(len(d["failed_log"]), 20_000 + 30)

    def test_issues_ligam_com_tarefas_existentes(self):
        i = self.get("issues")["issues"]
        self.assertEqual(i[0]["task_ids"], ["DEC-01"])  # RF01 não existe em tasks.json: não entra
        self.assertEqual(i[1]["task_ids"], [])
        self.assertEqual(i[0]["assignees"], ["jpsalez"])

    def test_overview_segue_o_contrato(self):
        o = self.get("overview")
        self.assertEqual((o["unavailable"], o["repo"]), (False, "jpsalez/garcom-NFC"))
        self.assertEqual({p["number"] for p in o["open_prs"]}, {12, 11})
        sha, v = next(iter(o["runs_by_sha"].items()))
        self.assertEqual(len(sha), 40)
        self.assertEqual(set(v), {"status", "conclusion", "workflow", "url"})
        self.assertEqual(o["prs_by_branch"]["fix/porta"]["state"], "MERGED")
        self.assertEqual(set(o["latest_run"]), {"sha", "branch", "status", "conclusion", "workflow", "url"})


class Indisponivel(Base):
    def check(self, reason):
        for name, q in ENDPOINTS[1:]:
            r = self.get(name, **q)
            self.assertTrue(r["unavailable"], name)
            self.assertEqual(r["reason"], reason, name)
            self.assertTrue(r["message"] and isinstance(r["help"], list), name)

    def test_sem_gh_instalado(self):
        with mock.patch.dict(os.environ, {"PAINEL_GH_BIN": "/caminho/que/nao/existe/gh"}):
            ghapi.clear_cache()
            s = self.get("status")
            self.assertEqual((s["installed"], s["authenticated"]), (False, False))
            self.assertTrue(any("gh auth login" in x for x in s["help"]))
            self.check("not_installed")

    def test_sem_autenticacao(self):
        with mock.patch.dict(os.environ, {"PAINEL_FAKE_GH_MODE": "unauth"}):
            ghapi.clear_cache()
            s = self.get("status")
            self.assertEqual((s["installed"], s["authenticated"]), (True, False))
            self.assertTrue(any("gh auth login" in x for x in s["help"]))
            self.check("not_authenticated")

    def test_sem_remoto_do_github(self):
        with mock.patch.object(gitinfo, "github_remote", return_value=None):
            self.assertIsNone(self.get("status")["repo"])
            self.check("no_remote")

    def test_erro_do_gh_vira_unavailable_error_sem_vazar_token(self):
        err = "boom ghp_" + "a" * 30
        with mock.patch.object(ghapi, "_run", return_value=(1, "", err)), mock.patch.object(ghapi, "_ready", return_value="a/b"):
            r = ghapi.runs()
        self.assertEqual(r["reason"], "error")
        self.assertNotIn("ghp_", r["message"])


class Validacao(Base):
    def test_entradas_invalidas(self):
        for bad in ("", "abc", "12;rm", "-1", "1 2", "../1", "12\n", "9" * 12):
            with self.assertRaises(ValueError, msg=repr(bad)):
                ghapi.pr(bad)
            with self.assertRaises(ValueError, msg=repr(bad)):
                ghapi.run(bad)
        for bad in ("bogus", "OPEN", "", "all;"):
            with self.assertRaises(ValueError, msg=bad):
                ghapi.prs(bad)
        with self.assertRaises(ValueError):
            ghapi.handle("POST", ["status"], {})
        with self.assertRaises(ValueError):
            ghapi.handle("GET", ["nada"], {})
        self.assertEqual(self.calls("pr view "), [])  # nada inválido chegou ao gh

    def test_argumentos_vao_como_lista(self):
        self.get("pr", n="12")
        linha = self.calls("pr view ")[0]
        self.assertTrue(linha.startswith("pr view 12 -R jpsalez/garcom-NFC --json "))


class Cache(Base):
    def test_cache_de_60s_e_refresh(self):
        self.get("prs")
        self.get("prs")
        self.get("overview")
        self.assertEqual(len(self.calls("pr list", "--state open")), 1)  # segunda chamada veio do cache
        self.assertEqual(len(self.calls("auth status")), 1)  # status também é cacheado
        ghapi.handle("GET", ["prs"], {"refresh": "1"})
        self.assertEqual(len(self.calls("pr list", "--state open")), 2)
        real = ghapi.time.time
        with mock.patch.object(ghapi.time, "time", return_value=real() + 61):
            self.get("prs")
        self.assertEqual(len(self.calls("pr list", "--state open")), 3)  # passou de 60 s

    def test_falha_fica_pouco_tempo_em_cache(self):
        with mock.patch.dict(os.environ, {"PAINEL_FAKE_GH_MODE": "unauth"}):
            self.assertEqual(self.get("prs")["reason"], "not_authenticated")
            self.assertEqual(self.get("prs")["reason"], "not_authenticated")
            self.assertEqual(len(self.calls("auth status")), 1)
        real = ghapi.time.time
        with mock.patch.object(ghapi.time, "time", return_value=real() + 9):  # depois do TTL curto de falhas
            self.assertTrue(self.get("prs")["prs"])


class Http(Base):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), painel.Handler)
        cls.port = cls.srv.server_address[1]
        painel.ALLOWED_HOSTS.clear()
        painel.ALLOWED_HOSTS.update({f"127.0.0.1:{cls.port}"})
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()

    def call(self, path, token=True):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=15)
        c.request("GET", path, headers={"Host": f"127.0.0.1:{self.port}", **({"X-Panel-Token": painel.TOKEN} if token else {})})
        r = c.getresponse()
        return r.status, json.loads(r.read() or b"{}")

    def test_endpoints_pelo_servidor(self):
        st, d = self.call("/api/gh/status")
        self.assertEqual((st, d["authenticated"]), (200, True))
        self.assertEqual(self.call("/api/gh/prs?state=all")[0], 200)
        self.assertEqual(self.call("/api/gh/pr?n=abc")[0], 400)
        self.assertEqual(self.call("/api/gh/run?id=1;ls")[0], 400)
        self.assertEqual(self.call("/api/gh/status", token=False)[0], 401)

    def test_unavailable_e_200(self):
        with mock.patch.dict(os.environ, {"PAINEL_GH_BIN": "/nao/existe"}):
            ghapi.clear_cache()
            st, d = self.call("/api/gh/overview")
        self.assertEqual((st, d["unavailable"], d["reason"]), (200, True, "not_installed"))


if __name__ == "__main__":
    unittest.main()
