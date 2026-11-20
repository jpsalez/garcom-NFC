import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const testedExports = {};
runInNewContext(ts.transpileModule(
  readFileSync(new URL('../components/landing/render-budget.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText, { exports: testedExports });
const { createRenderBudget } = testedExports;

test('mantém 60 fps com pequenas variações de tempo, sem perder um frame a cada arredondamento', () => {
  const budget = createRenderBudget(false);
  let paints = 0;
  for (let frame = 0; frame <= 120; frame++) {
    if (budget.tick(frame * 1000 / 60 + (frame % 2 ? -0.15 : 0.15))) paints++;
  }
  assert.equal(paints, 121);
});

test('limita o desenho a 60 fps em monitor de 120 Hz e a 30 fps no perfil econômico', () => {
  for (const [lowPower, expected] of [[false, 61], [true, 31]]) {
    const budget = createRenderBudget(lowPower);
    let paints = 0;
    for (let frame = 0; frame <= 120; frame++) if (budget.tick(frame * 1000 / 120)) paints++;
    assert.equal(paints, expected);
  }
});

test('reduz resolução sob atraso sustentado e recupera lentamente após estabilizar', () => {
  const budget = createRenderBudget(false);
  let time = 0;
  budget.tick(time);
  for (let frame = 0; frame < 40; frame++) budget.tick(time += 35);
  assert.equal(budget.scale, 0.45);
  for (let frame = 0; frame < 400; frame++) budget.tick(time += 1000 / 60);
  assert.equal(budget.scale, 0.5);
});

test('respeita o piso de resolução e não confunde pausa da aba com lentidão', () => {
  const budget = createRenderBudget(true);
  let time = 0;
  budget.tick(time);
  for (let frame = 0; frame < 200; frame++) budget.tick(time += 80);
  assert.equal(budget.scale, 0.25);
  budget.reset();
  assert.equal(budget.tick(time + 60000), true);
  assert.equal(budget.tick(time + 60001), false);
  assert.equal(budget.scale, 0.25);
});
