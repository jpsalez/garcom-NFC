import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = ts.transpileModule(
  readFileSync(new URL('../components/landing/Hero.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

function mount(reduced = false) {
  const triggers = [], calls = [], listeners = new Map();
  let cleanup, autoplay;
  const element = {
    toggleAttribute() {}, removeAttribute() {},
    clientWidth: 400, style: { setProperty() {} },
    getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 800, width: 1000, height: 800 }),
  };
  const sequence = {};
  sequence.time = () => 2.6;
  for (const name of ['to', 'from', 'fromTo', 'set', 'eventCallback', 'timeScale', 'play', 'pause', 'reverse', 'resume', 'progress']) {
    sequence[name] = (...args) => { calls.push([name, ...args]); return sequence; };
  }
  const document = {
    hidden: false,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
  const exports = {};
  runInNewContext(source, {
    exports, document, innerHeight: 800,
    ResizeObserver: class { observe() {} disconnect() {} },
    require: (name) => {
      if (name === 'react') return {
        useRef: (value) => ({ current: value === null ? element : value }),
        useState: (value) => [value, () => {}],
      };
      if (name === './motion') return {
        useReducedMotion: () => reduced,
        useGSAP: (fn) => { cleanup = fn(); },
        ScrollTrigger: { create: (config) => triggers.push(config) },
        gsap: {
          set() {}, timeline: () => sequence,
          delayedCall: (_, fn) => { autoplay = fn; return { kill: () => calls.push(['killAutoplay']) }; },
          utils: { selector: () => (selector) => ['.rings i', '.step'].includes(selector) ? [] : [element] },
        },
      };
      if (name === './content') return { STEPS: [] };
      if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
      return {};
    },
  });
  exports.default();
  return { triggers, calls, document, listeners, autoplay: () => autoplay(), cleanup, count: (name) => calls.filter(([key]) => key === name).length };
}

test('reverte ao voltar ao hero e ao topo; reproduz novamente em ciclos sucessivos', () => {
  const app = mount();
  const visibility = app.triggers.find((trigger) => trigger.trigger);
  const top = app.triggers.find((trigger) => trigger.start === 8);
  app.autoplay();
  assert.equal(app.count('play'), 1);
  visibility.onEnterBack();
  assert.equal(app.count('reverse'), 1);
  for (let i = 0; i < 3; i++) {
    top.onLeaveBack();
    top.onEnter();
  }
  assert.equal(app.count('reverse'), 4);
  assert.equal(app.count('play'), 4);
  app.cleanup();
  assert.equal(app.listeners.size, 0);
});

test('pausa quando invisível e retoma sem substituir a direção da timeline', () => {
  const app = mount();
  app.autoplay();
  app.triggers[0].onEnterBack();
  app.triggers[0].onToggle({ isActive: false });
  assert.ok(app.count('pause') > 0);
  app.triggers[0].onToggle({ isActive: true });
  assert.equal(app.count('resume'), 1);
  assert.equal(app.count('play'), 1);
  app.document.hidden = true;
  app.listeners.get('visibilitychange')();
  assert.ok(app.count('pause') >= 2);
  app.cleanup();
});

test('movimento reduzido mantém a cena final sem gatilhos de reprodução', () => {
  const app = mount(true);
  assert.equal(app.triggers.length, 0);
  assert.equal(app.count('play'), 0);
  assert.equal(app.count('progress'), 1);
  app.cleanup();
});
