// @ts-check
import { api } from '../api.js';
import { $, h } from '../lib/dom.js';
import { fmtDur } from '../lib/format.js';
import { go } from '../router.js';
import { S } from '../store.js';
import { guard } from '../ui/toast.js';
import { hideTip, showTip } from '../ui/tooltip.js';

/* ---------- Linha do tempo ---------- */
const MIN_BAR_PX = 72;          // largura mínima de uma barra: o título precisa ser legível
const MIN_SPAN = 60;            // menor janela possível (segundos)
const LANE_LABEL = 150;         // largura da coluna de rótulos à esquerda
const STEPS = [60, 300, 600, 1800, 3600, 10800, 21600, 43200, 86400, 172800, 432000];

/** Empilha as barras que se sobrepõem em linhas (sem esconder nenhuma). `minSec` é a duração mínima visual. @param {any[]} items @param {number} minSec */
function packRows(items, minSec) {
  const rows = /** @type {number[]} */ ([]);
  items.sort((x, y) => x.start - y.start).forEach(it => {
    let r = rows.findIndex(end => end <= it.start);
    if (r < 0) { r = rows.length; rows.push(0); }
    rows[r] = Math.max(it.end, it.start + minSec); it.row = r;
  });
  return rows.length || 1;
}

export async function renderTempo() {
  const main = $('#main'); main.className = ''; main.replaceChildren();
  const top = h('div', 'row'), sel = h('select'); sel.setAttribute('aria-label', 'Período');
  [[0, 'ajustar aos dados'], [1, 'últimas 24 h'], [3, '3 dias'], [7, '7 dias'], [30, '30 dias']].forEach(([d, l]) => sel.append(new Option(String(l), String(d)))); sel.value = String(S.days == null ? 0 : S.days);
  const lb = h('label', 'hint'), cb = h('input'); cb.type = 'checkbox'; cb.checked = !!S.showPanel; lb.append(cb, document.createTextNode(' incluir sessões do painel e as muito curtas'));
  const rf = h('button', 'btn sm', 'Atualizar');
  const zoomBox = h('div', 'tl-zoom'), zOut = h('button', 'btn sm ic', '−'), zIn = h('button', 'btn sm ic', '+'), zReset = h('button', 'btn sm', 'Tudo'), winLab = h('span', 'hint mono');
  zOut.title = 'Afastar (Ctrl + roda do mouse, ou tecla −)'; zIn.title = 'Aproximar (Ctrl + roda do mouse, ou tecla +)'; zReset.title = 'Mostrar o período inteiro (tecla 0)';
  zOut.setAttribute('aria-label', 'Afastar'); zIn.setAttribute('aria-label', 'Aproximar');
  zoomBox.append(zOut, zIn, zReset, winLab);
  top.append(h('span', 'mut', 'Período'), sel, lb, rf, zoomBox); main.append(top);
  main.append(h('div', 'hint', 'Barras: sessões do Claude Code (azul) e agentes do painel (verde, tracejado). Pontos: commits (tamanho = linhas alteradas) e verificações (verde passou, vermelho falhou). Ctrl + roda aproxima, arrastar move, clique abre o detalhe.'));
  const card = h('div', 'card'); card.style.cssText = 'margin-top:12px;padding:16px 22px 22px'; main.append(card);
  S.timers.push({ remove: hideTip });

  /** @type {any} */ let d = null;
  let full = [0, 1], win = [0, 1], drew = false;
  const spanOf = () => win[1] - win[0];
  const X = (/** @type {number} */ t) => (t - win[0]) / spanOf() * 100;

  /** Troca a janela visível, sempre dentro do período carregado. @param {number} a @param {number} b */
  function setWindow(a, b) {
    const span = Math.max(MIN_SPAN, Math.min(b - a, full[1] - full[0]));
    a = Math.min(Math.max(a, full[0]), full[1] - span); win = [a, a + span]; draw();
  }
  /** @param {number} factor @param {number} [frac] ponto fixo da janela (0 a 1) */
  const zoom = (factor, frac = 0.5) => { const span = spanOf(), next = Math.max(MIN_SPAN, Math.min(span * factor, full[1] - full[0])), c = win[0] + frac * span; setWindow(c - frac * next, c - frac * next + next); };

  function draw() {
    card.replaceChildren(); if (!d) return;
    const sessions = d.sessions.filter((/** @type {any} */ x) => S.showPanel || (!x.panel && !(x.end - x.start < 30 && !x.agents))), runs = d.runs, span = spanOf();
    const tl = h('div', 'tl' + (drew ? ' still' : '')); tl.tabIndex = 0; tl.setAttribute('aria-label', 'Linha do tempo. Setas movem, + e − aproximam, 0 mostra tudo.'); card.append(tl);
    const W = Math.max(300, card.clientWidth - 44 - LANE_LABEL), minSec = MIN_BAR_PX / W * span;
    winLab.textContent = 'janela: ' + fmtDur(span * 1000); zIn.disabled = span <= MIN_SPAN + 0.5; zOut.disabled = spanOf() >= full[1] - full[0] - 0.5; zReset.disabled = zOut.disabled;
    const vis = (/** @type {{ start: number, end: number }} */ x) => x.end >= win[0] && x.start <= win[1];
    const step = STEPS.find(x => span / x <= 9) || 432000, ticks = /** @type {number[]} */ ([]);

    const axis = h('div', 'tlane'); axis.style.cssText = 'height:24px;border:0'; const axClip = h('div', 'tlclip'); axis.append(axClip); tl.append(axis);
    for (let t = Math.ceil(win[0] / step) * step; t < win[1]; t += step) {
      const dt = new Date(t * 1000), lab = step >= 86400 ? dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : dt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
      const tx = h('div', 'tick'); tx.style.cssText = 'left:' + X(t) + '%;top:auto;height:24px'; const sp = h('span', '', lab); sp.style.top = '2px'; tx.append(sp); axClip.append(tx); ticks.push(t);
    }
    /** @param {string} name @param {string} sub @param {number} height */
    const addLane = (name, sub, height) => {
      const lane = h('div', 'tlane'); lane.style.height = height + 'px'; const l = h('div', 'tlbl'); l.append(h('b', '', name), document.createTextNode(sub)); lane.append(l);
      const clip = h('div', 'tlclip'); lane.append(clip); ticks.forEach(t => { const k = h('div', 'tick'); k.style.left = X(t) + '%'; clip.append(k); }); tl.append(lane); return clip;
    };
    /** @param {string} name @param {string} sub @param {any[]} all @param {string} kind @param {(it: any) => string} label @param {(it: any) => string[]} tipFn @param {(it: any) => void} click */
    const barLane = (name, sub, all, kind, label, tipFn, click) => {
      const items = all.filter(vis), n = packRows(items, minSec), clip = addLane(name, sub, n * 28 + 16);
      items.forEach((it, i) => {
        const bar = h('div', 'tbar ' + kind + (kind === 'r' ? ' pn' : ''), label(it)); bar.style.left = X(it.start) + '%'; bar.style.width = Math.max(MIN_BAR_PX / W * 100, (it.end - it.start) / span * 100) + '%'; bar.style.top = 8 + it.row * 28 + 'px'; bar.style.animationDelay = i * 25 + 'ms';
        const lines = tipFn(it); bar.tabIndex = 0; bar.setAttribute('role', 'button'); bar.setAttribute('aria-label', lines.join('. '));
        bar.onmousemove = e => showTip(e, lines); bar.onmouseleave = hideTip; bar.onclick = () => click(it); bar.onkeydown = e => { if (e.key === 'Enter') click(it); }; clip.append(bar);
      });
      if (!items.length) clip.append(Object.assign(h('div', 'hint'), { textContent: all.length ? 'nada nesta janela (afaste ou arraste)' : 'nada neste período', style: 'position:absolute;left:10px;top:10px' }));
    };
    const when = (/** @type {any} */ it) => new Date(it.start * 1000).toLocaleString('pt-BR') + ' → ' + new Date(it.end * 1000).toLocaleTimeString('pt-BR');
    barLane('Sessões', sessions.length + ' do Claude Code', sessions.map((/** @type {any} */ x) => ({ ...x, end: Math.max(x.end, x.start + 60) })), 's', it => it.title, it => [it.title, it.agents + ' subagente(s)', when(it)], it => { S.anSession = it.id; go('analise'); });
    barLane('Agentes do painel', runs.length + ' execução(ões)', runs.map((/** @type {any} */ x) => ({ ...x, end: Math.max(x.end, x.start + 60) })), 'r', it => it.agent.replace('garcom-', '') + ' · ' + (it.title || ''), it => [it.agent.replace('garcom-', '') + ' · ' + (it.title || ''), 'US$ ' + it.cost.toFixed(3) + ' · ' + it.status, when(it)], it => { if (it.team) { S.selTeam = it.team; S.sel = null; } else { S.sel = it.id; S.selTeam = null; } go('conversa'); });
    const cl = addLane('Commits', d.commits.length + ' no período', 56);
    d.commits.filter((/** @type {any} */ c) => c.t >= win[0] && c.t <= win[1]).forEach((/** @type {any} */ c) => {
      const sz = Math.max(12, Math.min(28, 10 + Math.log2(1 + c.add + c.del) * 1.7)), dot = h('div', 'tdot'); dot.style.cssText = 'left:' + X(c.t) + '%;top:' + (28 - sz / 2) + 'px;width:' + sz + 'px;height:' + sz + 'px;background:var(--ac)';
      const lines = [c.short + ' ' + c.subject, '+' + c.add + ' −' + c.del]; dot.tabIndex = 0; dot.setAttribute('role', 'button'); dot.setAttribute('aria-label', lines.join('. '));
      dot.onmousemove = e => showTip(e, lines); dot.onmouseleave = hideTip; dot.onclick = () => { S.commitSel = c.sha; go('commits'); }; dot.onkeydown = e => { if (e.key === 'Enter') dot.click(); }; cl.append(dot);
    });
    const kl = addLane('Verificações', 'verify · tenant · doc', 52), yk = /** @type {Record<string, number>} */ ({ verify: 6, check_tenant: 20, doc_drift: 34 });
    d.checks.filter((/** @type {any} */ c) => c.t >= win[0] && c.t <= win[1]).forEach((/** @type {any} */ c) => {
      const dot = h('div', 'tdot'); dot.style.cssText = 'left:' + X(c.t) + '%;top:' + (yk[c.name] || 6) + 'px;width:10px;height:10px;background:' + (c.ok ? 'var(--ok)' : 'var(--err)');
      dot.onmousemove = e => showTip(e, [c.name + (c.ok ? ' ✓' : ' ✕'), c.summary]); dot.onmouseleave = hideTip; kl.append(dot);
    });
    if (d.t1 >= win[0] && d.t1 <= win[1]) { const nw = h('div', 'now'); nw.style.cssText = 'left:' + X(d.t1) + '%;top:0'; axClip.append(nw); }
    drew = true;

  }
  /** Arrasto: redesenha no próximo quadro (sem perder o ponteiro). @param {number} a @param {number} b */
  let raf = 0;
  function setWindowQuiet(a, b) { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const hadFocus = document.activeElement?.classList.contains('tl'); setWindow(a, b); if (hadFocus) /** @type {HTMLElement | null} */ (card.querySelector('.tl'))?.focus(); }); }

  // ----- zoom e arrasto (no cartão, que não é recriado a cada desenho) -----
  const clip = () => /** @type {HTMLElement | null} */ (card.querySelector('.tlclip'));
  card.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey || (/** @type {HTMLElement} */ (e.target)).closest('.tlane:first-of-type'))) return;
    e.preventDefault(); const r = clip()?.getBoundingClientRect(); zoom(e.deltaY < 0 ? 0.8 : 1.25, r ? Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) : 0.5);
  }, { passive: false });
  card.addEventListener('pointerdown', e => {
    if ((/** @type {HTMLElement} */ (e.target)).closest('.tbar, .tdot') || e.button !== 0 || !clip()) return;
    const x0 = e.clientX, w0 = [...win], per = spanOf() / /** @type {HTMLElement} */ (clip()).getBoundingClientRect().width; card.classList.add('panning');
    const move = (/** @type {PointerEvent} */ ev) => { const dt = (x0 - ev.clientX) * per; setWindowQuiet(w0[0] + dt, w0[1] + dt); };
    const up = () => { card.classList.remove('panning'); removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
  card.addEventListener('keydown', e => {
    if (!(/** @type {HTMLElement} */ (e.target)).classList.contains('tl')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const s = spanOf() * 0.2 * (e.key === 'ArrowLeft' ? -1 : 1); setWindowQuiet(win[0] + s, win[1] + s); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(0.7); } else if (e.key === '-') { e.preventDefault(); zoom(1.4); } else if (e.key === '0') { e.preventDefault(); setWindow(full[0], full[1]); }
  });

  zIn.onclick = () => zoom(0.6); zOut.onclick = () => zoom(1.6); zReset.onclick = () => setWindow(full[0], full[1]);
  const load = guard(async () => {
    S.days = parseInt(sel.value); S.showPanel = cb.checked; d = await api('timeline?days=' + (S.days || 30));
    const sessions = d.sessions.filter((/** @type {any} */ x) => S.showPanel || (!x.panel && !(x.end - x.start < 30 && !x.agents)));
    let t0 = d.t0;
    if (!S.days) { const all = [...sessions.map((/** @type {any} */ x) => x.start), ...d.runs.map((/** @type {any} */ x) => x.start), ...d.commits.map((/** @type {any} */ x) => x.t), ...d.checks.map((/** @type {any} */ x) => x.t)]; const mn = all.length ? Math.min(...all) : d.t1 - 6 * 3600; t0 = Math.max(d.t0, Math.min(mn - (d.t1 - mn) * 0.04, d.t1 - 3 * 3600)); }
    full = [t0, d.t1]; win = [t0, d.t1]; drew = false; draw();
  });
  sel.onchange = load; cb.onchange = load; rf.onclick = load; await load();
}
