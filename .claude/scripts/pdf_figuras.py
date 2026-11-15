# Gerador das figuras do PDF (SVG inline). Cada função devolve uma string <svg>.
from html import escape

BLUE = "#1F4E8C"
STY = {
    "main": ("#EAF1FB", "#2F6DB5"),   # componente implementado
    "ok": ("#E7F4EA", "#2E7D32"),     # concluído / banco
    "ext": ("#F3F4F6", "#6B7280"),    # externo / ator
    "warn": ("#FFF4D6", "#C58A00"),   # parcial / pendente
    "err": ("#FDECEC", "#C0392B"),    # erro
    "dev": ("#F3F4F6", "#6B7280"),    # só desenvolvimento (tracejado)
}


class Fig:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.parts = []

    def text(self, x, y, s, size=12, anchor="middle", weight="normal", fill="#1f2937", italic=False):
        lines = s.split("\n")
        y0 = y - (len(lines) - 1) * (size + 3) / 2
        out = []
        for i, ln in enumerate(lines):
            out.append(f'<tspan x="{x}" y="{y0 + i * (size + 3):.1f}">{escape(ln)}</tspan>')
        st = ' font-style="italic"' if italic else ""
        self.parts.append(
            f'<text text-anchor="{anchor}" font-size="{size}" font-weight="{weight}" fill="{fill}"{st} dominant-baseline="middle">{"".join(out)}</text>'
        )

    def box(self, x, y, w, h, s, kind="main", dashed=False, size=12, bold=False, r=8):
        fill, stroke = STY[kind]
        d = ' stroke-dasharray="5 4"' if (dashed or kind == "dev") else ""
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="1.3"{d}/>')
        self.text(x + w / 2, y + h / 2, s, size=size, weight="bold" if bold else "normal")

    def diamond(self, cx, cy, w, h, s, kind="warn", size=11):
        fill, stroke = STY[kind]
        pts = f"{cx},{cy - h / 2} {cx + w / 2},{cy} {cx},{cy + h / 2} {cx - w / 2},{cy}"
        self.parts.append(f'<polygon points="{pts}" fill="{fill}" stroke="{stroke}" stroke-width="1.3"/>')
        self.text(cx, cy, s, size=size)

    def arrow(self, pts, dashed=False, label=None, lpos=None, color="#374151", both=False):
        d = "M " + " L ".join(f"{x},{y}" for x, y in pts)
        da = ' stroke-dasharray="5 4"' if dashed else ""
        ms = ' marker-start="url(#ah)"' if both else ""
        self.parts.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.3"{da} marker-end="url(#ah)"{ms}/>')
        if label:
            lx, ly = lpos if lpos else ((pts[0][0] + pts[-1][0]) / 2 + 6, (pts[0][1] + pts[-1][1]) / 2 - 8)
            self.text(lx, ly, label, size=10.5, fill="#4b5563", anchor="middle")

    def line(self, x1, y1, x2, y2, dashed=False, color="#6B7280"):
        da = ' stroke-dasharray="4 4"' if dashed else ""
        self.parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="1.2"{da}/>')

    def area(self, x, y, w, h, title=None, dashed=True, color="#6B7280"):
        da = ' stroke-dasharray="6 4"' if dashed else ""
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="none" stroke="{color}" stroke-width="1.2"{da}/>')
        if title:
            self.text(x + 10, y + 12, title, size=10.5, anchor="start", fill="#4b5563")

    def svg(self):
        defs = (
            '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            '<path d="M0,0 L10,5 L0,10 z" fill="#374151"/></marker></defs>'
        )
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="100%" '
            f'font-family="Liberation Sans, Arial, sans-serif">{defs}{"".join(self.parts)}</svg>'
        )


