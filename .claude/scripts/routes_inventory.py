#!/usr/bin/env python3
"""Lista as rotas registradas em routes.ts (método, caminho, middlewares/handler)."""
import re
from _common import SRC

text = (SRC / "routes.ts").read_text(encoding="utf-8")
rx = re.compile(r"router\.(get|post|put|patch|delete)\(\s*['\"]([^'\"]+)['\"]\s*,?\s*([^\n]*)", re.M)
rows = [(m.group(1).upper(), m.group(2), re.sub(r"\s+", " ", m.group(3)).rstrip(");").strip()) for m in rx.finditer(text)]
print(f"rotas: {len(rows)}")
for method, path, rest in rows:
    print(f" {method:6} {path:32} {rest[:70]}")
if "router.use(errorHandler(" in text:
    print("ATENÇÃO: routes.ts chama errorHandler(); ele já é registrado no main.ts")
