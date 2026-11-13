"""analise.title_of: título da sessão lendo só o que foi acrescentado, e o cache sem vazamento."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import analise  # noqa: E402


class Titulo(unittest.TestCase):
    def test_le_incrementalmente_e_acompanha_mudancas(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "s.jsonl"
            f.write_text(json.dumps({"type": "user"}) + "\n" + json.dumps({"type": "ai-title", "aiTitle": "Primeiro"}) + "\n", encoding="utf-8")
            self.assertEqual(analise.title_of(f), "Primeiro")
            with open(f, "a", encoding="utf-8") as fh:
                fh.write(json.dumps({"type": "assistant"}) + "\n" + '{"type": "ai-title", "aiTit')  # linha cortada no meio
            self.assertEqual(analise.title_of(f), "Primeiro")  # linha incompleta é ignorada
            with open(f, "a", encoding="utf-8") as fh:
                fh.write('le": "Segundo"}\n')
            self.assertEqual(analise.title_of(f), "Segundo")
            f.write_text(json.dumps({"type": "user"}) + "\n", encoding="utf-8")  # arquivo recomeçou menor
            self.assertIsNone(analise.title_of(f))

    def test_parse_file_guarda_so_a_versao_mais_nova(self):
        with tempfile.TemporaryDirectory() as d:
            f = Path(d) / "s.jsonl"
            f.write_text(json.dumps({"type": "user", "message": {"content": "oi"}}) + "\n", encoding="utf-8")
            analise.parse_file(f)
            f.write_text(f.read_text(encoding="utf-8") * 2, encoding="utf-8")
            analise.parse_file(f)
            self.assertEqual(len([k for k in analise._cache if k[0] == str(f)]), 1)


if __name__ == "__main__":
    unittest.main()