def flow(steps, w=700, side_x=470, title=None):
    """Fluxo vertical. steps: dict(t, k='box'|'dec'|'end', kind, side=(label, texto, kind), yes=label)."""
    cx, bw = 230, 290
    y = 14
    f_parts = []
    items = []
    for s in steps:
        h = 44 if s.get("k", "box") == "box" else (62 if s["k"] == "dec" else 36)
        if "\n" in s["t"] and s.get("k", "box") == "box":
            h = 14 + 16 * (s["t"].count("\n") + 1) + 8
        items.append((s, y, h))
        y += h + 26
    H = y - 6
    f = Fig(w, H)
    prev = None
    for s, y0, h in items:
        k = s.get("k", "box")
        kind = s.get("kind", "main")
        if k == "box":
            f.box(cx - bw / 2, y0, bw, h, s["t"], kind)
            top, bot = y0, y0 + h
        elif k == "dec":
            f.diamond(cx, y0 + h / 2, bw, h, s["t"], "warn")
            top, bot = y0, y0 + h
        else:
            f.box(cx - bw / 2 + 40, y0, bw - 80, h, s["t"], kind, r=16)
            top, bot = y0, y0 + h
        if prev is not None:
            f.arrow([(cx, prev), (cx, top)], label=s.get("yes"), lpos=(cx + 28, (prev + top) / 2))
        prev = bot
        if "side" in s:
            lab, txt, sk = s["side"]
            sh = 40 + 16 * txt.count("\n")
            sy = y0 + h / 2 - sh / 2
            f.arrow([(cx + (bw / 2 if k != "dec" else bw / 2), y0 + h / 2), (side_x, y0 + h / 2)], label=lab, lpos=((cx + bw / 2 + side_x) / 2, y0 + h / 2 - 9), dashed=True)
            f.box(side_x, sy, w - side_x - 8, sh, txt, sk, size=11)
    return f.svg()


# ----------------------------------------------------------------------------------------- Capítulo 1
def fig_1_1():
    f = Fig(720, 430)
    f.area(190, 8, 520, 414, "Sistema garcom-NFC", dashed=False, color="#2F6DB5")
    actors = [
        (10, 40, "Cliente\n(sem login)"),
        (10, 140, "STAFF\n(balcão)"),
        (10, 235, "OWNER\n(dono)"),
        (10, 330, "SUPER_ADMIN\n(plataforma)"),
    ]
    for x, y, t in actors:
        f.box(x, y, 130, 52, t, "ext")
    cases = [
        (215, 34, "Abrir /m/[code] por QR ou NFC\n(scan: abre o atendimento)"),
        (215, 84, "Chamar garçom / pedir a conta"),
        (215, 134, "Ver chamados em tempo real\ne finalizar o chamado"),
        (215, 184, "Abrir, estender e encerrar atendimento"),
        (215, 234, "Gerir mesas e gerar o QR Code"),
        (215, 284, "Gerir a equipe (STAFF)"),
        (215, 334, "Gerir restaurantes e usuários"),
    ]
    for x, y, t in cases:
        f.box(x, y, 250, 38, t, "main", size=11)
    f.box(500, 150, 195, 54, "Sistema (job de 60 s)\nExpira atendimentos vencidos", "warn", size=11)
    f.box(500, 250, 195, 54, "Socket.IO\nAvisa o balcão após o commit", "ok", size=11)
    for yy in (53, 103):
        f.arrow([(140, 66), (215, yy)])
    f.arrow([(140, 166), (215, 153)])
    f.arrow([(140, 166), (215, 203)])
    f.arrow([(140, 261), (215, 253)])
    f.arrow([(140, 261), (215, 303)])
    f.arrow([(140, 261), (140, 195)], dashed=True, label="também faz\ntudo do STAFF", lpos=(75, 215))
    f.arrow([(140, 356), (215, 353)])
    f.arrow([(500, 177), (465, 203)], dashed=True)
    f.arrow([(497, 277), (465, 160)], dashed=True)
    f.text(360, 405, "Linhas tracejadas: efeitos do sistema; o cliente não usa tempo real (DEC-08).", size=10.5, fill="#4b5563")
    return f.svg()


def fig_1_2():
    f = Fig(720, 280)
    phases = [
        (10, "1 Fundação", "Express, Prisma, Docker\nRegister e login JWT\nMesas e QR Code\nEquipe (STAFF)\nFront: login, mesas, equipe", "ok", "Concluída"),
        (185, "2 Chamado", "Scan e token por aparelho\nChamados (WAITER, BILL)\nSocket.IO por restaurante\nFront: /m/[code] e balcão", "ok", "Concluída"),
        (360, "3 Encerramento", "Encerrar (revoga e cancela)\nEstender +4 h\nJob de expiração (60 s)\nLimite de chamados", "ok", "Concluída"),
        (535, "Depois do MVP", "Cardápio, comanda e KDS\nAvaliações, relatórios\nApp do garçom, setores\nIntegração com PDV", "ext", "Não iniciado"),
    ]
    for x, t, body, kind, st in phases:
        f.box(x, 14, 170, 34, t, kind, bold=True)
        f.box(x, 56, 170, 130, body, kind, size=11)
        f.box(x, 196, 170, 28, st, kind, size=11, bold=True)
    for x in (180, 355, 530):
        f.arrow([(x, 31), (x + 5, 31)])
    f.box(10, 236, 695, 34, "Pendências não bloqueantes: helmet, TRUST_PROXY no deploy, Dockerfile de produção, tela do SUPER_ADMIN, paginação, recuperação de senha", "warn", size=11)
    return f.svg()


