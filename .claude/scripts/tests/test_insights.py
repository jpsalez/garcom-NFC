"""Testes da fase 4 (treemap, complexidade, módulos, acoplamento):  python3 -B -m unittest discover -s .claude/scripts/tests"""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _common  # noqa: E402
import gitinfo  # noqa: E402
import insights  # noqa: E402


class Limites(unittest.TestCase):
    def test_parametros_fora_do_intervalo_ou_nao_numericos(self):
        ruins = [("treemap", {"days": "6"}), ("treemap", {"days": "731"}), ("complexity", {"top": "0"}), ("complexity", {"top": "21"}),
                 ("complexity", {"points": "2"}), ("complexity", {"points": "31"}), ("coupling", {"min": "0"}), ("coupling", {"min": "51"}),
                 ("coupling", {"days": "abc"}), ("coupling", {"days": "6"}), ("treemap", {"days": "-1"})]
        for rota, q in ruins:
            with self.assertRaises(ValueError, msg=f"{rota} {q}"):
                insights.handle("GET", [rota], q)

    def test_rotas_desconhecidas_e_metodos(self):
        for method, parts in (("GET", ["nada"]), ("GET", []), ("POST", ["treemap"]), ("GET", ["treemap", "x"])):
            with self.assertRaises(ValueError):
                insights.handle(method, parts, {})


class Puras(unittest.TestCase):
    def test_scc_acha_ciclo_e_ignora_dag(self):
        self.assertEqual(insights.strongly_connected(["a", "b", "c", "d"], [("a", "b"), ("b", "c"), ("c", "a"), ("d", "a")]), [["a", "b", "c"]])
        self.assertEqual(insights.strongly_connected(["a", "b", "c"], [("a", "b"), ("b", "c"), ("a", "c")]), [])
        self.assertEqual(insights.strongly_connected(["a"], [("a", "a")]), [])  # laço em si mesmo não é ciclo entre módulos
        self.assertEqual(insights.strongly_connected(["a", "b", "c", "d"], [("a", "b"), ("b", "a"), ("c", "d"), ("d", "c")]), [["a", "b"], ["c", "d"]])

    def test_modulo_do_arquivo(self):
        self.assertEqual(insights.module_of("back-end/src/modules/auth/auth.service.ts"), "auth")
        self.assertEqual(insights.module_of("back-end/src/shared/utils/jwt.ts"), "shared")
        self.assertEqual(insights.module_of("back-end/src/main.ts"), "app")
        self.assertEqual(insights.module_of("back-end/src/docs/openapi.ts"), "app")

    def test_caminhos_antigos_viram_os_de_hoje(self):
        self.assertEqual(insights.norm_path("src/main.ts"), "back-end/src/main.ts")
        self.assertEqual(insights.norm_path("prisma/schema.prisma"), "back-end/prisma/schema.prisma")
        self.assertEqual(insights.norm_path("frontend/app/page.tsx"), "front-end/app/page.tsx")
        self.assertEqual(insights.norm_path("back-end/src/main.ts"), "back-end/src/main.ts")

    def test_detector_de_funcoes_cobre_function_arrow_e_metodo(self):
        fontes = {
            "function": "export default async function Page({ a = f() }) {\n  if (a) { return 1 }\n  return 2;\n}\n",
            "arrow": "export const go = async (x: number): Promise<void> => {\n  if (x) { await y() }\n};\n",
            "metodo": "class K {\n  async run(a: number) {\n    if (a) { return 1 }\n    return 0;\n  }\n}\n",
        }
        for nome, src in fontes.items():
            self.assertEqual(insights.text_metrics(src)[1], 2, nome)
        # blocos de controle (if/for/while) não contam como funções
        self.assertEqual(len(insights.function_spans(gitinfo.strip_code("function f() {\n  if (x) {\n    y();\n  }\n  for (const a of b) {\n  }\n}\n"))), 1)

    def test_metricas_do_texto(self):
        loc, cc, longest = insights.text_metrics("// comentário\nfunction f(a: number) {\n  if (a > 1 && a < 5) {\n    return 1;\n  }\n  return 0;\n}\n")
        self.assertEqual((cc, longest), (3, 6))  # 1 + if + &&
        self.assertEqual(loc, 6)  # sem o comentário


class RepoReal(unittest.TestCase):
    def setUp(self):
        insights._cache.clear()

    def test_treemap_soma_de_loc_e_caminhos(self):
        tm = insights.treemap(90)
        self.assertTrue(tm["files"])
        base = Path(gitinfo.ROOT)
        for f in tm["files"]:
            self.assertTrue((base / f["path"]).is_file(), f["path"])
            self.assertTrue(f["path"].startswith(("back-end/src/", "front-end/")))
            self.assertGreaterEqual(f["loc"], 0)
        soma = sum(insights.text_metrics((base / f["path"]).read_text(encoding="utf-8", errors="replace"))[0] for f in tm["files"])
        self.assertEqual(soma, sum(f["loc"] for f in tm["files"]))
        self.assertEqual(tm["max_commits"], max(f["commits"] for f in tm["files"]))

    def test_modulos_do_backend(self):
        m = insights.modules()
        ids = {n["id"] for n in m["nodes"]}
        self.assertTrue({"auth", "users", "shared"} <= ids)
        for e in m["edges"]:
            self.assertIn(e["from"], ids)
            self.assertIn(e["to"], ids)
            self.assertNotEqual(e["from"], e["to"])
            self.assertGreater(e["weight"], 0)
        for n in m["nodes"]:
            self.assertEqual(n["files"], len(n["file_list"]))


