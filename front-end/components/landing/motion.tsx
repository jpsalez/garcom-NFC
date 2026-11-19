'use client';
import { Fragment } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import type Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, useGSAP);

export { gsap, ScrollTrigger, useGSAP };

export const reducedMotion = () =>
  typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Instância do Lenis (criada em Landing) para menu e âncoras. */
export const scroller: { lenis: Lenis | null } = { lenis: null };

export function scrollToHash(hash: string, duration = 1.6) {
  const el = hash.length > 1 ? document.querySelector<HTMLElement>(hash) : null;
  if (!el) return;
  if (scroller.lenis) scroller.lenis.scrollTo(el, { offset: -20, duration, force: true });
  else el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' });
}

/** Texto quebrado em palavras (cada uma numa máscara) para animar a entrada. "\n" vira quebra de linha. */
export function Split({ text, as: Tag = 'h2', className = '' }: { text: string; as?: 'h1' | 'h2'; className?: string }) {
  return (
    <Tag className={`split ${className}`.trim()} aria-label={text.replace(/\n/g, ' ')}>
      {text.split('\n').map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line.split(' ').map((w, j) => (
            <Fragment key={j}>
              {j > 0 && ' '}
              <span className="w" aria-hidden="true"><span>{w}</span></span>
            </Fragment>
          ))}
        </Fragment>
      ))}
    </Tag>
  );
}