# ----------------------------------------------------------------------------------------- Capítulo 3
def fig_3_1():
    f = Fig(720, 300)
    f.box(10, 20, 130, 50, "Celular do cliente\n(QR Code ou NFC)", "ext", size=11)
    f.box(10, 100, 130, 50, "Computador do\nbalcão", "ext", size=11)
    f.area(190, 8, 510, 260, "rede app-net (Docker Compose)", dashed=True)
    f.box(215, 60, 150, 70, "web\nNext.js\nporta 3000", "main")
    f.box(430, 60, 150, 70, "api\nExpress + TypeScript\nporta 4000", "main")
    f.box(430, 190, 150, 56, "db\nPostgreSQL 16\n(porta interna)", "ok")
    f.arrow([(140, 45), (215, 80)], label="HTTPS", lpos=(150, 30))
    f.arrow([(140, 125), (215, 112)])
    f.arrow([(365, 95), (430, 95)], label="REST /api/v1", lpos=(398, 82))
    f.arrow([(365, 112), (430, 112)], dashed=True, label="Socket.IO", lpos=(398, 128))
    f.arrow([(505, 130), (505, 190)], label="Prisma", lpos=(535, 160))
    f.text(360, 282, "Arquitetura planejada na v0.3; a implementada está na Figura 3.2.", size=10.5, fill="#4b5563")
    return f.svg()


def fig_3_2():
    f = Fig(720, 380)
    f.box(10, 20, 130, 50, "Navegadores\n(cliente e balcão)", "ext", size=11)
    f.area(170, 8, 540, 330, "Compose de desenvolvimento (docker compose up)", dashed=True)
    f.box(190, 50, 150, 70, "web (front-end)\nNext.js 16, React 19\nporta 3000", "main", size=11)
    f.area(375, 36, 320, 190, "api (back-end), porta 4000", dashed=False, color="#2F6DB5")
    f.box(390, 62, 140, 42, "Express 5\nrotas /api/v1", "main", size=11)
    f.box(545, 62, 135, 42, "Socket.IO\n(mesma porta)", "main", size=11)
    f.box(390, 122, 140, 42, "Services e\nrepositories", "main", size=11)
    f.box(545, 122, 135, 42, "Job de expiração\n(60 s)", "main", size=11)
    f.box(390, 178, 290, 36, "Prisma Client 6 (generated/prisma)", "main", size=11)
    f.box(430, 252, 210, 52, "db: PostgreSQL 16\n(+ db-test na porta 5433, perfil test)", "ok", size=11)
    f.box(190, 252, 150, 52, "painel de controle\n(só desenvolvimento)", "dev", size=11)
    f.arrow([(140, 40), (190, 80)], label="HTTPS", lpos=(158, 48))
    f.arrow([(140, 55), (390, 78)], dashed=True)
    f.arrow([(340, 85), (390, 85)], label="REST", lpos=(366, 72))
    f.arrow([(460, 104), (460, 122)])
    f.arrow([(460, 164), (460, 178)])
    f.arrow([(610, 104), (610, 122)], dashed=True)
    f.arrow([(535, 214), (535, 252)])
    f.text(360, 358, "Ainda não há Dockerfile nem compose de produção. O painel só lê o repositório.", size=10.5, fill="#4b5563")
    return f.svg()


