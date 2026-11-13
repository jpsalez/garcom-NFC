#!/usr/bin/env python3
"""Compara código x base de conhecimento e imprime só as diferenças:
rotas do código ausentes na documentação, modelos/enums do Prisma ausentes e arquivos de módulos novos."""
import re
from _common import SRC, BACK, KNOW, ts_files, rel

know = "\n".join(p.read_text(encoding="utf-8") for p in KNOW.glob("*.md")).lower()
diffs = []

routes = (SRC / "routes.ts").read_text(encoding="utf-8")
for m, path in re.findall(r"router\.(get|post|put|patch|delete)\(\s*['\"]([^'\"]+)['\"]", routes):
    if path.lower() not in know:
        diffs.append(f"rota {m.upper()} {path} não aparece na documentação")

schema = (BACK / "prisma" / "schema.prisma").read_text(encoding="utf-8")
for kind, name in re.findall(r"^(model|enum)\s+(\w+)", schema, re.M):
    if name.lower() not in know:
        diffs.append(f"{kind} {name} do schema não aparece na documentação")

for f in ts_files(SRC / "modules"):
    if f.name.lower() not in know:
        diffs.append(f"arquivo {rel(f)} não é citado na documentação")

print("doc_drift: sem diferenças" if not diffs else f"doc_drift: {len(diffs)} diferença(s)")
for d in diffs:
    print(" -", d)
