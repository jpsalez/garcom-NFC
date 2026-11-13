#!/usr/bin/env python3
"""Mapa compacto do código: arquivo, linhas e nomes exportados. Use no lugar de explorar pasta por pasta."""
import re
from _common import ts_files, rel

EXP = re.compile(r"^export\s+(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(class|function|const|type|interface|enum)\s+(\w+)", re.M)
for f in ts_files():
    t = f.read_text(encoding="utf-8")
    names = ", ".join(n for _, n in EXP.findall(t))
    n = t.count("\n") + 1
    print(f"{rel(f)} [{n}l]" + (f": {names}" if names else ""))
