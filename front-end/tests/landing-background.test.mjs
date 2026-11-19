import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Testa o ciclo de vida do efeito real sem depender de GPU ou navegador.
const source = ts.transpileModule(
  readFileSync(new URL('../components/landing/HeroBackground.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
const budgetModule = {};
runInNewContext(ts.transpileModule(
  readFileSync(new URL('../components/landing/render-budget.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText, { exports: budgetModule });

function mount({ reduced = false, lowPower = false, compile = true } = {}) {
  const calls = [];
  const frames = new Map();
  const listeners = new Map();
  const canvasListeners = new Map();
  const classes = new Set();
  let frameId = 0, cleanup, intersection, resize, disconnected = 0;
  const gl = new Proxy({}, {
    get: (_, key) => (...args) => {
      calls.push([key, ...args]);
      if (key === 'getShaderParameter' || key === 'getProgramParameter') return compile;
      if (key.startsWith('create')) return {};
    },
  });
  const canvas = {
    width: 300, height: 150, clientWidth: 3840, clientHeight: 2160,
    getContext: () => { calls.push(['getContext']); return gl; },
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
    parentElement: { addEventListener() {}, removeEventListener() {} },
    addEventListener: (name, fn) => canvasListeners.set(name, fn),
    removeEventListener: (name) => canvasListeners.delete(name),
  };
  const document = {
    hidden: false,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  const exports = {};
  runInNewContext(source, {
    exports, Float32Array, document,
    navigator: { hardwareConcurrency: lowPower ? 2 : 8, deviceMemory: lowPower ? 2 : 8 },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (fn) => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: (id) => frames.delete(id),
    ResizeObserver: class {
      constructor(fn) { resize = fn; }
      observe() {}
      disconnect() { disconnected++; }
    },
    IntersectionObserver: class {
      constructor(fn) { intersection = fn; }
      observe() {}
      disconnect() { disconnected++; }
    },
    require: (name) => {
      if (name === 'react') return { useRef: () => ({ current: canvas }), useEffect: (fn) => { cleanup = fn(); } };
      if (name === './motion') return { useReducedMotion: () => reduced };
      if (name === './render-budget') return budgetModule;
      if (name === 'react/jsx-runtime') return { jsx: () => null };
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  exports.default({ pulse: { current: { v: 0, x: 0.3, y: 0.5 } } });
  return {
    calls, canvas, frames, classes, listeners, document, canvasListeners,
    visible: (value) => intersection([{ isIntersecting: value }]),
    resize: () => resize(),
    cleanup: () => cleanup?.(),
    disconnected: () => disconnected,
    count: (name) => calls.filter(([key]) => key === name).length,
    tick: (time) => { const [id, fn] = frames.entries().next().value; frames.delete(id); fn(time); },
  };
}

test('limita pixels e frames; suspende fora da tela e na aba oculta', () => {
  const app = mount();
  assert.equal(app.canvas.width, 960);
  assert.equal(app.canvas.height, 540);
  assert.equal(app.frames.size, 0);
  app.visible(true);
  app.tick(40);
  app.tick(50);
  assert.equal(app.count('drawArrays'), 1);
  app.tick(80);
  assert.equal(app.count('drawArrays'), 2);
  app.visible(false);
  assert.equal(app.frames.size, 0);
  app.visible(true);
  app.document.hidden = true;
  app.listeners.get('visibilitychange')();
  assert.equal(app.frames.size, 0);
  app.document.hidden = false;
  app.listeners.get('visibilitychange')();
  assert.equal(app.frames.size, 1);
  app.cleanup();
  assert.equal(app.frames.size, 0);
  assert.equal(app.count('deleteShader'), 2);
  assert.equal(app.count('deleteProgram'), 1);
  assert.equal(app.count('deleteBuffer'), 1);
  assert.equal(app.listeners.size, 0);
  assert.equal(app.canvasListeners.size, 0);
  assert.equal(app.disconnected(), 2);
});

test('movimento reduzido não aloca contexto, observadores ou frames', () => {
  const app = mount({ reduced: true });
  assert.equal(app.calls.length, 0);
  assert.equal(app.frames.size, 0);
  assert.equal(app.listeners.size, 0);
});

test('adaptação reduz pixels mesmo quando a tela já atingiu o teto de resolução', () => {
  const app = mount();
  app.visible(true);
  app.tick(0);
  for (let frame = 1; frame <= 40; frame++) app.tick(frame * 35);
  assert.equal(app.canvas.width, 864);
  assert.equal(app.canvas.height, 486);
  app.cleanup();
});

test('dispositivos modestos usam shader de duas oitavas e até 30 fps', () => {
  const app = mount({ lowPower: true });
  assert.ok(app.calls.some(([key, , source]) => key === 'shaderSource' && source.includes('i<2')));
  app.visible(true);
  app.tick(50);
  app.tick(65);
  assert.equal(app.count('drawArrays'), 1);
  app.tick(85);
  assert.equal(app.count('drawArrays'), 2);
  app.cleanup();
});

test('falha de compilação libera shaders e programa sem iniciar o loop', () => {
  const app = mount({ compile: false });
  assert.equal(app.count('deleteShader'), 2);
  assert.equal(app.count('deleteProgram'), 1);
  assert.equal(app.frames.size, 0);
  assert.equal(app.count('createBuffer'), 0);
});

test('perda do contexto suspende o loop e revela o gradiente de fallback', () => {
  const app = mount();
  app.visible(true);
  app.tick(50);
  assert.ok(app.classes.has('rendered'));
  app.canvasListeners.get('webglcontextlost')({ preventDefault() {} });
  assert.equal(app.frames.size, 0);
  assert.equal(app.classes.has('rendered'), false);
  app.cleanup();
});
