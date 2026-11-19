'use client';
import { useEffect, useRef, type RefObject } from 'react';
import { gsap, reducedMotion } from './motion';

/** Estado compartilhado com a animação do hero: força do pulso NFC e onde ele nasce (0–1 no hero). */
export type Pulse = { v: number; x: number; y: number };

const FRAG = `
precision mediump float;
varying vec2 v;
uniform float uT, uPulse; uniform vec2 uRes, uMouse, uFocus;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*n(p); p*=2.02; a*=.5; } return s; }
void main(){
  vec2 asp = vec2(uRes.x/uRes.y, 1.), p = v*asp;
  float t = uT*.05;
  float f = fbm(p*1.6 + vec2(t, -t*.6) + vec2(sin(p.y*2.+t*3.), cos(p.x*2.-t*2.))*.25);
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

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
    if (!gl) return; // sem WebGL fica o gradiente do CSS

    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'p');
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const u = (k: string) => gl.getUniformLocation(prog, k);
    const [uT, uRes, uMouse, uFocus, uPulse] = ['uT', 'uRes', 'uMouse', 'uFocus', 'uPulse'].map(u);

    const SCALE = 0.5;
    const resize = () => {
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * SCALE));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * SCALE));
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
    addEventListener('pointermove', onMove, { passive: true });

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);

    const still = reducedMotion();
    const draw = (time: number) => {
      if (!visible || document.hidden) return;
      mouse.x += (target.x - mouse.x) * 0.04;
      mouse.y += (target.y - mouse.y) * 0.04;
      gl.uniform1f(uT, still ? 0 : time);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform2f(uFocus, pulse.current.x, pulse.current.y);
      gl.uniform1f(uPulse, pulse.current.v);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    gsap.ticker.add(draw);

    return () => {
      gsap.ticker.remove(draw);
      removeEventListener('pointermove', onMove);
      ro.disconnect();
      io.disconnect();
      // Sem loseContext(): no StrictMode o efeito roda de novo no mesmo canvas e receberia o contexto já perdido
      gl.deleteProgram(prog);
    };
  }, [pulse]);

  return <canvas ref={ref} className="hero-bg" aria-hidden="true" />;
}
