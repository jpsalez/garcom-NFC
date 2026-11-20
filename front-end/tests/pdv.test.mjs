import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

function load(path, dependencies = {}, globals = {}) {
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
    setTimeout,
    clearTimeout,
    crypto,
    ...globals,
  });
  return exports;
}

class MockApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function sampleItem(overrides = {}) {
  return {
    id: 'item-1',
    product_id: 'prod-1',
    variant_id: 'var-1',
    product_name: 'Hambúrguer',
    variant_name: 'Padrão',
    unit_price_cents: 3200,
    quantity: 1,
    notes: 'Sem cebola',
    options: [{ option_id: 'opt-1', name: 'Bacon', quantity: 1, price_delta_cents: 400 }],
    ...overrides,
  };
}

test('canUsePdv e acesso a /admin/pdv permitem OWNER, MANAGER e WAITER e bloqueiam KITCHEN, CLEANING e OTHER', () => {
  const cases = [
    [undefined, false],
    [null, false, '/login'],
    [{ role: 'OWNER', category: null }, true],
    [{ role: 'STAFF', category: 'MANAGER' }, true],
    [{ role: 'STAFF', category: 'WAITER' }, true],
    [{ role: 'STAFF', category: 'KITCHEN' }, false, '/admin/waiter'],
    [{ role: 'STAFF', category: 'CLEANING' }, false, '/admin/waiter'],
    [{ role: 'STAFF', category: 'OTHER' }, false, '/admin/waiter'],
    [{ role: 'STAFF', category: null }, false, '/admin/waiter'],
    [{ role: 'SUPER_ADMIN', category: null }, false, '/admin/restaurantes'],
  ];

  const kitchen = load('../lib/kitchenQueue.ts');
  for (const [user, allowed, redirect] of cases) {
    if (user) {
      assert.equal(kitchen.canUsePdv(user), allowed, JSON.stringify(user));
    }

    let mounted = 0;
    const redirects = [];
    const session = user ? { user } : user;
    const requireAuth = load('../components/requireAuth.tsx', {
      react: { useEffect: (effect) => effect() },
      'next/navigation': { useRouter: () => ({ replace: (href) => redirects.push(href) }) },
      '@/lib/session': { useSession: () => session },
    });
    const { default: PdvRoute } = load('../app/(app)/admin/pdv/page.tsx', {
      '@/components/requireAuth': requireAuth,
      '@/lib/kitchenQueue': kitchen,
      '@/components/pdvComponents/pdvPage': { default: () => { mounted++; return null; } },
    });
    renderToStaticMarkup(React.createElement(PdvRoute));
    assert.equal(mounted, Number(allowed), JSON.stringify(user));
    assert.deepEqual(redirects, redirect ? [redirect] : [], JSON.stringify(user));

    const { default: AdminNav } = load('../components/adminComponents/adminNav.tsx', {
      'next/link': { default: ({ href, children }) => React.createElement('a', { href }, children) },
      'next/navigation': { usePathname: () => '/admin/pdv' },
      '@/lib/session': { useSession: () => session },
      '@/lib/kitchenQueue': kitchen,
    });
    const nav = renderToStaticMarkup(React.createElement(AdminNav));
    assert.equal(nav.includes('href="/admin/pdv"'), allowed, JSON.stringify(user));
  }
});