def fig_3_3():
    f = Fig(720, 360)
    xs = [10, 140, 270, 400, 530]
    names = [("Rotas e\nmiddlewares", "main"), ("Controller", "main"), ("Service", "main"), ("Repository", "main"), ("Prisma\nPostgreSQL", "ok")]
    subs = [
        "limiters\nvalidate (Zod)\nensureAuthenticated\nensureRole\nensureTableToken",
        "lê a entrada\nchama o service\nescolhe o status\n(sem try/catch)",
        "regras de negócio\ntransações\nerros (AppError)\nNotifier após commit",
        "restaurantId\nprimeiro parâmetro\nsó lê e grava",
        "tabelas, índices\nparciais, CHECKs",
    ]
    for x, (n, k), s in zip(xs, names, subs):
        f.box(x, 20, 120, 52, n, k, bold=True)
        f.box(x, 84, 120, 96, s, "ext", size=10.5)
    for a, b in zip(xs, xs[1:]):
        f.arrow([(a + 120, 46), (b, 46)])
    f.box(270, 220, 120, 44, "Notifier\n(Socket.IO)", "warn", size=11)
    f.arrow([(330, 180), (330, 220)], dashed=True, label="após o commit", lpos=(395, 200))
    f.box(40, 290, 640, 48, "errorHandler (último middleware): AppError, Prisma P2002/P2003/P2025, JSON inválido e 413, erro inesperado\nResposta única: { error, code, message, details? }", "err", size=10.5)
    for x in (70, 200, 330, 460):
        f.arrow([(x, 72), (x, 290)] if x == 70 else [(x, 180), (x, 290)], dashed=True, color="#C0392B")
    return f.svg()


def fig_3_4():
    f = Fig(720, 360)
    f.box(260, 10, 200, 34, '"DbClient" (PrismaClient)', "ok", size=11)
    reps = ["RestaurantRepository", "UserRepository", "TableRepository", "TableSessionRepository", "SessionTokenRepository", "CallRepository"]
    for i, r in enumerate(reps):
        f.box(8 + i * 118, 90, 112, 40, r.replace("Repository", "\nRepository"), "main", size=10)
        f.arrow([(360, 44), (64 + i * 118, 90)], color="#9CA3AF")
    f.box(10, 175, 160, 34, '"AuthCache"', "main", size=11)
    f.box(185, 175, 160, 34, '"Notifier" (SocketNotifier)', "main", size=11)
    svcs = ["AuthService", "UsersService", "AdministrationService", "TablesService", "SessionsService", "CallsService"]
    for i, s in enumerate(svcs):
        f.box(8 + i * 118, 245, 112, 40, s.replace("Service", "\nService"), "main", size=10)
        f.arrow([(64 + i * 118, 130), (64 + i * 118, 245)], color="#9CA3AF")
    f.arrow([(90, 209), (50, 245)], dashed=True)
    f.arrow([(265, 209), (530, 245)], dashed=True)
    f.box(150, 312, 420, 34, "Controllers: resolvidos em routes.ts com container.resolve(Controller)", "ext", size=11)
    f.arrow([(360, 285), (360, 312)])
    f.text(560, 192, "tokens de texto: erro de\ndigitação só aparece\nem execução", size=10, fill="#4b5563")
    return f.svg()


def fig_3_5():
    f = Fig(720, 340)
    f.box(15, 10, 690, 34, "shared: container, erros, middlewares, utils, realtime (Notifier), jobs e Prisma — usado por todos os módulos", "ok", size=11)
    mods = [("auth", 15, "usa repos de\nusers e restaurants"), ("users", 150, "usa repo de users\ne restaurants"),
            ("restaurants", 285, "só repository\ne slug"), ("administration", 420, "repo de restaurants\n+ SessionsService"),
            ("tables", 565, "repo de tables\n+ SessionsService")]
    for n, x, note in mods:
        f.box(x, 80, 125, 40, n, "main", bold=True)
        f.text(x + 62, 140, note, size=10, fill="#4b5563")
    f.box(300, 215, 125, 40, "calls", "main", bold=True)
    f.box(470, 215, 125, 40, "sessions", "main", bold=True)
    f.arrow([(425, 235), (470, 235)], both=True)
    f.text(447, 206, "repos (tx)", size=10, fill="#4b5563")
    f.arrow([(482, 120), (520, 215)], label="SessionsService", lpos=(440, 175))
    f.arrow([(628, 120), (580, 215)], label="SessionsService", lpos=(660, 175))
    f.text(150, 235, "calls: findOpen, create, markDone\nsessions: scan, open, close, extend,\nexpireDue (usa o repo de calls\nno encerramento)", size=10, fill="#4b5563")
    f.box(15, 285, 690, 40, "Regra: um service usa repositories de outros módulos, nunca services — exceção deliberada: tables e administration\nusam o SessionsService para encerrar atendimentos ao desativar mesa ou restaurante", "warn", size=10.5)
    return f.svg()