class RepoTemporario(unittest.TestCase):
    """Histórico controlado: acoplamento e evolução da complexidade."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.tmp.name).resolve()
        env = {**os.environ, "GIT_AUTHOR_NAME": "Ana", "GIT_COMMITTER_NAME": "Ana", "GIT_AUTHOR_EMAIL": "a@x", "GIT_COMMITTER_EMAIL": "a@x"}

        def git(*a):
            return subprocess.run(["git", "-C", str(cls.root), *a], env=env, capture_output=True, text=True, check=True).stdout.strip()

        def write(rel, text):
            p = cls.root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)

        def commit(msg, files):
            for rel, text in files.items():
                write(rel, text)
            git("add", "-A")
            git("commit", "-q", "-m", msg)

        git("init", "-b", "main")
        a, b, c = "back-end/src/a.ts", "back-end/src/b.ts", "back-end/src/c.ts"
        fn = lambda n: "function f(x: number) {\n" + "".join(f"  if (x > {i}) {{\n    return {i};\n  }}\n" for i in range(n)) + "  return 0;\n}\n"
        for i in range(3):
            commit(f"a+b {i}", {a: fn(i + 1), b: f"// b{i}\nexport const b = {i};\n"})
        commit("a+c", {a: fn(5), c: "export const c = 1;\n"})
        commit("a+lock", {a: fn(6), "package-lock.json": "{}\n"})
        commit("d v1", {"back-end/src/d.ts": fn(1)})
        commit("d v2", {"back-end/src/d.ts": fn(3)})
        git("mv", "back-end/src/d.ts", "back-end/src/d2.ts")
        git("commit", "-q", "-m", "renomeia d")
        commit("grande", {f"back-end/src/gen/g{i}.ts": f"export const g{i} = {i};\n" for i in range(45)})
        cls.sha_a = [ln.split()[0] for ln in git("log", "--format=%H", "--", a).splitlines()]
        cls.patches = [mock.patch.object(m, n, v) for m, n, v in ((_common, "ROOT", cls.root), (gitinfo, "ROOT", cls.root), (gitinfo, "REPO", cls.root))]
        [x.start() for x in cls.patches]

    @classmethod
    def tearDownClass(cls):
        [x.stop() for x in cls.patches]
        cls.tmp.cleanup()

    def setUp(self):
        insights._cache.clear()

    def test_acoplamento(self):
        r = insights.coupling(180, 2)
        self.assertEqual(r["skipped_big"], 1)  # o commit de 45 arquivos é ignorado
        par = next(p for p in r["pairs"] if (p["a"], p["b"]) == ("back-end/src/a.ts", "back-end/src/b.ts"))
        self.assertEqual((par["together"], par["a_commits"], par["b_commits"], par["confidence"]), (3, 5, 3, 1.0))
        self.assertFalse(any("package-lock" in p["a"] + p["b"] for p in r["pairs"]))  # lockfile é ruído
        self.assertFalse(any("c.ts" in p["a"] + p["b"] for p in r["pairs"]))  # só 1 vez junto, abaixo do mínimo 2
        self.assertTrue(any("c.ts" in p["a"] + p["b"] for p in insights.coupling(180, 1)["pairs"]))

    def test_complexidade_cresce_na_serie(self):
        r = insights.complexity(top=3, points=10)
        a = next(f for f in r["files"] if f["path"] == "back-end/src/a.ts")
        self.assertEqual([s["cc_max"] for s in a["series"]], [2, 3, 4, 6, 7])  # 1 + número de ifs em cada versão
        self.assertEqual(len(a["series"][0]["sha"]), 40)
        self.assertEqual(a["cc_now"], 7)

    def test_complexidade_acompanha_renomeacao(self):
        r = insights.complexity(top=5, points=10)
        d = next(f for f in r["files"] if f["path"] == "back-end/src/d2.ts")
        self.assertEqual([s["cc_max"] for s in d["series"]], [2, 4, 4])  # as 2 versões com o nome antigo + o commit do rename

    def test_treemap_conta_commits_no_repo_temporario(self):
        tm = insights.treemap(90)
        por = {f["path"]: f for f in tm["files"]}
        self.assertEqual(por["back-end/src/a.ts"]["commits"], 5)
        self.assertEqual(por["back-end/src/a.ts"]["cc_max"], 7)
        self.assertEqual(por["back-end/src/b.ts"]["commits"], 3)

    def test_modulos_com_ciclo_sintetico(self):
        g = {"back-end/src/modules/x/a.ts": {"imports": ["back-end/src/modules/y/b.ts"], "imported_by": []},
             "back-end/src/modules/y/b.ts": {"imports": ["back-end/src/modules/x/a.ts", "back-end/src/shared/s.ts"], "imported_by": []},
             "back-end/src/shared/s.ts": {"imports": [], "imported_by": []},
             "back-end/src/modules/z/c.ts": {"imports": ["back-end/src/shared/s.ts", "back-end/src/modules/x/a.ts"], "imported_by": []},
             "front-end/app/page.tsx": {"imports": [], "imported_by": []}}
        with mock.patch.object(gitinfo, "import_graph", return_value=g):
            m = insights.modules()
        self.assertEqual(m["cycles"], [["x", "y"]])
        self.assertEqual({n["id"] for n in m["nodes"]}, {"x", "y", "z", "shared"})  # front-end fica de fora
        fan = {n["id"]: (n["fan_in"], n["fan_out"]) for n in m["nodes"]}
        self.assertEqual(fan["shared"], (2, 0))
        self.assertEqual(fan["x"], (2, 1))
        self.assertEqual(m["high_fan_in"], ["shared", "x"])  # fan-in máximo (2)


if __name__ == "__main__":
    unittest.main()
