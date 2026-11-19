'use client';
import { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger, useGSAP, useReducedMotion, scrollToHash } from './motion';
import Nav from './Nav';
import Hero from './Hero';
import Features from './Features';
import { Manifesto, Plaquinhas, Plans, Faq, Footer } from './Sections';
import './landing.css';

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const motionReduced = useReducedMotion();

  // Rolagem nativa: mouse, teclado e toque mantêm o comportamento do navegador.
  useEffect(() => {
    let mounted = true;
    document.fonts?.ready.then(() => { if (mounted) ScrollTrigger.refresh(); });
    return () => { mounted = false; };
  }, []);

  // A borda animada só repinta enquanto o plano está visível e a aba está ativa.
  useEffect(() => {
    if (motionReduced) return;
    const visible = new Set<Element>();
    const update = () => root.current?.querySelectorAll('.plan.featured').forEach((el) => {
      el.toggleAttribute('data-motion-active', visible.has(el) && !document.hidden);
    });
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => { if (isIntersecting) visible.add(target); else visible.delete(target); });
      update();
    });
    root.current?.querySelectorAll('.plan.featured').forEach((el) => observer.observe(el));
    document.addEventListener('visibilitychange', update);
    const container = root.current;
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      container?.querySelectorAll('.plan.featured').forEach((el) => el.removeAttribute('data-motion-active'));
    };
  }, [motionReduced]);

  // Títulos entram palavra por palavra quando aparecem (o do hero é animado no Hero)
  useGSAP(
    () => {
      if (motionReduced) return;
      gsap.utils.toArray<HTMLElement>('.split').forEach((el) => {
        if (el.closest('.hero')) return;
        const words = el.querySelectorAll('.w > span');
        gsap.from(words, {
          yPercent: 100, opacity: 0, duration: 0.8, ease: 'sine.out', stagger: 0.025,
          scrollTrigger: { trigger: el, start: 'top 88%', end: 'bottom top', toggleActions: 'play reverse play reverse' },
        });
      });
      gsap.utils.toArray<HTMLElement>('.kicker, .plaq .lead, .packs li, .btn-wa, .faq-item, .foot-btns').forEach((el) => {
        gsap.from(el, {
          y: 12, opacity: 0, duration: 0.7, ease: 'sine.out',
          scrollTrigger: { trigger: el, start: 'top 94%', end: 'bottom top', toggleActions: 'play reverse play reverse' },
        });
      });
    },
    { scope: root, dependencies: [motionReduced], revertOnUpdate: true },
  );

  // Links internos (#secao) rolam suavemente
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    const hash = a?.getAttribute('href');
    if (!a || !hash || hash.length < 2) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    scrollToHash(hash);
  };

  return (
    <div className="psiu" ref={root} onClick={onClick}>
      <Nav />
      <main>
        <Hero />
        <Manifesto />
        <Features />
        <Plans />
        <Plaquinhas />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