test('formatTableTab formata mesa com e sem tab_number e cartões exibem comanda e badge PDV', () => {
  const orderTypes = load('../lib/orderTypes.ts');
  assert.equal(orderTypes.formatTableTab('Mesa 5', 3), 'Mesa 5 · Comanda #3');
  assert.equal(orderTypes.formatTableTab('Mesa 5', undefined), 'Mesa 5');
  assert.equal(orderTypes.formatTableTab('Mesa 5', null), 'Mesa 5');

  const posOrder = {
    id: 'ord-pos-1',
    table_label: 'Mesa 8',
    tab_number: 14,
    source: 'POS',
    active_total_cents: 4500,
    created_at: '2026-11-20T01:00:00Z',
    progress: { pending: 1, preparing: 0, ready: 0, delivered: 0, cancelled: 0 },
    items: [{
      id: 'it-1',
      name: 'Suco de Laranja',
      variant_name: '500 ml',
      quantity: 1,
      line_total_cents: 1200,
      notes: null,
      selections: [],
      pending_quantity: 1,
      preparing_quantity: 0,
      ready_quantity: 0,
      delivered_quantity: 0,
      cancelled_quantity: 0,
    }],
  };

  const feedback = load('../components/orderComponents/orderQueueFeedback.tsx');
  const { default: CozinhaPage } = load('../components/cozinhaComponents/cozinhaPage.tsx', {
    react: { useEffect: () => {}, useState: () => [0] },
    '@/components/cozinhaComponents/printJobsPanel': { default: () => null },
    '@/components/orderComponents/orderQueueFeedback': feedback,
    '@/hooks/useOrderQueue': {
      useOrderQueue: () => ({
        snapshot: { items: [posOrder], server_time: '2026-11-20T01:01:00Z', loadedAt: 0 },
      }),
    },
    '@/lib/format': load('../lib/format.ts'),
    '@/lib/kitchenQueue': load('../lib/kitchenQueue.ts'),
    '@/lib/orderTypes': orderTypes,
  });
  const kitchenHtml = renderToStaticMarkup(React.createElement(CozinhaPage));
  assert.match(kitchenHtml, /Mesa 8 · Comanda #14/);
  assert.match(kitchenHtml, />PDV</);

  const { default: PedidosPage } = load('../components/garcomComponents/pedidosPage.tsx', {
    react: { useState: (init) => [typeof init === 'function' ? init() : init, () => {}] },
    '@/components/orderComponents/orderQueueFeedback': feedback,
    '@/hooks/useOrderQueue': {
      useOrderQueue: () => ({
        snapshot: { items: [posOrder], server_time: '2026-11-20T01:01:00Z', loadedAt: 0 },
      }),
    },
    '@/lib/orderTypes': orderTypes,
  });
  const waiterHtml = renderToStaticMarkup(React.createElement(PedidosPage));
  assert.match(waiterHtml, /Mesa 8 · Comanda #14/);
  assert.match(waiterHtml, />PDV</);
});

test('serviços de PDV chamam GET /menu/published e POST /orders', async () => {
  const requests = [];
  const api = load('../lib/api.ts', { '@/lib/session': { clearSession: () => {}, saveSession: () => {} } }, {
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      return new Response('{}', { status: 200 });
    },
    FormData,
    process,
  });
  const orders = load('../services/orders.ts', { '@/lib/api': api });

  await orders.getPublishedMenuForStaff();
  await orders.createPosOrder({
    table_id: 'tbl-1',
    publication_id: 'pub-1',
    submission_key: 'sub-1',
    items: [{ product_id: 'p1', variant_id: 'v1', quantity: 2, selections: [{ option_id: 'o1', quantity: 1 }] }],
  });

  assert.equal(requests[0].method, 'GET');
  assert.equal(requests[0].url, 'http://localhost:4000/api/v1/menu/published');
  assert.equal(requests[1].method, 'POST');
  assert.equal(requests[1].url, 'http://localhost:4000/api/v1/orders');
  assert.deepEqual(JSON.parse(requests[1].body), {
    table_id: 'tbl-1',
    publication_id: 'pub-1',
    submission_key: 'sub-1',
    items: [{ product_id: 'p1', variant_id: 'v1', quantity: 2, selections: [{ option_id: 'o1', quantity: 1 }] }],
  });
});

test('submission_key é preservada em falha incerta e regenerada ao alterar carrinho, mesa ou após sucesso', async () => {
  let seq = 0;
  const nextKey = () => `uuid-${++seq}`;
  const pdv = load('../lib/pdvState.ts', {
    '@/lib/api': { ApiError: MockApiError },
    '@/lib/kitchenQueue': load('../lib/kitchenQueue.ts'),
  });

  let state = pdv.createPdvDraft('table-1');
  state = pdv.addPdvItem(state, sampleItem());

  const sentPayloads = [];
  let mode = 'network-fail';
  const send = async (payload) => {
    sentPayloads.push(payload);
    if (mode === 'network-fail') throw new Error('Falha de rede');
    if (mode === 'revision-conflict') throw new MockApiError(409, 'MENU_REVISION_CHANGED', 'Cardápio mudou');
    return { order: { id: 'ord-1', table_label: 'Mesa 1', tab_number: 7 }, replayed: false };
  };

  // 1) Primeira tentativa falha por rede -> mantém submission_key uuid-1
  const firstFail = await pdv.submitPdvDraft(state, 'pub-1', send, nextKey);
  assert.equal(firstFail.ok, false);
  assert.equal(firstFail.uncertain, true);
  assert.equal(sentPayloads[0].submission_key, 'uuid-1');
  assert.equal(firstFail.state.submissionKey, 'uuid-1');

  // 2) Reenvio sem alterar mesa/carrinho reutiliza uuid-1
  mode = 'ok';
  const retryOk = await pdv.submitPdvDraft(firstFail.state, 'pub-1', send, nextKey);
  assert.equal(retryOk.ok, true);
  assert.equal(sentPayloads[1].submission_key, 'uuid-1');
  assert.equal(retryOk.state.items.length, 0);
  assert.equal(retryOk.state.submissionKey, null);

  // 3) Novo pedido após sucesso gera nova chave (uuid-2)
  let nextDraft = pdv.addPdvItem(retryOk.state, sampleItem({ id: 'item-2' }));
  mode = 'network-fail';
  const secondOrderFail = await pdv.submitPdvDraft(nextDraft, 'pub-1', send, nextKey);
  assert.equal(sentPayloads[2].submission_key, 'uuid-2');
  assert.equal(secondOrderFail.state.submissionKey, 'uuid-2');

  // 4) Alterar carrinho regenera chave na próxima submissão (uuid-3)
  const cartChanged = pdv.updatePdvItemQuantity(secondOrderFail.state, 'item-2', 2);
  assert.equal(cartChanged.submissionKey, null);
  const thirdFail = await pdv.submitPdvDraft(cartChanged, 'pub-1', send, nextKey);
  assert.equal(sentPayloads[3].submission_key, 'uuid-3');
  assert.equal(thirdFail.state.submissionKey, 'uuid-3');

  // 5) Alterar mesa regenera chave na próxima submissão (uuid-4)
  const tableChanged = pdv.selectPdvTable(thirdFail.state, 'table-2');
  assert.equal(tableChanged.submissionKey, null);
  mode = 'revision-conflict';
  const conflictFail = await pdv.submitPdvDraft(tableChanged, 'pub-1', send, nextKey);
  assert.equal(sentPayloads[4].submission_key, 'uuid-4');
  assert.equal(conflictFail.ok, false);
  assert.equal(conflictFail.uncertain, false);
  assert.equal(conflictFail.state.submissionKey, null);

  // 6) Remover item também invalida qualquer submissionKey pendente
  const removed = pdv.removePdvItem({ ...conflictFail.state, submissionKey: 'uuid-temp' }, 'item-2');
  assert.equal(removed.submissionKey, null);
});
