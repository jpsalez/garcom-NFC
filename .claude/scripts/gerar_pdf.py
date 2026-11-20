#!/usr/bin/env python3
"""Gera o PDF da documentação técnica a partir dos capítulos em .claude/knowledge/garcom-nfc.

Uso: python3 .claude/scripts/gerar_pdf.py [--versao 1.2] [--saida docs/Documentacao-Tecnica-garcom-NFC.pdf]
Precisa do pacote Python `markdown`, do Chromium (`chromium`) e do `pdftotext` (poppler).
Sem o pacote no Python do sistema, use um ambiente temporário:
    python3 -m venv /tmp/pdfenv && /tmp/pdfenv/bin/pip install markdown
    /tmp/pdfenv/bin/python .claude/scripts/gerar_pdf.py

É o único script desta pasta que grava, e só o PDF de saída (capítulos e código não são alterados).
As figuras são SVG desenhados em pdf_figuras.py: ao mudar um fluxo ou o modelo de dados, atualize a figura.
O índice é numerado em duas passadas (a 1ª descobre em que página cada título caiu)."""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path

from _common import KNOW, ROOT
from pdf_figuras import FIGS

try:
    import markdown
except ImportError:
    sys.exit("Falta o pacote `markdown`. Veja o uso no início de gerar_pdf.py.")

KB = KNOW

FILES = [
    "cap-01-visao-geral-e-escopo", "cap-02-requisitos-e-regras-de-negocio", "cap-03-arquitetura-e-tecnologias",
    "cap-04-modelo-de-dados", "cap-05-modulos-implementados", "cap-06-modulos-parciais",
    "cap-07-fluxos-operacionais-e-ciclos-de-vida", "cap-08-api-realtime-seguranca-config-erros",
    "cap-09-estado-roadmap-limitacoes", "apendice-a-divergencias", "apendice-b-glossario",
    "apendice-c0-introducao", "apendice-c1-modelo-de-dados-v02", "apendice-c2-endpoints-eventos-v02",
    "apendice-c3-fluxos-telas-v02", "apendice-c4-desenho-proposto-modulos", "apendice-c5-propostas-guia",
    "apendice-d-cardapio-e-pedidos",
]
VERSION = "1.2"  # padrão; --versao muda
FIG_RE = re.compile(r"^_Figura: \*\*Figura (\d+\.\d+)\*\* – (.*)_\s*$")


def clean(text):
    out, prev_list = [], False
    for ln in text.replace("\r", "").split("\n"):
        if not ln.strip():
            out.append("")
            prev_list = False
            continue
        if ln.lstrip().startswith("|"):
            ln = re.sub(r"\|\s*[`*]+\s*$", "|", ln.rstrip())
            ln = re.sub(r"\s+[`*]+\s*$", "", ln) if ln.rstrip().endswith("|") is False else ln
        is_list = bool(re.match(r"^\s*([-*]|\d+\.)\s+", ln))
        if is_list and out and out[-1] != "" and not prev_list:
            out.append("")
        if (ln.lstrip().startswith("|")) and out and out[-1] != "" and not out[-1].lstrip().startswith("|"):
            out.append("")
        prev_list = is_list
        out.append(ln)
    return "\n".join(out)


def inline(md_text):
    html = markdown.markdown(md_text)
    return re.sub(r"^<p>|</p>$", "", html.strip())


def convert(name):
    text = clean((KB / f"{name}.md").read_text(encoding="utf-8"))
    lines, res = text.split("\n"), []
    for ln in lines:
        m = FIG_RE.match(ln.strip())
        if m:
            num, cap = m.groups()
            if num not in FIGS:
                print("figura sem desenho:", num)
                res.append(ln)
                continue
            res.append("")
            res.append(
                f'<figure class="fig"><div class="figsvg">{FIGS[num]()}</div>'
                f'<figcaption><b>Figura {num}</b> – {inline(cap)}</figcaption></figure>'
            )
            res.append("")
        else:
            res.append(ln)
    html = markdown.markdown("\n".join(res), extensions=["tables", "sane_lists", "fenced_code"])
    # Cada capítulo (H1) começa em página nova; wrapper para o CSS
    return f'<section class="chapter">{html}</section>'


