'use client';
import { useEffect, useRef, useState } from 'react';
import { ScrollTrigger } from './motion';
import { Logo } from './Icons';
import { LINKS, NAV } from './content';

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  const [active, setActive] = useState('');
  const menu = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  // Fundo sólido depois do topo e link da seção atual destacado
  useEffect(() => {
    const triggers = [
      ScrollTrigger.create({ start: 80, end: 'max', onToggle: (s) => setSolid(s.isActive) }),
      ...NAV.map(({ href }) =>
        ScrollTrigger.create({
          trigger: href,
          start: 'top 50%',
          end: 'bottom 50%',
          onToggle: (s) => setActive((cur) => (s.isActive ? href : cur === href ? '' : cur)),
        }),
      ),
    ];
    return () => triggers.forEach((t) => t.kill());
  }, []);

  // Menu em tela cheia trava a rolagem e fecha com Esc
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = menu.current;
    panel?.querySelector<HTMLAnchorElement>('a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); toggle.current?.focus(); }
      if (e.key === 'Tab') {
        const controls = [toggle.current, ...Array.from(panel?.querySelectorAll<HTMLAnchorElement>('a') ?? [])].filter(Boolean) as HTMLElement[];
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    const onResize = () => { if (innerWidth > 1100) setOpen(false); };
    addEventListener('keydown', onKey);
    addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = previous;
      removeEventListener('keydown', onKey);
      removeEventListener('resize', onResize);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <header className={`nav${solid ? ' solid' : ''}`}>
        <a href="#hero" className="brand" aria-label="Psiu, início" onClick={close}>
          <Logo />
          <span>Psiu</span>
        </a>
        <nav className="nav-links" aria-label="Seções">
          {NAV.map(({ href, label }) => (
            <a key={href} href={href} className={active === href ? 'active' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <div className="nav-cta">
          <a href={LINKS.login} className="btn-ghost">Entrar</a>
          <a href="#planos" className="btn btn-solid sm">Assinar</a>
          <button
            ref={toggle}
            className="menu-btn"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
            aria-controls="psiu-menu"
            onClick={() => setOpen(!open)}
          >
            <i />
            <i />
          </button>
        </div>
      </header>

      {open && (
        <div className="m-menu" id="psiu-menu" ref={menu} onClick={(e) => (e.target as HTMLElement).closest('a') && close()}>
          <nav aria-label="Menu">
            {NAV.map(({ href, label }) => (
              <a key={href} href={href}>{label}</a>
            ))}
          </nav>
          <div className="m-menu-cta">
            <a href={LINKS.login} className="btn btn-line full">Entrar</a>
            <a href="#planos" className="btn btn-solid full">Assinar</a>
          </div>
        </div>
      )}
    </>
  );
}
