#!/usr/bin/env python3
"""Aponta métodos de repository sem restaurantId (risco de vazar dados entre restaurantes).
Uso: python3 .claude/scripts/check_tenant.py
Saída curta: só o que merece conferência."""
import re
from _common import SRC, rel

# Métodos que, por desenho, não recebem restaurantId (confirme se ainda faz sentido)
OK = {"create", "findByPublicCode", "findByEmail", "findBySlug", "findByHash", "constructor"}
METHOD = re.compile(r"^\s{2}(?:async\s+)?(\w+)\(([^)]*)\)[^{]*\{", re.M)

flags = []
for f in sorted(SRC.glob("modules/**/*.repository.ts")):
    text = f.read_text(encoding="utf-8")
    for m in METHOD.finditer(text):
        name, params = m.group(1), m.group(2)
        if name in OK:
            continue
        body = text[m.end(): m.end() + 600]
        has_param = "restaurantId" in params
        has_where = "restaurant_id" in body or "restaurantId" in body
        if not has_param:
            flags.append(f"{rel(f)}: {name}() sem parâmetro restaurantId")
        elif not has_where:
            flags.append(f"{rel(f)}: {name}() recebe restaurantId mas não parece filtrar por ele")

print("tenant: OK (nenhum método suspeito)" if not flags else f"tenant: {len(flags)} ponto(s) para conferir")
for x in flags:
    print(" -", x)