def toc_entries(body):
    ents = []
    for m in re.finditer(r"<h([12]) id=\"(h\d+)\">(.*?)</h\1>", body, re.S):
        lvl, hid, t = m.groups()
        ents.append((int(lvl), hid, re.sub(r"<[^>]+>", "", t).strip()))
    return ents


def add_ids(html):
    n = [0]

    def rep(m):
        n[0] += 1
        return f'<h{m.group(1)} id="h{n[0]}">'

    return re.sub(r"<h([12])>", rep, html)


def css(version: str) -> str:
    return """
@page { size: A4; margin: 22mm 18mm 20mm 18mm;
  @top-left { content: "garcom-NFC — Documentação Técnica"; font: 8pt 'Liberation Sans', Arial, sans-serif; color: #6b7280; }
  @top-right { content: "v""" + version + """"; font: 8pt 'Liberation Sans', Arial, sans-serif; color: #6b7280; }
  @bottom-center { content: "Página " counter(page); font: 8pt 'Liberation Sans', Arial, sans-serif; color: #6b7280; } }
@page :first { margin: 0; @top-left { content: none; } @top-right { content: none; } @bottom-center { content: none; } }
* { box-sizing: border-box; }
html { font-family: 'Liberation Sans', Arial, sans-serif; font-size: 9.6pt; color: #111827; line-height: 1.42; }
body { margin: 0; }
.cover { height: 297mm; padding: 45mm 25mm; position: relative; page-break-after: always; }
.cover::before { content: ""; position: absolute; left: 22mm; top: 25mm; bottom: 38mm; width: 4mm; background: #1F4E8C; }
.cover .in { position: absolute; left: 40mm; top: 120mm; right: 25mm; }
.cover h1 { font-size: 30pt; color: #1F4E8C; margin: 0 0 8px; border: 0; }
.cover .sub { font-size: 14pt; color: #374151; margin-bottom: 26px; }
.cover p { margin: 3px 0; color: #374151; font-size: 9.5pt; }
.toc { page-break-after: always; }
.toc h1 { font-size: 20pt; color: #1F4E8C; border-bottom: 2px solid #1F4E8C; padding-bottom: 4px; }
.toc .l1 { font-weight: bold; margin-top: 7px; }
.toc .l2 { padding-left: 14px; font-size: 9pt; }
.toc div { display: flex; }
.toc .dots { flex: 1; border-bottom: 1px dotted #9ca3af; margin: 0 4px 3px; }
.chapter { page-break-before: always; }
h1 { font-size: 20pt; color: #1F4E8C; border-bottom: 2px solid #1F4E8C; padding-bottom: 5px; margin: 0 0 12px; }
h2 { font-size: 13.5pt; color: #1F4E8C; margin: 18px 0 6px; page-break-after: avoid; }
h3 { font-size: 11pt; color: #1F4E8C; margin: 14px 0 5px; page-break-after: avoid; }
h4 { font-size: 10pt; margin: 10px 0 4px; page-break-after: avoid; }
p { margin: 5px 0; text-align: left; }
ul, ol { margin: 4px 0 6px; padding-left: 22px; }
li { margin: 2px 0; }
code { font-family: 'JetBrains Mono', 'JetBrainsMono Nerd Font', 'DejaVu Sans Mono', monospace; font-size: 8.2pt; background: #f1f3f5; padding: 0 2px; border-radius: 2px; }
blockquote { margin: 8px 0; padding: 6px 10px; border-left: 3px solid #1F4E8C; background: #eef3fb; color: #1f2937; }
blockquote p { margin: 2px 0; text-align: left; }
table { border-collapse: collapse; width: 100%; margin: 8px 0 10px; font-size: 8.2pt; page-break-inside: auto; }
thead { display: table-header-group; }
th { background: #1F4E8C; color: #fff; text-align: left; padding: 4px 6px; border: 1px solid #1F4E8C; font-weight: bold; }
td { padding: 3.5px 6px; border: 1px solid #d1d5db; vertical-align: top; }
tr { page-break-inside: avoid; }
tbody tr:nth-child(even) td { background: #f9fafb; }
figure.fig { margin: 12px 0; page-break-inside: avoid; text-align: center; }
.figsvg { border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px; background: #fff; }
.figsvg svg { max-width: 100%; height: auto; }
figcaption { font-size: 8.5pt; color: #4b5563; margin-top: 4px; text-align: center; }
"""

