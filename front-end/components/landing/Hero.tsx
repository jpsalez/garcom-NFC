'use client';
import { useRef, useState } from 'react';
import Image from 'next/image';
import { gsap, ScrollTrigger, useGSAP, reducedMotion, Split } from './motion';
import HeroBackground, { type Pulse } from './HeroBackground';
import { Icon } from './Icons';
import { STEPS } from './content';

/** Marcos da animação, em segundos. */
const T = { touch: 1, menu: 1.05, press: 1.9, done: 2.3, end: 3.5 };
/** Faixa de tempo de cada passo (enche a linha verde) e ponto ao clicar nele. */
const SEG = [[0, T.menu], [T.menu, T.done], [T.done, T.end]];
const TARGET = [T.touch * 0.5, T.press, T.end];

/** Poses do celular: x/y em fração do quadrado da animação, r/ry em graus. */
const POSE = {
  start: { x: 0.62, y: 0.19, r: 5, ry: -12 },
  touch: { x: 0.25, y: 0.33, r: -18, ry: 0 }, // a ponta encosta no NFC; a plaquinha segue visível
  after: { x: 0.63, y: 0.17, r: 3, ry: -6 },
};
const pose = (p: (typeof POSE)[keyof typeof POSE]) => ({ '--x': p.x, '--y': p.y, '--r': p.r, '--ry': p.ry });

export default function Hero() {
  const root = useRef<HTMLElement>(null);
  const pulse = useRef<Pulse>({ v: 0, x: 0.3, y: 0.5 });
  const [stage, setStage] = useState(0); // 0 bloqueado · 1 menu · 2 chamado enviado
  const [press, setPress] = useState(false);
  const goTo = useRef<(i: number) => void>(() => {});

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const hero = root.current!;
      const [visual, phone, plaque, rings] = ['.visual', '.phone', '.plaque', '.rings'].map((s) => q(s)[0] as HTMLElement);
      const steps = q('.step') as HTMLElement[];

      hero.classList.add('ready');

      // O celular acompanha o tamanho do quadrado; o pulso do fundo nasce no NFC
      const fit = () => {
        phone.style.setProperty('--s', String((visual.clientWidth * 0.62) / 868));
        const h = hero.getBoundingClientRect(), r = rings.getBoundingClientRect();
        pulse.current.x = (r.left - h.left) / h.width;
        pulse.current.y = 1 - (r.top - h.top) / h.height;
      };
      const ro = new ResizeObserver(fit);
      ro.observe(visual);
      fit();

      // Linha do tempo por tempo (não presa à rolagem): sempre suave, ida e volta
      gsap.set(phone, pose(POSE.start));
      const ease = 'power3.inOut';
      const tl = gsap.timeline({ paused: true })
        .to(q('.scroll-hint'), { opacity: 0, duration: 0.3 }, 0)
        .to(phone, { ...pose(POSE.touch), duration: T.touch, ease }, 0)
        .to(plaque, { rotate: -3, duration: T.touch, ease }, 0)
        .to(pulse.current, { v: 1, duration: 1.2, ease: 'power1.out' }, T.touch - 0.05)
        .to(phone, { ...pose(POSE.after), duration: 0.9, ease }, T.done)
        .to(plaque, { rotate: 0, duration: 0.9, ease }, T.done)
        .set({}, {}, T.end);
      q('.rings i').forEach((el, i) =>
        tl.fromTo(el, { scale: 0.4, opacity: 0.9 }, { scale: 3.2, opacity: 0, duration: 1.1, ease: 'power1.out', immediateRender: false }, T.touch - 0.05 + i * 0.22),
      );

      // Tela, passo e botão derivados do tempo: funciona igual indo ou voltando
      const sync = () => {
        const t = tl.time();
        setStage(t < T.menu ? 0 : t < T.done ? 1 : 2);
        setPress(t >= T.press && t < T.press + 0.25);
        steps.forEach((el, i) => el.style.setProperty('--p', String(gsap.utils.clamp(0, 1, (t - SEG[i][0]) / (SEG[i][1] - SEG[i][0])))));
      };
      tl.eventCallback('onUpdate', sync);
      goTo.current = (i) => tl.timeScale(1.4).tweenTo(TARGET[i]);

      if (reducedMotion()) {
        tl.progress(1);
        sync();
        return () => ro.disconnect();
      }

      const play = () => tl.timeScale(1).play();
      // Prende o hero por um trecho curto e dispara com ~10px de rolagem; ao voltar ao topo, reverte
      ScrollTrigger.create({ trigger: hero, start: 'top top', end: () => `+=${Math.round(innerHeight * 0.45)}`, pin: true, anticipatePin: 1, invalidateOnRefresh: true });
      ScrollTrigger.create({ start: 8, end: 'max', onEnter: play, onLeaveBack: () => tl.timeScale(1.8).reverse() });

      // Entrada; se ninguém rolar, a animação começa sozinha
      gsap.timeline({ delay: 0.1 })
        .from(phone, { opacity: 0, '--in': '40px', duration: 1.2, ease: 'expo.out' })
        .from(plaque, { y: 60, opacity: 0, duration: 1.4, ease: 'expo.out' }, '<')
        .fromTo(q('h1 .w > span'), { y: 0, yPercent: 110 }, { yPercent: 0, duration: 1.2, ease: 'expo.out', stagger: 0.08 }, '<0.1')
        .from(q('.hero-sub, .steps, .hero-btns'), { opacity: 0, y: 20, duration: 1, stagger: 0.1, ease: 'expo.out' }, '<0.3')
        .call(() => void gsap.delayedCall(1.8, () => tl.progress() === 0 && play()));

      return () => ro.disconnect();
    },
    { scope: root },
  );

  return (
    <section className="hero" id="hero" ref={root}>
      <HeroBackground pulse={pulse} />
      <div className="hero-grid">
        <div className="hero-copy">
          <Split as="h1" text={'Um toque\nna mesa.'} />
          <p className="hero-sub">Chame o garçom por aproximação, sem aplicativo.</p>
          <div className="steps" aria-live="polite">
            {STEPS.map((text, i) => (
              <button key={i} className={`step${i <= stage ? ' on' : ''}${i === stage ? ' cur' : ''}`} onClick={() => goTo.current(i)}>
                <span>0{i + 1}</span>
                {text}
              </button>
            ))}
          </div>
          <div className="hero-btns">
            <a href="#planos" className="btn btn-solid">Ver planos</a>
            <a href="#produto" className="btn btn-line" data-dur="2.8">Ver como funciona</a>
          </div>
        </div>

        <div className="stage">
          <div className="visual" role="img" aria-label="Animação: um celular encosta na plaquinha NFC e o chamado chega ao garçom">
            <div className="plaque">
              <Image src="/landing/plaquinha.webp" alt="" width={900} height={1191} priority sizes="(max-width: 600px) 45vw, 30vw" draggable={false} />
              <div className="rings"><i /><i /><i /></div>
            </div>
            <div className="phone">
              <Phone stage={stage} press={press} />
            </div>
          </div>
        </div>
      </div>
      <div className="scroll-hint"><span />Role para ver</div>
    </section>
  );
}