# ----------------------------------------------------------------------------------------- Capítulo 4
def fig_4_1():
    f = Fig(720, 580)

    def table(x, y, w, name, rows, kind="main"):
        hh = 26 + 15 * len(rows)
        f.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{hh}" rx="6" fill="#fff" stroke="#2F6DB5" stroke-width="1.3"/>')
        f.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="22" rx="6" fill="#1F4E8C"/>')
        f.text(x + w / 2, y + 11, name, size=11.5, weight="bold", fill="#fff")
        for i, r in enumerate(rows):
            f.text(x + 8, y + 33 + 15 * i, r, size=10, anchor="start")
        return hh

    table(10, 36, 170, "restaurants", ["id (PK)", "name", "slug (único)", "active", "created_at"])
    table(270, 36, 190, "users", ["id (PK)", "restaurant_id (FK, nulo só", "  para SUPER_ADMIN)", "name, email (único)", "password_hash", "role: SUPER_ADMIN/OWNER/STAFF", "category (só STAFF), active"])
    table(540, 36, 170, "tables", ["id (PK)", "restaurant_id (FK)", "label", "public_code (único, 12)", "active"])
    table(10, 236, 200, "table_sessions", ["id (PK)", "restaurant_id (FK)", "table_id (FK)", "status: ACTIVE/CLOSED", "keep_open, expires_at", "created_at, closed_at", "closed_reason: STAFF/TIMEOUT", "closed_by (FK users, opcional)"])
    table(290, 306, 190, "session_tokens", ["id (PK)", "session_id (FK)", "token_hash (único, SHA-256)", "revoked_at"])
    table(520, 236, 190, "calls", ["id (PK)", "restaurant_id, session_id (FK)", "token_id (FK)", "type: WAITER/BILL", "status: OPEN/DONE/CANCELLED", "created_at, done_at", "done_by (FK users, opcional)"])
    f.arrow([(180, 66), (270, 66)], label="1:N", lpos=(225, 56))
    f.arrow([(95, 36), (95, 18), (625, 18), (625, 36)], label="1:N", lpos=(360, 9))
    f.arrow([(95, 137), (95, 236)], label="1:N (sessões, chamados)", lpos=(190, 187))
    f.arrow([(600, 137), (600, 196), (110, 196), (110, 236)], label="1:N (no máx. 1 ACTIVE por mesa)", lpos=(490, 186))
    f.arrow([(210, 326), (290, 326)], label="1:N", lpos=(250, 316))
    f.arrow([(210, 270), (520, 270)], label="1:N", lpos=(365, 260))
    f.arrow([(480, 346), (500, 346), (500, 330), (520, 330)], label="1:N", lpos=(500, 360))
    f.arrow([(330, 167), (330, 215), (160, 215), (160, 236)], dashed=True)
    f.arrow([(420, 167), (420, 220), (570, 220), (570, 236)], dashed=True)
    f.area(10, 408, 700, 128, "Autenticação: as duas tabelas pertencem a users (user_id, exclusão em cascata) e não têm restaurant_id")
    table(30, 428, 300, "refresh_tokens", ["id (PK), user_id (FK)", "token_hash (único, SHA-256)", "expires_at (30 dias), revoked_at", "troca a cada uso; reuso revoga todos"])
    table(390, 428, 300, "password_resets", ["id (PK), user_id (FK)", "token_hash (único, SHA-256)", "expires_at (1 hora), used_at", "link de uso único enviado por e-mail"])
    f.text(360, 556, "Tracejadas: referências opcionais a users (closed_by e done_by viram nulos ao excluir o usuário).\nÍndices parciais: table_sessions_one_active e calls_one_open_per_type (migrations escritas à mão).", size=10.5, fill="#4b5563")
    return f.svg()


# ----------------------------------------------------------------------------------------- Capítulo 5
def fig_5_1():
    return flow([
        {"t": "POST /auth/register\n(name, email, password, restaurantName)", "kind": "ext"},
        {"t": "registerLimiter (5/h por IP)", "side": ("excedeu", "429", "err")},
        {"t": "validateSchema(createUserSchema)", "side": ("inválido", "400 VALIDATION_ERROR", "err")},
        {"t": "e-mail já existe?", "k": "dec", "side": ("sim", "409 genérico\n\"Não foi possível concluir o cadastro\"", "err")},
        {"t": "slug = slugify(nome)\n(sufixo aleatório se já existe)\nhash scrypt da senha"},
        {"t": "runInTransaction:\ncria restaurante + usuário OWNER", "kind": "ok", "side": ("falha", "nada é gravado", "err")},
        {"t": "201 { user, restaurant }", "k": "end", "kind": "ok"},
    ])