def render(out: Path, version: str, pages: dict) -> Path:
    body = add_ids("\n".join(convert(n) for n in FILES))
    ents = toc_entries(body)
    toc = ['<section class="toc"><h1>Índice</h1>']
    for lvl, hid, title in ents:
        toc.append(f'<div class="l{lvl}"><span>{title}</span><span class="dots"></span><span>{pages.get(hid, "")}</span></div>')
    toc.append("</section>")
    cover = (
        '<section class="cover"><div class="in"><h1>garcom-NFC</h1>'
        '<div class="sub">Documentação Técnica Consolidada do Sistema</div>'
        "<p>Plataforma SaaS multi-restaurante para chamado de garçom e pedido de conta por QR Code / NFC</p>"
        f"<p>Versão consolidada {version} — baseada nas documentações v0.2, v0.3, módulos e guia de estudos, "
        "atualizada com o código-fonte do back-end e do front-end</p>"
        f"<p>Data: {date.today():%d/%m/%Y}</p></div></section>"
    )
    html = (
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
        f"<title>garcom-NFC Documentação Técnica</title><style>{css(version)}</style></head><body>"
        f'{cover}{"".join(toc)}{body}</body></html>'
    )
    page = out / "doc.html"
    page.write_text(html, encoding="utf-8")
    pdf = out / "doc.pdf"
    subprocess.run(
        ["chromium", "--headless=new", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer",
         f"--print-to-pdf={pdf}", f"file://{page}"],
        check=True, capture_output=True, timeout=300,
    )
    (out / "toc.json").write_text(json.dumps(ents, ensure_ascii=False), encoding="utf-8")
    return pdf


def find_pages(pdf: Path, out: Path) -> dict:
    """Página de cada título do índice (a busca começa na 4ª, depois da capa e do índice)."""
    ents = json.loads((out / "toc.json").read_text(encoding="utf-8"))
    info = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout
    total = int(re.search(r"Pages:\s+(\d+)", info).group(1))
    text = [
        re.sub(r"\s+", "", subprocess.run(["pdftotext", "-f", str(n), "-l", str(n), pdf, "-"], capture_output=True, text=True).stdout)
        for n in range(1, total + 1)
    ]
    pages, current = {}, 4
    for _lvl, hid, title in ents:
        key = re.sub(r"\s+", "", title)[:60]
        for n in range(current, total + 1):
            if key in text[n - 1]:
                pages[hid] = current = n
                break
        else:
            print("título não encontrado no PDF:", title)
    return pages


def main():
    ap = argparse.ArgumentParser(description="Gera o PDF da documentação técnica")
    ap.add_argument("--versao", default=VERSION)
    ap.add_argument("--saida", default=str(ROOT / "docs" / "Documentacao-Tecnica-garcom-NFC.pdf"))
    args = ap.parse_args()
    out = Path(tempfile.mkdtemp(prefix="gerar_pdf_"))
    pages = find_pages(render(out, args.versao, {}), out)
    pdf = render(out, args.versao, pages)
    if find_pages(pdf, out) != pages:
        print("aviso: os números de página do índice mudaram na 2ª passada; rode de novo")
    Path(args.saida).write_bytes(pdf.read_bytes())
    print(f"ok: {args.saida} ({len(pages)} títulos no índice)")


if __name__ == "__main__":
    main()