function Phone({ stage, press }: { stage: number; press: boolean }) {
  const on = (i: number) => `scr${stage === i ? ' on' : ''}`;
  return (
    <div className="device">
      <div className="device-frame">
        <div className="app">
          <div className={on(0)}>
            <p className="clock">21:04</p>
            <p className="date">quarta-feira</p>
            <div className="nfc-hint"><Icon name="nfc" />Aproxime da plaquinha</div>
          </div>
          <div className={`${on(1)} scr-menu`}>
            <p className="small">Você está na</p>
            <p className="table">Mesa 07</p>
            <div className="opt">Chamar garçom</div>
            <div className={`opt hl${press ? ' press' : ''}`}>Pedir a conta</div>
            <div className="opt">Ver cardápio</div>
          </div>
          <div className={on(2)}>
            <div className="check"><Icon name="check" /></div>
            <p className="done-t">Chamado enviado</p>
            <p className="small">O garçom já está a caminho da Mesa 07.</p>
          </div>
        </div>
      </div>
      <div className="device-island" />
      <div className="device-btn" style={{ left: -2, top: 115, height: 32 }} />
      <div className="device-btn" style={{ left: -2, top: 175, height: 62 }} />
      <div className="device-btn" style={{ left: -2, top: 255, height: 62 }} />
      <div className="device-btn" style={{ right: -2, top: 200, height: 100 }} />
    </div>
  );
}
