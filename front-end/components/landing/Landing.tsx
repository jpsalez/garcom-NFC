'use client';
import { useEffect, useRef } from 'react';
import Lenis from 'lenis';
import { gsap, ScrollTrigger, useGSAP, reducedMotion, scroller, scrollToHash } from './motion';
import Nav from './Nav';
import Hero from './Hero';
import Features from './Features';
import { Manifesto, Plaquinhas, Plans, Faq, Footer } from './Sections';
import './landing.css';

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);

  // Rolagem suave sincronizada com o GSAP (um único loop de animação)
  useEffect(() => {
    if (reducedMotion()) return;
    const lenis = new Lenis({ lerp: 0.14, wheelMultiplier: 1.1, autoRaf: false });
    const raf = (t: number) => lenis.raf(t * 1000);
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    scroller.lenis = lenis;
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return () => {
      gsap.ticker.remove(raf);
      lenis.destroy();
      scroller.lenis = null;
    };
  }, []);

  // Títulos entram palavra por palavra quando aparecem (o do hero é animado no Hero)
  useGSAP(
    () => {
      if (reducedMotion()) return;
      gsap.utils.toArray<HTMLElement>('.split').forEach((el) => {
        if (el.closest('.hero')) return;
        const words = el.querySelectorAll('.w > span');
        gsap.set(words, { yPercent: 110 });
        ScrollTrigger.create({
          trigger: el,
          start: 'top 85%',
          once: true,
          onEnter: () => gsap.to(words, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.06 }),
        });
      });
    },
    { scope: root },
  );

  // Links internos (#secao) rolam suavemente
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    const hash = a?.getAttribute('href');
    if (!a || !hash || hash.length < 2) return;
    e.preventDefault();
    scrollToHash(hash, Number(a.dataset.dur) || 1.6);
  };

  return (
    <div className="psiu" ref={root} onClick={onClick}>
      <Nav />
      <main>
        <Hero />
        <Manifesto />
        <Features />
        <Plaquinhas />
        <Plans />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
