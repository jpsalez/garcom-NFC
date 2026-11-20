import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, {
    exports,
    require: (name) => {
      if (name === 'react/jsx-runtime') return jsx;
      assert.ok(name in dependencies, `Dependência ausente: ${name}`);
      return dependencies[name];
    },
    URLSearchParams,
  });
  return exports;
}

test('acesso direto a /admin/cozinha monta a consulta apenas para dono, gerente e cozinha', () => {
  const cases = [
    [undefined, false],
    [null, false, '/login'],
    [{ role: 'OWNER', category: null }, true],
    [{ role: 'STAFF', category: 'MANAGER' }, true],
    [{ role: 'STAFF', category: 'KITCHEN' }, true],
    [{ role: 'STAFF', category: 'WAITER' }, false, '/admin/waiter'],
    [{ role: 'STAFF', category: 'CLEANING' }, false, '/admin/waiter'],
    [{ role: 'STAFF', category: 'OTHER' }, false, '/admin/waiter'],
    [{ role: 'STAFF', category: null }, false, '/admin/waiter'],
    [{ role: 'SUPER_ADMIN', category: null }, false, '/admin/restaurantes'],
  ];
  const kitchen = load('../lib/kitchenQueue.ts');
  for (const [user, allowed, redirect] of cases) {
    let mounted = 0;
    const redirects = [];
    const session = user ? { user } : user;
    const requireAuth = load('../components/requireAuth.tsx', {
      react: { useEffect: (effect) => effect() },
      'next/navigation': { useRouter: () => ({ replace: (href) => redirects.push(href) }) },
      '@/lib/session': { useSession: () => session },
    });
    const { default: Cozinha } = load('../app/(app)/admin/cozinha/page.tsx', {
      '@/components/requireAuth': requireAuth,
      '@/lib/kitchenQueue': kitchen,
      '@/components/cozinhaComponents/cozinhaPage': { default: () => { mounted++; return null; } },
    });
    renderToStaticMarkup(React.createElement(Cozinha));
    assert.equal(mounted, Number(allowed), JSON.stringify(user));
    assert.deepEqual(redirects, redirect ? [redirect] : [], JSON.stringify(user));

    const { default: AdminNav } = load('../components/adminComponents/adminNav.tsx', {
      'next/link': { default: ({ href, children }) => React.createElement('a', { href }, children) },
      'next/navigation': { usePathname: () => '/admin/cozinha' },
      '@/lib/session': { useSession: () => session },
      '@/lib/kitchenQueue': kitchen,
    });
    const nav = renderToStaticMarkup(React.createElement(AdminNav));
    assert.equal(nav.includes('href="/admin/cozinha"'), allowed, JSON.stringify(user));
  }
});

test('consulta percorre todos os cursores da fila aberta e ordena as duas seções da mais antiga para a mais recente', async () => {
  const makeOrder = (id, minute, progress) => ({
    id,
    created_at: `2026-11-19T18:${minute}:00.000Z`,
    progress: { pending: 0, preparing: 0, ready: 0, delivered: 0, cancelled: 0, ...progress },
  });
  const pages = [
    { items: [makeOrder('new', '05', { pending: 2, ready: 1 })], next_cursor: 'next/1' },
    { items: [
      makeOrder('ready-new', '04', { ready: 1, delivered: 2 }),
      makeOrder('prep-b', '03', { preparing: 1, ready: 1 }),
      makeOrder('prep-a', '03', { pending: 1 }),
    ], next_cursor: 'next/2' },
    { items: [
      makeOrder('ready-old', '02', { ready: 2, cancelled: 1 }),
      makeOrder('prep-old', '01', { preparing: 1 }),
      makeOrder('settled', '00', { delivered: 1, cancelled: 1 }),
    ], next_cursor: null },
  ];
  const requests = [];
  const { listOpenOrders } = load('../services/orders.ts', {
    '@/lib/api': {
      api: async (path) => {
        requests.push(path);
        return { ...pages.shift(), server_time: '2026-11-19T18:05:15.000Z' };
      },
    },
  });
  const { groupKitchenOrders } = load('../lib/kitchenQueue.ts');
  const { items, server_time } = await listOpenOrders();
  assert.deepEqual(requests, [
    '/orders?progress=open&limit=100',
    '/orders?progress=open&limit=100&cursor=next%2F1',
    '/orders?progress=open&limit=100&cursor=next%2F2',
  ]);
  assert.equal(server_time, '2026-11-19T18:05:15.000Z');
  const { production, pickup } = groupKitchenOrders(items);
  assert.deepEqual(Array.from(production, (order) => order.id), ['prep-old', 'prep-a', 'prep-b', 'new']);
  assert.deepEqual(Array.from(pickup, (order) => order.id), ['ready-old', 'ready-new']);
  assert.equal(items[0].id, 'new');
});

test('cartão mostra a espera e os três estágios da mesma linha com variante, adicionais e observação', () => {
  const order = {
    id: '1587c93d-4d34-424d-ac44-30e20ab13012',
    table_label: 'Mesa 12',
    created_at: '2026-11-19T18:00:00Z',
    items: [{
      id: 'mixed', name: 'Hambúrguer', variant_name: 'Grande', notes: 'Sem cebola',
      selections: [{ option_id: 'cheese', name: 'Queijo', quantity: 2 }],
      pending_quantity: 2, preparing_quantity: 3, ready_quantity: 1,
    }, {
      id: 'settled', name: 'Item entregue',
      pending_quantity: 0, preparing_quantity: 0, ready_quantity: 0, delivered_quantity: 1,
    }],
  };
  const state = [{ production: [order], pickup: [] }, Date.parse('2026-11-19T19:02:09Z'), ''];
  const { default: CozinhaPage } = load('../components/cozinhaComponents/cozinhaPage.tsx', {
    react: { useEffect: () => {}, useState: () => [state.shift()] },
    '@/lib/api': {},
    '@/lib/format': load('../lib/format.ts'),
    '@/lib/kitchenQueue': load('../lib/kitchenQueue.ts'),
    '@/services/orders': {},
  });
  const card = renderToStaticMarkup(React.createElement(CozinhaPage));
  for (const label of ['Mesa 12', order.id, 'Espera 1:02:09', 'Hambúrguer', 'Grande', '2× Queijo', 'Sem cebola']) {
    assert.ok(card.includes(label), label);
  }
  assert.match(card, /<dt>Novas<\/dt><dd[^>]*>2<\/dd>/);
  assert.match(card, /<dt>Em preparo<\/dt><dd[^>]*>3<\/dd>/);
  assert.match(card, /<dt>Prontas<\/dt><dd[^>]*>1<\/dd>/);
  assert.doesNotMatch(card, /Item entregue/);
});
