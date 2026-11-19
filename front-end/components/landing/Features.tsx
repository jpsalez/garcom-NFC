'use client';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { gsap, useGSAP, useReducedMotion, Split } from './motion';
import { Icon, Logo, type IconName } from './Icons';

type Tile = { icon: IconName; label: string; title: string; text: string; caps: string[]; size?: 'wide' | 'full'; mock: React.ReactNode };

const TILES: Tile[] = [
  {
    icon: 'nfc', label: 'Chamados', size: 'wide',
    title: 'Chamado por NFC, sem aplicativo',
    text: 'O cliente encosta o celular na plaquinha e escolhe o que precisa. O chamado chega ao painel com mesa, tipo e horário.',
    caps: ['Chamar garçom, pedir a conta ou abrir o cardápio', 'QR Code na plaquinha para celulares sem NFC', 'Fluxo pendente, atendido e finalizado'],
    mock: <Window tab="Chamados"><LiveCalls /></Window>,
  },
  {
    icon: 'team', label: 'Equipe',
    title: 'Gestão da equipe',
    text: 'Cadastre quem trabalha no salão e acompanhe quem atendeu cada chamado.',
    caps: ['Funções: gerente, garçom e limpeza', 'Ativar e desativar acessos', 'Histórico de atendimento por garçom'],
    mock: <Window tab="Equipe"><Team /></Window>,
  },
  {
    icon: 'tag', label: 'Plaquinhas',
    title: 'Plaquinhas com a sua marca',
    text: 'Layout criado com o designer do Psiu, sem custo extra.',
    caps: ['Logo, cores e número de cada mesa', 'NFC e QR Code na mesma plaquinha', 'Pacotes com desconto para assinantes'],
    mock: (
      <div className="aw aw-plq">
        {[0, 1, 2].map((i) => <Image key={i} src="/landing/plaquinha.webp" alt="" width={900} height={1191} sizes="15vw" />)}
      </div>
    ),
  },
  {
    icon: 'menu', label: 'Cardápio',
    title: 'Cardápio digital',
    text: 'O cardápio abre no celular do cliente, direto da plaquinha.',
    caps: ['Categorias, fotos e descrições', 'Cores e logo do restaurante', 'Itens esgotados ocultos na hora'],
    mock: <MenuMock />,
  },
  {
    icon: 'pdv', label: 'PDV',
    title: 'PDV integrado',
    text: 'Pedidos e fechamento de conta no mesmo sistema dos chamados.',
    caps: ['Comanda por mesa', '"Pedir conta" já abre o fechamento', 'Divisão da conta e formas de pagamento'],
    mock: <Window tab="PDV"><Pdv /></Window>,
  },
  {
    icon: 'chart', label: 'Métricas', size: 'full',
    title: 'Métricas e balanços',
    text: 'Um dashboard com os números que importam para o seu restaurante, do dia ao mês.',
    caps: ['Faturamento e ticket médio', 'Tempo médio de atendimento por garçom', 'Balanço por período e exportação'],
    mock: <Window tab="Métricas"><Metrics /></Window>,
  },
];

