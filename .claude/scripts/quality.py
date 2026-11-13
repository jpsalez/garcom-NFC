"""Snapshot de qualidade sob demanda. Sem processos, timers ou ferramentas adicionais."""
import hashlib
import time
from pathlib import Path

import gitinfo
from _common import ROOT


def fingerprint():
    digest = hashlib.sha256()
    digest.update(gitinfo.git("rev-parse", "HEAD").strip().encode())
    names = gitinfo.git("ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "back-end", "front-end").split("\0")
    for name in sorted(set(filter(None, names))):
        # Nunca ler segredos, binários, dependências ou resultados de ferramentas.
        path = Path(name)
        if any(p in {"node_modules", "generated", "coverage", ".next", "dist"} for p in path.parts):
            continue
        if path.suffix not in {".ts", ".tsx", ".js", ".jsx", ".json", ".prisma", ".sql"}:
            continue
        target = ROOT / name
        digest.update(name.encode())
        digest.update(target.read_bytes() if target.is_file() else b"<deleted>")
    return digest.hexdigest()


def scan():
    before = fingerprint()
    health = gitinfo.health()
    after = fingerprint()
    if before != after:
        raise ValueError("O código mudou durante a leitura. Atualize o diagnóstico.")
    functions = [{**f, "path": "back-end/" + f["path"].replace("\\", "/")} for f in health["all_functions"]]
    for f in functions:
        f["id"] = f'{f["path"]}:{f["line"]}:{f["name"]}'
        f["length"] = f["lines"]
    return {"snapshot": after, "head": gitinfo.git("rev-parse", "--short", "HEAD").strip(),
            "scannedAt": time.time(), "functions": functions, "files": len(health["files"]),
            "scope": "back-end/src · TypeScript · estimativas por regex",
            "note": "Complexidade e tamanho são aproximações. Cobertura, testes e mutação exigem relatório da mesma versão. Front-end não avaliado por este estimador."}
