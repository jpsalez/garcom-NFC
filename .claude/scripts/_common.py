"""Utilidades comuns. Somente leitura: estes scripts nunca alteram o código-fonte."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # raiz do projeto
BACK = ROOT / "back-end"
SRC = BACK / "src"
KNOW = ROOT / ".claude" / "knowledge" / "garcom-nfc"
IGNORE = {"node_modules", "generated", ".git", "dist"}


def ts_files(base: Path = SRC):
    for p in sorted(base.rglob("*.ts")):
        if not (set(p.parts) & IGNORE):
            yield p


def rel(p: Path) -> str:
    return str(p.relative_to(ROOT))


def blocked(p: Path) -> bool:
    """Arquivos que o painel nunca lê: segredos, chaves, node_modules, .git e o lockfile (enorme e sem valor)."""
    n = p.name.lower()
    if set(p.parts) & {"node_modules", ".git"}:
        return True
    if n.startswith(".env") and n not in (".env.example", ".env.test"):
        return True
    return n.endswith((".pem", ".key", ".p12")) or n.startswith("id_rsa") or n in ("package-lock.json", "pnpm-lock.yaml")


def safe(rel: str) -> Path:
    """Caminho absoluto de `rel` garantindo que fica dentro do projeto e não é bloqueado."""
    p = (ROOT / (rel or ".")).resolve()
    if ROOT != p and ROOT not in p.parents:
        raise PermissionError("fora do projeto")
    if blocked(p):
        raise PermissionError("arquivo bloqueado")
    return p
