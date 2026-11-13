"""Testes do esquema de tarefas, da validação ao salvar e das decisões (tarefas.py), com arquivos temporários."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import tarefas  # noqa: E402


def t(i, **kw):
    return {"id": i, "titulo": f"Tarefa {i}", "status": "a-fazer", "fase": "MVP-1", "prioridade": "P1", **kw}


DEC_MD = """# Registro

## Pendentes
- [ ] DEC-01 · Quem abre o atendimento
  - Opções e contexto: garçom ou scan
  - Nota sua: o garçom abre
  - Bloqueia: SES-01
- [x] DEC-04 · Tamanho do public_code — 12 caracteres (12/11/2026)

## Outra seção
- [ ] não é decisão
"""


class Tarefas(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        self.p = [mock.patch.object(tarefas, "TASKS", d / "tasks.json"), mock.patch.object(tarefas, "DEC", d / "decisoes.md")]
        [x.start() for x in self.p]
        tarefas.DEC.write_text(DEC_MD, encoding="utf-8")
        tarefas.TASKS.write_text(json.dumps({"tasks": [t("AUT-01", status="feita"), t("SES-01", depende_de=["AUT-01"], bloqueada_por_decisao="DEC-01"), t("TAB-01")]}), encoding="utf-8")

    def tearDown(self):
        [x.stop() for x in self.p]
        self.tmp.cleanup()

    def test_valida_campos_obrigatorios_e_dominios(self):
        for ruim in (t("AUT-01", status="todo"), t("AUT-01", fase="Depois"), t("AUT-01", prioridade="P9"), {**t("AUT-01"), "titulo": ""}, t("x"),
                     t("AUT-01", quem="robô"), t("AUT-01", depende_de="AUT-02"), t("AUT-01", criterios=[""]), t("AUT-01", bloqueada_por_decisao="01"),
                     t("AUT-01", extra=1), t("AUT-01", titulo="x" * 201), t("AUT-01", status="arquivada")):
            with self.assertRaises(ValueError, msg=str(ruim)):
                tarefas.validar(ruim)
        tarefas.validar(t("AUT-01", status="arquivada", motivo="duplicada", criterios=["a"], arquivos=["x.ts"], bloqueada_por_decisao=["DEC-01", "DEC-02"]))

    def test_recusa_ids_repetidos_dependencia_inexistente_e_ciclo(self):
        with self.assertRaisesRegex(ValueError, "repetido"):
            tarefas.validar_todas([t("AA-1"), t("AA-1")])
        with self.assertRaisesRegex(ValueError, "não existe"):
            tarefas.validar_todas([t("AA-1", depende_de=["BB-9"])])
        with self.assertRaisesRegex(ValueError, "ciclo"):
            tarefas.validar_todas([t("AA-1", depende_de=["BB-1"]), t("BB-1", depende_de=["CC-1"]), t("CC-1", depende_de=["AA-1"])])
        with self.assertRaisesRegex(ValueError, "si mesma"):
            tarefas.validar_todas([t("AA-1", depende_de=["AA-1"])])

    def test_salvar_recusa_json_invalido_sem_tocar_no_arquivo(self):
        antes = tarefas.TASKS.read_text(encoding="utf-8")
        with self.assertRaises(ValueError):
            tarefas.salvar([t("AA-1", status="invalido")])
        self.assertEqual(tarefas.TASKS.read_text(encoding="utf-8"), antes)

    def test_atualizar_criar_e_apagar(self):
        r = tarefas.atualizar("TAB-01", {"status": "fazendo"})
        self.assertEqual((r["status"], r["atualizada_em"] == tarefas.hoje()), ("fazendo", True))
        with self.assertRaises(ValueError):
            tarefas.atualizar("TAB-01", {"status": "arquivada"})  # sem motivo
        tarefas.atualizar("TAB-01", {"status": "arquivada", "motivo": "teste"})
        with self.assertRaises(ValueError):
            tarefas.atualizar("TAB-01", {"campo_novo": 1})
        with self.assertRaises(KeyError):
            tarefas.atualizar("ZZZ-9", {"status": "feita"})
        nova = tarefas.criar({"titulo": "  Nova  ", "fase": "MVP-2"})
        self.assertEqual((nova["id"], nova["titulo"], nova["status"]), ("T-001", "Nova", "a-fazer"))
        with self.assertRaises(ValueError):
            tarefas.criar({"titulo": ""})
        tarefas.apagar("AUT-01")  # remove também a dependência que apontava para ela
        self.assertNotIn("depende_de", next(x for x in tarefas.carregar() if x["id"] == "SES-01"))

    def test_formato_antigo_e_detectado(self):
        tarefas.TASKS.write_text(json.dumps({"tasks": [{"id": "AA-1", "title": "x"}]}), encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "migrar_tarefas"):
            tarefas.carregar()

    def test_decisoes_separam_pendentes_e_resolvidas_e_contam_bloqueios(self):
        d = tarefas.decisoes()
        self.assertEqual([x["id"] for x in d["pendentes"]], ["DEC-01"])
        self.assertEqual([x["id"] for x in d["resolvidas"]], ["DEC-04"])
        self.assertEqual(d["pendentes"][0]["bloqueia"], ["SES-01"])  # calculado do tasks.json, não do texto
        self.assertEqual(d["tarefas_bloqueadas"], ["SES-01"])
        self.assertIn("12 caracteres", d["resolvidas"][0]["nota"])
        self.assertFalse(any("Bloqueia" in x for x in d["pendentes"][0]["detalhes"]))

    def test_marcar_decisao_so_mexe_na_linha_dela(self):
        with mock.patch("realtime.publish"):
            d = tarefas.marcar_decisao("DEC-01", True, "garçom abre e fecha")
        self.assertEqual(sorted(x["id"] for x in d["resolvidas"]), ["DEC-01", "DEC-04"])
        self.assertEqual(d["pendentes"], [])
        txt = tarefas.DEC.read_text(encoding="utf-8")
        self.assertIn("- [x] DEC-01 · Quem abre o atendimento — garçom abre e fecha", txt)
        self.assertIn("- [ ] não é decisão", txt)  # outras caixas intactas
        self.assertIn("  - Nota sua: o garçom abre", txt)  # detalhes preservados
        with mock.patch("realtime.publish"):
            tarefas.marcar_decisao("DEC-01", False)
        self.assertIn("- [ ] DEC-01 · Quem abre o atendimento", tarefas.DEC.read_text(encoding="utf-8"))
        for ruim in ("DEC-1", "../x", "DEC-99"):
            with self.assertRaises((ValueError, KeyError)):
                tarefas.marcar_decisao(ruim, True)

    def test_ids_conhecidos_incluem_decisoes(self):
        self.assertEqual(tarefas.ids_conhecidos(), {"AUT-01", "SES-01", "TAB-01", "DEC-01", "DEC-04"})


class DadosReais(unittest.TestCase):
    def test_tasks_json_do_projeto_e_valido(self):
        lista = tarefas.carregar()
        self.assertGreater(len(lista), 50)
        tarefas.validar_todas(lista)
        self.assertFalse([x for x in lista if x["id"].startswith("DEC-")], "decisões não ficam em tasks.json")

    def test_todo_bloqueio_por_decisao_aponta_para_decisao_existente(self):
        ids = {d["id"] for d in tarefas.decisoes()["pendentes"] + tarefas.decisoes()["resolvidas"]}
        for x in tarefas.carregar():
            b = x.get("bloqueada_por_decisao")
            for d in ([b] if isinstance(b, str) else b or []):
                self.assertIn(d, ids, f"{x['id']} → {d}")


if __name__ == "__main__":
    unittest.main()