export default function Features() {
  const root = useRef<HTMLElement>(null);
  const motionReduced = useReducedMotion();

  useGSAP(
    () => {
      if (motionReduced) {
        gsap.set('.chart .line', { strokeDashoffset: 0 });
        return;
      }
      gsap.utils.toArray<HTMLElement>('.tile').forEach((tile) => {
        gsap.from(tile, {
          opacity: 0, y: 24, duration: 0.75, ease: 'sine.out',
          scrollTrigger: { trigger: tile, start: 'top 92%', end: 'bottom top', toggleActions: 'play reverse play reverse' },
        });
      });
      gsap.timeline({ scrollTrigger: { trigger: '.chart', start: 'top 85%' } })
        .to('.chart .line', { strokeDashoffset: 0, duration: 2, ease: 'power2.inOut' })
        .from('.chart-end', { scale: 0, opacity: 0, duration: 0.5, ease: 'back.out(2)' }, '-=0.2');
      gsap.from('.aw-plq img', { y: 80, opacity: 0, stagger: 0.12, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '.aw-plq', start: 'top 90%' } });
    },
    { scope: root, dependencies: [motionReduced], revertOnUpdate: true },
  );

  // Brilho que segue o mouse no card
  const glow = (e: React.PointerEvent<HTMLElement>) => {
    if (motionReduced || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };

  return (
    <section className="features" id="funcionalidades" ref={root}>
      <div className="sec-head">
        <p className="kicker">02 — Funcionalidades</p>
        <Split text={'Do chamado ao\nfechamento do caixa.'} />
      </div>
      <div className="bento">
        {TILES.map((t) => (
          <article key={t.label} className={`tile ${t.size ?? ''}`} onPointerMove={glow}>
            <div className="t-body">
              <div className="t-head">
                <span className="t-ico"><Icon name={t.icon} /></span>
                <span className="t-label">{t.label}</span>
                <span className="tag">Disponível</span>
              </div>
              <h3>{t.title}</h3>
              <p>{t.text}</p>
              <ul className="caps">
                {t.caps.map((c) => <li key={c}><Icon name="check" />{c}</li>)}
              </ul>
            </div>
            {t.mock}
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------- Telas do painel (tema escuro) ---------- */

function Window({ tab, children }: { tab: string; children: React.ReactNode }) {
  return (
    <div className="aw">
      <div className="aw-bar"><Logo /><span className="aw-brand">Psiu</span><span className="aw-tab">{tab}</span><span className="aw-user" role="img" aria-label="Usuário"><Icon name="user" /></span></div>
      <div className="aw-in">{children}</div>
    </div>
  );
}

type Call = { id: number; table: string; bill: boolean; age: number; by?: string };
const FIRST: Call[] = [
  { id: 1, table: '03', bill: true, age: 1 },
  { id: 2, table: '07', bill: false, age: 2 },
  { id: 3, table: '12', bill: false, age: 4, by: 'Ana' },
  { id: 4, table: '05', bill: true, age: 6, by: 'João' },
  { id: 5, table: '08', bill: false, age: 9, by: 'Ana' },
];
const TABLES = ['01', '02', '04', '06', '09', '10', '11', '14', '15'];

/** Chamados chegando sozinhos enquanto o card está na tela. */
function LiveCalls() {
  const motionReduced = useReducedMotion();
  const [calls, setCalls] = useState(FIRST);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (motionReduced) return;
    let n = 0, timer = 0, visible = false;
    const tick = () => {
      const k = n++;
      setCalls((list) => {
        const next = list.map((c) => ({ ...c, age: c.age + 1 }));
        const pending = next.filter((c) => !c.by);
        if (pending.length >= 2) pending[pending.length - 1].by = k % 2 ? 'João' : 'Ana';
        return [{ id: Date.now(), table: TABLES[k % TABLES.length], bill: k % 2 === 1, age: 0 }, ...next].slice(0, 6);
      });
    };
    const update = () => {
      clearInterval(timer);
      if (visible && !document.hidden) timer = window.setInterval(tick, 3400);
    };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; update(); });
    io.observe(ref.current!);
    document.addEventListener('visibilitychange', update);
    return () => { io.disconnect(); clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [motionReduced]);

  return (
    <>
      <div className="aw-h"><b>Chamados pendentes</b><span className="cnt">{calls.filter((c) => !c.by).length}</span></div>
      <div className="calls" ref={ref}>
        {calls.map((c) => (
          <div key={c.id} className={`call${c.by ? ' ok' : ''}`}>
            <span className="chip">{c.table}</span>
            <div>
              <b>Mesa {Number(c.table)}</b>
              <span className="pill"><Icon name={c.bill ? 'bill' : 'bell'} />{c.bill ? 'Pedir conta' : 'Chamar garçom'}</span>
              <small>{c.age ? `há ${c.age} min` : 'agora'}</small>
            </div>
            {c.by
              ? <span className="aw-done"><Icon name="check" />{c.by}</span>
              : <span className="aw-btn"><i />Atendido</span>}
          </div>
        ))}
      </div>
    </>
  );
}

function Team() {
  const people = [
    ['João Silva', 'joao', 'Gerente', true],
    ['Ana Souza', 'ana', 'Garçom', true],
    ['Felipe Dias', 'felipe', 'Limpeza', false],
  ] as const;
  return (
    <>
      <div className="aw-search"><Icon name="search" />Buscar funcionário</div>
      {people.map(([name, mail, role, on]) => (
        <div key={name} className={`mr${on ? '' : ' off'}`}>
          <i aria-hidden="true"><Icon name="user" /></i>
          <div><b>{name}</b><small>{mail}@restaurante.com</small></div>
          <span className="role">{role}</span>
          <span className={`sts${on ? ' on' : ''}`}>{on ? 'Ativo' : 'Inativo'}</span>
        </div>
      ))}
    </>
  );
}

function MenuMock() {
  const dishes = [
    ['moqueca', 'Moqueca de peixe', 'Para duas pessoas', 'R$ 112,00'],
    ['picanha', 'Picanha na chapa', 'Arroz, farofa e vinagrete', 'R$ 89,90'],
  ];
  return (
    <div className="aw aw-menu">
      <div className="mn-top"><span className="mn-logo"><Logo /></span><div><b>Restaurante Exemplo</b><small>Mesa 07</small></div></div>
      <div className="mn-cats"><span className="on">Pratos</span><span>Bebidas</span><span>Sobremesas</span></div>
      {dishes.map(([img, name, desc, price]) => (
        <div key={img} className="mi">
          <Image src={`/landing/${img}.jpg`} alt={name} width={104} height={104} />
          <div><b>{name}</b><small>{desc}</small><em>{price}</em></div>
          <span className="add">+</span>
        </div>
      ))}
    </div>
  );
}

function Pdv() {
  return (
    <>
      <div className="aw-h"><span className="chip">07</span><b>Comanda · Mesa 07</b><span className="sts on">Aberta</span></div>
      <div className="li"><span>1× Moqueca de peixe</span><span>R$ 112,00</span></div>
      <div className="li"><span>2× Caipirinha</span><span>R$ 36,00</span></div>
      <div className="li tot"><span>Total</span><span>R$ 148,00</span></div>
      <div className="pay"><span className="on">Pix</span><span>Cartão</span><span>Dinheiro</span></div>
      <span className="aw-cta">Fechar conta</span>
    </>
  );
}

function Metrics() {
  const curve = 'M0 120 C40 110 60 80 100 86 S160 60 200 64 S260 30 300 40 S360 18 400 22';
  return (
    <>
      <div className="kpis">
        <div><small>Faturamento</small><b>R$ 48.320</b><span className="up">+12%</span></div>
        <div><small>Ticket médio</small><b>R$ 87,40</b><span className="up">+4%</span></div>
        <div><small>Tempo de atendimento</small><b>6 min</b><span className="up">−1 min</span></div>
      </div>
      <div className="chart">
        <svg viewBox="0 0 400 140" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="psiu-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#8dbf21" stopOpacity=".22" />
              <stop offset="1" stopColor="#8dbf21" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="grid" d="M0 35H400M0 70H400M0 105H400" />
          <path d={`${curve} L400 140 L0 140Z`} fill="url(#psiu-area)" stroke="none" />
          <path className="line" d={curve} />
        </svg>
        <span className="chart-end" aria-hidden="true"><b>R$ 9.840</b></span>
        <div className="axis">{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => <span key={d}>{d}</span>)}</div>
      </div>
      <p className="mock-note">Dados ilustrativos</p>
    </>
  );
}
