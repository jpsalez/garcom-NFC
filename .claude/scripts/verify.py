#!/usr/bin/env python3
"""Verificação de uma linha por etapa: typecheck e, se existirem, lint e testes.
Uso: python3 .claude/scripts/verify.py   (não altera arquivos)"""
import json, subprocess, sys
from _common import BACK


def run(label, cmd):
    try:
        r = subprocess.run(cmd, cwd=BACK, capture_output=True, text=True, timeout=180)
    except Exception as e:  # npx ausente, timeout etc.
        print(f"{label}: NÃO EXECUTOU ({e.__class__.__name__})")
        return False
    out = (r.stdout + r.stderr).strip().splitlines()
    if r.returncode == 0:
        print(f"{label}: OK")
        return True
    errs = [l for l in out if "error" in l.lower()] or out
    print(f"{label}: FALHOU ({len(errs)} linha(s) de erro)")
    for l in errs[:12]:
        print("   ", l[:160])
    return False


scripts = json.loads((BACK / "package.json").read_text(encoding="utf-8")).get("scripts", {})
ok = run("typecheck", ["npx", "tsc", "--noEmit"])
for name in ("lint", "test"):
    s = scripts.get(name, "")
    if s and "no test specified" not in s:
        ok = run(name, ["npm", "run", "--silent", name]) and ok
    else:
        print(f"{name}: não configurado")
sys.exit(0 if ok else 1)