def fig_5_2():
    return flow([
        {"t": "POST /auth/login (email, password)", "kind": "ext"},
        {"t": "loginIpLimiter (30/15 min por IP)\nloginLimiter (10/15 min por IP+e-mail)", "side": ("excedeu", "429", "err")},
        {"t": "validateSchema(loginUserSchema)", "side": ("inválido", "400", "err")},
        {"t": "findByEmail\ncomparePassword (hash falso se não existe)"},
        {"t": "usuário existe, senha correta,\nusuário e restaurante ativos?", "k": "dec", "side": ("não", "401 \"E-mail ou senha inválidos\"\n(mesma mensagem)", "err")},
        {"t": "signToken { sub, restaurantId, role } HS256, 15 min\n+ refresh token (30 dias, só o hash no banco)"},
        {"t": "200 { token, refreshToken, user }", "k": "end", "kind": "ok"},
    ])


def fig_5_3():
    return flow([
        {"t": "Requisição com cabeçalho Authorization", "kind": "ext"},
        {"t": "cabeçalho presente?", "k": "dec", "side": ("não", "401 \"Token não informado\"", "err")},
        {"t": "esquema \"Bearer\" e token?", "k": "dec", "side": ("não", "401 \"Token mal formatado\"", "err")},
        {"t": "verifyToken (assinatura e validade)", "side": ("falhou", "401 \"Token inválido ou expirado\"", "err")},
        {"t": "AuthCache.get(sub)\nmiss: findForAuth no banco"},
        {"t": "usuário existe, ativo e\nrestaurante ativo?", "k": "dec", "side": ("não", "401 \"Token inválido ou expirado\"", "err")},
        {"t": "req.user = { id, restaurantId, role }\n(vindo do banco)", "kind": "ok"},
        {"t": "next() → ensureRole → handler", "k": "end", "kind": "ok"},
    ])


def fig_5_4():
    return flow([
        {"t": "Erro lançado em middleware,\ncontroller ou service", "kind": "ext"},
        {"t": "é AppError?", "k": "dec", "side": ("sim", "status + { error, code,\nmessage, details? }", "ok")},
        {"t": "erro conhecido do Prisma?", "k": "dec", "side": ("P2002, P2003", "409 ConflictError\n(P2025: 404 NotFound)", "ok")},
        {"t": "erro do leitor de corpo?", "k": "dec", "side": ("sim", "400 JSON inválido\n413 PAYLOAD_TOO_LARGE", "ok")},
        {"t": "registra no log (Prisma: só nome e código)", "kind": "warn"},
        {"t": "500 INTERNAL_ERROR\n\"Erro interno do servidor\"", "k": "end", "kind": "err"},
    ])


# ----------------------------------------------------------------------------------------- Capítulo 7
def fig_7_1():
    f = Fig(720, 470)
    lanes = [("Cliente\n(front /m/[code])", 70), ("API\n(Express)", 260), ("Socket.IO\n(sala restaurant:id)", 450), ("Balcão\n(/admin/waiter)", 640)]
    for n, x in lanes:
        f.box(x - 62, 8, 124, 40, n, "ext", size=11)
        f.line(x, 48, x, 450, dashed=True)

    def msg(y, a, b, text, dashed=False):
        xa, xb = lanes[a][1], lanes[b][1]
        f.arrow([(xa, y), (xb, y)], label=text, lpos=((xa + xb) / 2, y - 10), dashed=dashed)

    msg(75, 0, 1, "POST /public/tables/:code/scan")
    msg(100, 1, 0, "200 { token, expires_at }", True)
    msg(135, 0, 1, "POST /public/calls (X-Table-Token)")
    f.box(190, 152, 140, 28, "valida token, trava sessão", "main", size=10)
    f.box(190, 188, 140, 28, "cria call OPEN (commit)", "main", size=10)
    msg(238, 1, 0, "201 { id, type, status }", True)
    msg(268, 1, 2, "call:created (após o commit)")
    msg(292, 2, 3, "call:created")
    f.box(580, 306, 120, 28, "card aparece", "ok", size=10)
    msg(354, 3, 1, "PATCH /calls/:id/done")
    f.box(190, 366, 140, 28, "markDone condicional", "main", size=10)
    msg(412, 1, 2, "call:done")
    msg(436, 2, 3, "call:done (card some)")
    return f.svg()


