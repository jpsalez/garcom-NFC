'use client';
import { Fragment, useSyncExternalStore } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

export { gsap, ScrollTrigger, useGSAP };

export const reducedMotion = () =>
  typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const subscribeMotion = (notify: () => void) => {
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};

/** Também reage a mudanças de preferência com a página aberta. */
export const useReducedMotion = () => useSyncExternalStore(subscribeMotion, reducedMotion, () => false);

export function scrollToHash(hash: string) {
  const el = hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
  if (!el) return;
  el.scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth' });
  el.setAttribute('tabindex', '-1');
  el.setAttribute('data-scroll-target', '');
  el.focus({ preventScroll: true });
  history.replaceState(null, '', hash);
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
