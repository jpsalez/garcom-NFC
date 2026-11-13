#!/usr/bin/env python3
"""Liga/desliga o 'modo IA': copia os modelos de .claude/ai-mode/templates para o back-end.

  python3 .claude/scripts/ai_mode.py status                 mostra o que falta
  python3 .claude/scripts/ai_mode.py enable                 SIMULA (nada é alterado)
  python3 .claude/scripts/ai_mode.py enable --apply         copia os arquivos e ajusta scripts do package.json
  python3 .claude/scripts/ai_mode.py disable --apply        desfaz exatamente o que o enable fez
  Opção --target PASTA aplica em outra pasta (ex.: cópia de teste). --force sobrescreve arquivos existentes.

Nunca instala pacotes: imprime o comando npm para você (ou a IA) rodar.
"""
import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

from _common import BACK, ROOT

TEMPLATES = ROOT / ".claude" / "ai-mode" / "templates"
SKIP = {"package.additions.json"}
STATE = ROOT / ".claude" / "ai-mode" / "state"   # controle fica em .claude, nunca no back-end
PLACEHOLDER_TEST = "no test specified"


def template_files():
    for p in sorted(TEMPLATES.rglob("*")):
        if p.is_file() and p.name not in SKIP:
            yield p.relative_to(TEMPLATES)


def state_files(target: Path):
    key = hashlib.sha1(str(target).encode()).hexdigest()[:10]
    return STATE / f"{key}.json", STATE / f"{key}.package.json.bak"


def load_json(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def status(target: Path):
    add = load_json(TEMPLATES / "package.additions.json")
    pkg = load_json(target / "package.json")
    print(f"alvo: {target}")
    print("modo IA:", "LIGADO (manifesto presente)" if state_files(target)[0].exists() else "desligado")
    for rel in template_files():
        print(f"  {'existe ' if (target / rel).exists() else 'FALTA  '} {rel}")
    scripts = pkg.get("scripts", {})
    for k in add["scripts"]:
        cur = scripts.get(k)
        print(f"  script {k}: {'ok' if cur and PLACEHOLDER_TEST not in cur else 'FALTA'}")
    dev = {**pkg.get("devDependencies", {}), **pkg.get("dependencies", {})}
    missing = [d for d in add["devDependencies"] if d not in dev]
    print("  devDependencies faltando:", ", ".join(missing) or "nenhuma")
    if missing:
        print("  instalar com: npm i -D " + " ".join(missing))


def enable(target: Path, apply: bool, force: bool):
    add = load_json(TEMPLATES / "package.additions.json")
    pkg_path = target / "package.json"
    pkg = load_json(pkg_path)
    manifest = {"created": [], "scripts_added": [], "scripts_replaced": {}}

    for rel in template_files():
        dest = target / rel
        if dest.exists() and not force:
            print(f"  pula (já existe): {rel}")
            continue
        print(f"  {'copia' if apply else 'copiaria'}: {rel}")
        if apply:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(TEMPLATES / rel, dest)
            manifest["created"].append(str(rel))

    scripts = pkg.setdefault("scripts", {})
    for k, v in add["scripts"].items():
        cur = scripts.get(k)
        if cur is None:
            print(f"  {'add' if apply else 'adicionaria'} script {k}")
            manifest["scripts_added"].append(k)
            scripts[k] = v
        elif PLACEHOLDER_TEST in cur:
            print(f"  {'troca' if apply else 'trocaria'} script {k} (era o texto padrão do npm)")
            manifest["scripts_replaced"][k] = cur
            scripts[k] = v
        else:
            print(f"  mantém script {k} (você já tem um)")

    if apply:
        mpath, bpath = state_files(target)
        STATE.mkdir(parents=True, exist_ok=True)
        shutil.copy2(pkg_path, bpath)
        pkg_path.write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        mpath.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print(f"backup do package.json em {bpath.relative_to(ROOT)}")
    else:
        print("\nSIMULAÇÃO: nada foi alterado. Use --apply para executar.")

    dev = {**pkg.get("devDependencies", {}), **pkg.get("dependencies", {})}
    missing = [d for d in add["devDependencies"] if d not in dev]
    if missing:
        print("\nPróximo passo (não executado por este script):\n  cd " + str(target) + " && npm i -D " + " ".join(missing))
    print("Depois: npm run test:db:up && npm test")


def disable(target: Path, apply: bool):
    mp, bp = state_files(target)
    if not mp.exists():
        print("Nada a desfazer: manifesto não encontrado.")
        return
    m = load_json(mp)
    for rel in m["created"]:
        print(f"  {'remove' if apply else 'removeria'}: {rel}")
        if apply:
            (target / rel).unlink(missing_ok=True)
    pkg_path = target / "package.json"
    pkg = load_json(pkg_path)
    scripts = pkg.get("scripts", {})
    for k in m["scripts_added"]:
        print(f"  {'remove' if apply else 'removeria'} script {k}")
        scripts.pop(k, None)
    for k, old in m["scripts_replaced"].items():
        print(f"  {'restaura' if apply else 'restauraria'} script {k}")
        scripts[k] = old
    if apply:
        pkg_path.write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        mp.unlink()
        bp.unlink(missing_ok=True)
        # remove pastas vazias criadas pelo modo IA
        for d in ("tests/helpers", "tests", ".github/workflows", ".github"):
            try:
                (target / d).rmdir()
            except OSError:
                pass
        print("Desfeito. Pacotes npm NÃO foram removidos; para tirar: npm rm vitest supertest @types/supertest @biomejs/biome")
    else:
        print("\nSIMULAÇÃO: nada foi alterado. Use --apply para executar.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["status", "enable", "disable"])
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--target", default=str(BACK))
    a = ap.parse_args()
    t = Path(a.target).resolve()
    if a.cmd == "status":
        status(t)
    elif a.cmd == "enable":
        enable(t, a.apply, a.force)
    else:
        disable(t, a.apply)
    sys.exit(0)
