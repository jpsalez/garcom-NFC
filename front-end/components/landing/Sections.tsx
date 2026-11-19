'use client';
import { useRef, useState } from 'react';
import Image from 'next/image';
import { gsap, ScrollTrigger, useGSAP, useReducedMotion, Split } from './motion';
import { WhatsApp } from './Icons';
import { FAQ, LINKS, MANIFESTO, PACKS, PLANS } from './content';

/** Palavras acendem conforme a rolagem, também no caminho de volta. */
export function Manifesto() {
  const root = useRef<HTMLElement>(null);
  const motionReduced = useReducedMotion();
  useGSAP(
    () => {
      if (motionReduced) return;
      gsap.to('.manifesto-text span', {
        opacity: 1, stagger: 0.08, ease: 'none',
        scrollTrigger: { trigger: '.manifesto-text', start: 'top 75%', end: 'bottom 55%', scrub: true },
      });
    },
    { scope: root, dependencies: [motionReduced], revertOnUpdate: true },
  );
  return (
    <section className="manifesto" id="produto" ref={root}>
      <p className="kicker">01 — O produto</p>
      <p className="manifesto-text">
        {MANIFESTO.split(' ').map((w, i) => <span key={i}>{w} </span>)}
      </p>
    </section>
  );
}

export function Plaquinhas() {
  const root = useRef<HTMLElement>(null);
  const motionReduced = useReducedMotion();
  useGSAP(
    () => {
      if (motionReduced) return;
      gsap.from('.pq', { y: 48, opacity: 0, stagger: 0.1, duration: 0.85, ease: 'expo.out', scrollTrigger: { trigger: '.plaq-visual', start: 'top 90%', once: true } });
    },
    { scope: root, dependencies: [motionReduced], revertOnUpdate: true },
  );
  return (
    <section className="plaq" id="plaquinhas" ref={root}>
      <div className="plaq-visual">
        <Image src="/landing/plaquinha.webp" alt="Plaquinha NFC personalizada" width={900} height={1191} sizes="(max-width: 900px) 50vw, 25vw" className="pq pq1" />
        <Image src="/landing/plaquinha.webp" alt="" width={900} height={1191} sizes="(max-width: 900px) 50vw, 25vw" className="pq pq2" />
      </div>
      <div>
        <p className="kicker">04 — Plaquinhas personalizadas</p>
        <Split text={'Com a cara do\nseu restaurante.'} />
        <p className="lead">
          Fale com o designer do Psiu pelo WhatsApp e crie o layout das suas plaquinhas: logo, cores e número de cada mesa.{' '}
          <b>A criação não tem custo extra</b>, você paga só as plaquinhas. Assinantes do Completo têm 15% de desconto na compra das plaquinhas.
        </p>
        <ul className="packs">
          {PACKS.map((p) => (
            <li key={p.name}>
              <span>{p.name}</span>
              <span>{p.qty} un.<small>{p.unit}/un.</small></span>
              <span>{p.price}</span>
            </li>
          ))}
        </ul>
        <a className="btn-wa" href={LINKS.whatsapp} target="_blank" rel="noopener">
          <WhatsApp />
          Falar com o designer no WhatsApp
        </a>
        <p className="wa-num">WhatsApp: {LINKS.whatsappLabel}</p>
      </div>
    </section>
  );
}

export function Plans() {
  const root = useRef<HTMLElement>(null);
  const motionReduced = useReducedMotion();
  useGSAP(
    () => {
      if (motionReduced) return;
      gsap.from('.plan', { y: 32, opacity: 0, stagger: 0.1, duration: 0.75, ease: 'expo.out', scrollTrigger: { trigger: '.plan-grid', start: 'top 90%', once: true } });
    },
    { scope: root, dependencies: [motionReduced], revertOnUpdate: true },
  );
  return (
    <section className="plans" id="planos" ref={root}>
      <p className="kicker">03 — Planos</p>
      <Split text="Escolha como começar." />
      <p className="lead center">Já tem conta? <a href={LINKS.login} className="u">Entrar</a></p>
      <div className="plan-grid">
        {PLANS.map((p) => (
          <article key={p.name} className={`plan${p.featured ? ' featured' : ''}`}>
            <div className="plan-top">
              <h3>{p.name}</h3>
              {p.featured && <span className="badge">Mais completo</span>}
            </div>
            <p className="plan-desc">{p.desc}</p>
            <p className="price"><sup>R$</sup>{p.price}<small>/mês</small></p>
            <p className="price-note">{p.note}</p>
            {p.plaqueDiscount && (
              <p className="plan-benefit">
                <strong>{p.plaqueDiscount}% de desconto</strong>
                <span>na compra das plaquinhas</span>
              </p>
            )}
            <ul>{p.items.map((i) => <li key={i}>{i}</li>)}</ul>
            <a href={LINKS.login} className={`btn full ${p.featured ? 'btn-solid' : 'btn-line'}`}>Assinar {p.name}</a>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="faq" id="faq">
      <p className="kicker">05 — Dúvidas</p>
      <Split text="Perguntas frequentes." />
      <div className="faq-list">
        {FAQ.map(([q, a], i) => (
          <div key={q} className={`faq-item${open === i ? ' open' : ''}`}>
            <button className="faq-q" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
              {q}<i />
            </button>
            <div className="faq-a" onTransitionEnd={() => ScrollTrigger.refresh()}>
              <div><p>{a}</p></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Footer() {
  const root = useRef<HTMLElement>(null);
  const motionReduced = useReducedMotion();
  useGSAP(
    () => {
      if (motionReduced) return;
      gsap.from('.foot-word', { yPercent: 40, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top bottom', end: 'bottom bottom', scrub: true } });
    },
    { scope: root, dependencies: [motionReduced], revertOnUpdate: true },
  );
  return (
    <footer className="foot" ref={root}>
      <div className="foot-cta">
        <Split text={'Coloque o Psiu\nnas suas mesas.'} />
        <div className="foot-btns">
          <a href="#planos" className="btn btn-solid">Assinar agora</a>
          <a href={LINKS.login} className="btn btn-line">Entrar</a>
        </div>
      </div>
      <div className="foot-word" aria-hidden="true">Psiu</div>
      <div className="foot-bar"><span>© Psiu</span><span>{LINKS.contact}</span></div>
    </footer>
  );
}
