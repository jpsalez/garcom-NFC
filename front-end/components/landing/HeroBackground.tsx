'use client';
import { useEffect, useRef, type RefObject } from 'react';
import { useReducedMotion } from './motion';
import { createRenderBudget } from './render-budget';

/** Estado compartilhado com a animação do hero: força do pulso NFC e onde ele nasce (0–1 no hero). */
export type Pulse = { v: number; x: number; y: number; scroll?: number };

const FRAG = `
precision mediump float;
varying vec2 v;
uniform float uT, uPulse, uScroll; uniform vec2 uRes, uMouse, uFocus;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*n(p); p*=2.02; a*=.5; } return s; }
void main(){
  vec2 asp = vec2(uRes.x/uRes.y, 1.), p = v*asp;
  float t = uT*.05;
  float f = fbm(p*1.6 + vec2(t, -t*.6 + uScroll*.12) + vec2(sin(p.y*2.+t*3.), cos(p.x*2.-t*2.))*.25);
  vec3 c = mix(vec3(.027,.031,.043), vec3(.07,.085,.14), smoothstep(.35,.9,f));
  c += vec3(.05,.06,.1) * (1. - smoothstep(0., .7, distance(p, uMouse*asp)));
  float d = distance(p, uFocus*asp);
  float ring = smoothstep(.015, 0., abs(d - uPulse*.6)) * (1.-uPulse) * step(.001, uPulse) * .6;
  c += vec3(.55,.75,.13) * (ring*.5 + (1.-smoothstep(0., .45, d))*.10*sin(uPulse*3.14159));
  c *= mix(.55, 1., smoothstep(1.25, .25, distance(v, vec2(.55,.5))));
  c = mix(c, vec3(.027,.031,.043), smoothstep(.22, 0., v.y));
  c += (h(gl_FragCoord.xy + fract(uT)) - .5) / 255. * 2.;
  gl_FragColor = vec4(c, 1.);
}`;
const VERT = 'attribute vec2 p; varying vec2 v; void main(){ v = p*.5+.5; gl_Position = vec4(p,0.,1.); }';

/** Névoa animada em WebGL puro (sem three.js), em meia resolução e parada quando fora da tela. */
export default function HeroBackground({ pulse }: { pulse: RefObject<Pulse> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const motionReduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current!;
    // O gradiente preserva a composição sem alocar GPU para movimento reduzido.
    if (motionReduced) return;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
    if (!gl) return; // sem WebGL fica o gradiente do CSS

    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const lowPower = navigator.hardwareConcurrency <= 4 || (memory !== undefined && memory <= 4);
    const shaders: WebGLShader[] = [];
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      shaders.push(s);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, lowPower ? FRAG.replace('i<4', 'i<2') : FRAG));
    gl.bindAttribLocation(prog, 0, 'p');
    gl.linkProgram(prog);
    const compiled = shaders.every((shader) => gl.getShaderParameter(shader, gl.COMPILE_STATUS));
    shaders.forEach((shader) => { gl.detachShader(prog, shader); gl.deleteShader(shader); });
    if (!compiled || !gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      return;
    }
    gl.useProgram(prog);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const u = (k: string) => gl.getUniformLocation(prog, k);
    const [uT, uRes, uMouse, uFocus, uPulse, uScroll] = ['uT', 'uRes', 'uMouse', 'uFocus', 'uPulse', 'uScroll'].map(u);

    const budget = createRenderBudget(lowPower);
    let frame = 0, last: number | null = null, elapsed = 0, visible = false, lost = false, rendered = false;
    let resolutionScale = budget.scale;
    const resize = () => {
      const baseScale = Math.min(lowPower ? 0.35 : 0.5, 960 / canvas.clientWidth, 720 / canvas.clientHeight);
      const scale = baseScale * budget.scale / (lowPower ? 0.35 : 0.5);
      const width = Math.max(1, Math.round(canvas.clientWidth * scale));
      const height = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const target = { x: 0.7, y: 0.5 }, mouse = { ...target };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      target.x = (e.clientX - r.left) / r.width;
      target.y = 1 - (e.clientY - r.top) / r.height;
    };
    const surface = canvas.parentElement!;
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (finePointer) surface.addEventListener('pointermove', onMove, { passive: true });

    const draw = (time: number) => {
      frame = requestAnimationFrame(draw);
      const paint = budget.tick(time);
      if (resolutionScale !== budget.scale) { resolutionScale = budget.scale; resize(); }
      if (!paint) return;
      const delta = last === null ? 1 / 60 : Math.min(time - last, 100) / 1000;
      elapsed += last === null ? 0 : delta;
      last = time;
      const follow = 1 - Math.exp(-delta * 6);
      mouse.x += (target.x - mouse.x) * follow;
      mouse.y += (target.y - mouse.y) * follow;
      gl.uniform1f(uT, elapsed);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform2f(uFocus, pulse.current.x, pulse.current.y);
      gl.uniform1f(uPulse, pulse.current.v);
      gl.uniform1f(uScroll, pulse.current.scroll ?? 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!rendered) { canvas.classList.add('rendered'); rendered = true; }
    };
    const update = () => {
      cancelAnimationFrame(frame);
      last = null;
      budget.reset();
      if (visible && !document.hidden && !lost) frame = requestAnimationFrame(draw);
    };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; update(); });
    io.observe(canvas);
    document.addEventListener('visibilitychange', update);
    const contextLost = (event: Event) => {
      event.preventDefault(); lost = true; update(); canvas.classList.remove('rendered');
    };
    canvas.addEventListener('webglcontextlost', contextLost);

    return () => {
      cancelAnimationFrame(frame);
      surface.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', update);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.classList.remove('rendered');
      ro.disconnect();
      io.disconnect();
      // Sem loseContext(): no StrictMode o efeito roda de novo no mesmo canvas e receberia o contexto já perdido
      gl.deleteProgram(prog);
      gl.deleteBuffer(buffer);
    };
  }, [pulse, motionReduced]);

  return <canvas ref={ref} className="hero-bg" aria-hidden="true" />;
}