def fig_7_2():
    return flow([
        {"t": "Cliente abre /m/[code]", "kind": "ext"},
        {"t": "token do aparelho guardado\ne ainda válido (expires_at)?", "k": "dec", "side": ("sim", "usa o token guardado\n(sem scan)", "ok")},
        {"t": "POST /public/tables/:code/scan", "side": ("código inválido,\nmesa inativa, restaurante\ndesativado", "404 \"Mesa não encontrada\"", "err")},
        {"t": "a mesa tem atendimento ACTIVE\ne dentro do prazo?", "k": "dec", "side": ("sim", "reaproveita o atendimento", "ok")},
        {"t": "abre atendimento (4 h) e emite session:opened\ncorrida: índice parcial barra o 2º e usa o vencedor"},
        {"t": "gera token (32 bytes), grava só o SHA-256", "kind": "ok"},
        {"t": "200 { token, expires_at, table, restaurant }", "k": "end", "kind": "ok"},
    ])


def fig_7_3():
    return flow([
        {"t": "A cada 60 s: startSessionExpiryJob", "kind": "ext"},
        {"t": "SessionsService.expireDue()\nfindExpired: ACTIVE, keep_open falso,\nexpires_at <= agora (todos os restaurantes)"},
        {"t": "para cada atendimento vencido (um por vez)", "k": "dec", "side": ("falha em um", "registra o id e a mensagem;\nos demais continuam", "warn")},
        {"t": "transação: closeIfActive (TIMEOUT)\nrevoga tokens, cancela chamados OPEN", "kind": "ok", "side": ("count = 0", "outro pedido já encerrou:\nnenhum evento", "ext")},
        {"t": "após o commit: session:closed { id, reason: TIMEOUT }", "kind": "main"},
        {"t": "devolve a quantidade encerrada", "k": "end", "kind": "ok"},
    ])


def fig_7_4():
    f = Fig(720, 260)
    f.box(150, 100, 170, 60, "ACTIVE", "ok", bold=True, size=14)
    f.box(520, 100, 170, 60, "CLOSED", "ext", bold=True, size=14)
    f.arrow([(20, 130), (150, 130)])
    f.text(85, 100, "primeiro scan ou\nabertura pelo balcão", size=10.5, fill="#4b5563")
    f.arrow([(320, 130), (520, 130)])
    f.text(420, 100, "encerrar · expirar (TIMEOUT)\ndesativar mesa ou restaurante", size=10.5, fill="#4b5563")
    f.arrow([(200, 100), (200, 55), (270, 55), (270, 100)])
    f.text(285, 55, "estender +4 h (session:extended)", size=10.5, fill="#4b5563", anchor="start")
    f.text(360, 225, "No máximo um ACTIVE por mesa (índice parcial). CLOSED revoga os tokens e cancela os chamados OPEN.\nUm novo scan cria outro atendimento (linha nova); reativar a mesa não reabre.", size=10.5, fill="#4b5563")
    return f.svg()


def fig_7_5():
    f = Fig(720, 270)
    f.box(150, 105, 150, 60, "OPEN", "warn", bold=True, size=14)
    f.box(520, 20, 170, 56, "DONE", "ok", bold=True, size=14)
    f.box(520, 175, 170, 56, "CANCELLED", "ext", bold=True, size=14)
    f.arrow([(20, 135), (150, 135)])
    f.text(85, 105, "cliente chama\n(201)", size=10.5, fill="#4b5563")
    f.arrow([(300, 120), (520, 52)])
    f.text(450, 120, "PATCH /calls/:id/done\n(done_at e done_by)", size=10.5, fill="#4b5563")
    f.arrow([(300, 150), (520, 203)])
    f.text(405, 232, "encerramento ou expiração do atendimento", size=10.5, fill="#4b5563")
    f.arrow([(200, 105), (200, 60), (250, 60), (250, 105)])
    f.text(265, 60, "repetir devolve o aberto (200)", size=10.5, fill="#4b5563", anchor="start")
    f.text(360, 258, "ACCEPTED e EXPIRED existiram só na v0.2. Um OPEN por tipo e por atendimento (índice parcial).", size=10.5, fill="#4b5563")
    return f.svg()


