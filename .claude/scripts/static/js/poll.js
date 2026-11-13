// @ts-check
import { isAbort } from './api.js';
import { S } from './store.js';
import { toast } from './ui/toast.js';

export const clearTimers = () => { S.timers.forEach(t => (t && t.remove) ? t.remove() : clearInterval(t)); S.timers = []; };

const MAX_BACKOFF = 30_000;

/**
 * Repete `fn` a cada `ms`. Pausa com a aba oculta e dobra o intervalo a cada erro (até 30 s).
 * Avisa só na primeira falha de uma sequência. Devolve algo que `clearTimers` sabe parar.
 * @param {() => Promise<any>} fn
 * @param {number} ms
 */
export function poll(fn, ms) {
  let stopped = false, fails = 0, timer = 0;
  const next = () => { timer = window.setTimeout(tick, Math.min(MAX_BACKOFF, ms * 2 ** fails)); };
  async function tick() {
    if (stopped) return;
    if (document.hidden) { next(); return; }
    try { await fn(); fails = 0; } catch (e) {
      if (!isAbort(e)) { fails++; if (fails === 1) toast((e instanceof Error ? e.message : String(e)) + ' (nova tentativa em seguida)', true); }
    }
    if (!stopped) next();
  }
  const onVisible = () => { if (!document.hidden && !stopped) { clearTimeout(timer); tick(); } };
  document.addEventListener('visibilitychange', onVisible);
  next();
  return { remove() { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); } };
}
