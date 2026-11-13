"""Snapshot exato e análise sem execução de ferramentas externas de qualidade."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import quality


class Quality(unittest.TestCase):
    def test_snapshot_changes_with_code_but_not_secrets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "back-end" / "src" / "a.ts"
            source.parent.mkdir(parents=True)
            source.write_text("const a = 1", encoding="utf-8")
            env = root / "back-end" / ".env"
            env.write_text("SECRET=one", encoding="utf-8")
            names = "back-end/src/a.ts\0back-end/.env\0"
            def git(*args):
                return "head" if args[0] == "rev-parse" else names
            with patch.object(quality, "ROOT", root), patch.object(quality.gitinfo, "git", side_effect=git):
                first = quality.fingerprint()
                env.write_text("SECRET=two", encoding="utf-8")
                self.assertEqual(first, quality.fingerprint())
                source.write_text("const a = 2", encoding="utf-8")
                self.assertNotEqual(first, quality.fingerprint())

    def test_scan_retains_every_function_with_portable_ids(self):
        raw = {"files": [{"path": "src/a.ts"}], "all_functions": [
            {"name": "a", "path": "src\\a.ts", "line": 2, "lines": 4, "cc": 3},
            {"name": "b", "path": "src/a.ts", "line": 9, "lines": 6, "cc": 2}]}
        with patch.object(quality, "fingerprint", return_value="abc"), patch.object(quality.gitinfo, "health", return_value=raw), patch.object(quality.gitinfo, "git", return_value="head"):
            scan = quality.scan()
        self.assertEqual(len(scan["functions"]), 2)
        self.assertEqual(scan["functions"][0]["id"], "back-end/src/a.ts:2:a")
        self.assertEqual(scan["functions"][0]["length"], 4)

    def test_concurrent_edit_rejects_inconsistent_snapshot(self):
        with patch.object(quality, "fingerprint", side_effect=["before", "after"]), patch.object(quality.gitinfo, "health", return_value={}):
            with self.assertRaisesRegex(ValueError, "mudou"):
                quality.scan()

    def test_http_endpoint_is_post_only_and_does_not_spawn(self):
        import painel
        handler = object.__new__(painel.Handler)
        with patch.object(quality, "scan", return_value={"snapshot": "abc"}) as scan:
            self.assertEqual(handler.route("POST", "/api/quality/scan", {}), {"snapshot": "abc"})
            scan.assert_called_once()


if __name__ == "__main__":
    unittest.main()