def fig_7_6():
    return flow([
        {"t": "Requisição", "kind": "ext"},
        {"t": "limiters (login, cadastro, scan, chamados)", "side": ("excedeu", "429 TOO_MANY_REQUESTS", "err")},
        {"t": "validate: corpo, query, UUID dos parâmetros", "side": ("inválido", "400 VALIDATION_ERROR", "err")},
        {"t": "autenticação e papel / token do aparelho", "side": ("falhou", "401 (token) · 403 (papel)", "err")},
        {"t": "service: regras, tenant, transações", "side": ("regra violada", "404 · 409 (SESSION_CLOSED,\nCALL_NOT_OPEN, TABLE_INACTIVE...)", "err")},
        {"t": "resposta de sucesso (200, 201, 204)", "k": "end", "kind": "ok"},
    ])


# ----------------------------------------------------------------------------------------- Capítulo 6
def fig_6_1():
    f = Fig(720, 280)
    cols = [
        (10, "RestaurantRepository", ["create", "findAll", "findById", "findBySlug", "update"], "sem filtro: a entidade é o tenant"),
        (245, "UserRepository", ["create", "findByEmail (sem tenant)", "findForAuth (sem tenant)", "findById(restaurantId, id)", "findMany(restaurantId)", "update, delete"], None),
        (480, "TableRepository", ["create", "findById(restaurantId, id)", "findByPublicCode (sem tenant)", "findMany(restaurantId)", "hasSessions(restaurantId, id)", "update, delete"], None),
    ]
    for x, n, ms, note in cols:
        f.box(x, 10, 225, 30, n, "main", bold=True)
        h = 18 * len(ms) + 14
        f.parts.append(f'<rect x="{x}" y="46" width="225" height="{h}" rx="6" fill="#fff" stroke="#9CA3AF"/>')
        for i, m in enumerate(ms):
            w = "bold" if "sem tenant" in m or "sem filtro" in m else "normal"
            f.text(x + 10, 62 + 18 * i, m, size=10.5, anchor="start", weight=w)
    f.text(360, 262, "Em negrito, as exceções ao filtro por restaurante. Todo método de dados de restaurante recebe restaurantId primeiro.", size=10.5, fill="#4b5563")
    return f.svg()


def fig_6_2():
    f = Fig(720, 300)
    cols = [
        (10, "TableSessionRepository", ["create", "findById(restaurantId, id)", "findActiveByTable(restaurantId, tableId)", "findMany(restaurantId, status)", "findExpired(now) (sem tenant)", "update", "closeIfActive (condicional)", "lockActive (FOR SHARE)"]),
        (255, "SessionTokenRepository", ["create(sessão, hash)", "findByHash (tenant pela sessão)", "revokeAllBySession(sessão, agora)"]),
        (500, "CallRepository", ["create", "findById(restaurantId, id)", "findOpen(restaurantId, sessão, tipo)", "findMany(restaurantId, status, since)", "markDone (condicional)", "cancelOpenBySession(sessão)"]),
    ]
    for x, n, ms in cols:
        f.box(x, 10, 210, 30, n, "main", bold=True, size=11)
        h = 18 * len(ms) + 14
        f.parts.append(f'<rect x="{x}" y="46" width="210" height="{h}" rx="6" fill="#fff" stroke="#9CA3AF"/>')
        for i, m in enumerate(ms):
            w = "bold" if "sem tenant" in m else "normal"
            f.text(x + 8, 62 + 18 * i, m, size=10, anchor="start", weight=w)
    f.text(360, 282, "Os três participam da transação de encerramento (new Repository(tx)): sessão CLOSED, tokens revogados, chamados cancelados.", size=10.5, fill="#4b5563")
    return f.svg()


FIGS = {
    "1.1": fig_1_1, "1.2": fig_1_2, "3.1": fig_3_1, "3.2": fig_3_2, "3.3": fig_3_3, "3.4": fig_3_4, "3.5": fig_3_5,
    "4.1": fig_4_1, "5.1": fig_5_1, "5.2": fig_5_2, "5.3": fig_5_3, "5.4": fig_5_4,
    "6.1": fig_6_1, "6.2": fig_6_2,
    "7.1": fig_7_1, "7.2": fig_7_2, "7.3": fig_7_3, "7.4": fig_7_4, "7.5": fig_7_5, "7.6": fig_7_6,
}
