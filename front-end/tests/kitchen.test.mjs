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
    ...globals,
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

    if (user) {
      const { default: AdminNav } = load('../components/adminComponents/adminNav.tsx', {
        'next/link': { default: ({ href, children }) => React.createElement('a', { href }, children) },
        '@/lib/kitchenQueue': kitchen,
      });
      const nav = renderToStaticMarkup(React.createElement(AdminNav, { user, pathname: '/admin/cozinha', onNavigate: () => {} }));
      assert.equal(nav.includes('href="/admin/cozinha"'), allowed, JSON.stringify(user));
    }
  }
});

test('consulta percorre todos os cursores da fila aberta e ordena as etapas da mais antiga para a mais recente', async () => {
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
  const { incoming, preparing, pickup } = groupKitchenOrders(items);
  assert.deepEqual(Array.from(incoming, (order) => order.id), ['prep-a', 'new']);
  assert.deepEqual(Array.from(preparing, (order) => order.id), ['prep-old', 'prep-b']);
  assert.deepEqual(Array.from(pickup, (order) => order.id), ['ready-old', 'prep-b', 'ready-new', 'new']);
  assert.equal(items[0].id, 'new');
});

test('painel KDS exibe mesa, código curto, espera com alerta, itens limpos e botões discretos no rodapé', () => {
  const order = {
    id: '1587c93d-4d34-424d-ac44-30e20ab13012',
    table_label: 'Mesa 12',
    created_at: '2026-11-19T18:00:00Z',
    ready_since: '2026-11-19T18:56:00Z',
    progress: { pending: 2, preparing: 3, ready: 1 },
    items: [{
      id: 'mixed', name: 'Hambúrguer', variant_name: 'Grande', notes: 'Sem cebola',
      selections: [{ option_id: 'cheese', name: 'Queijo', quantity: 2 }],
      pending_quantity: 2, preparing_quantity: 3, ready_quantity: 1,
    }, {
      id: 'settled', name: 'Item entregue',
      pending_quantity: 0, preparing_quantity: 0, ready_quantity: 0, delivered_quantity: 1,
    }],
  };
  const orderWarning = {
    id: 'abcdef12-0000-0000-0000-000000000000',
    table_label: 'Mesa 5',
    created_at: '2026-11-19T18:50:00Z',
    progress: { pending: 1, preparing: 0, ready: 0 },
    items: [{
      id: 'single', name: 'Suco de Laranja', variant_name: '500ml', notes: null,
      selections: [],
      pending_quantity: 1, preparing_quantity: 0, ready_quantity: 0,
    }],
  };
  const orderNormal = {
    id: '99887766-0000-0000-0000-000000000000',
    table_label: 'Mesa 2',
    created_at: '2026-11-19T18:59:00Z',
    ready_since: '2026-11-19T19:00:00Z',
    progress: { pending: 0, preparing: 0, ready: 2 },
    items: [{
      id: 'ready-item', name: 'Batata Frita', variant_name: 'Pequena', notes: null,
      selections: [],
      pending_quantity: 0, preparing_quantity: 0, ready_quantity: 2,
    }],
  };
  const feedback = load('../components/orderComponents/orderQueueFeedback.tsx');
  const {
    default: CozinhaPage,
    buildStartPreparationOperations,
    buildReadyOperations,
  } = load('../components/cozinhaComponents/cozinhaPage.tsx', {
    react: { useEffect: () => {}, useState: () => [0] },
    '@/components/orderComponents/orderQueueFeedback': feedback,
    '@/hooks/useOrderQueue': { useOrderQueue: () => ({
      snapshot: {
        items: [order, orderWarning, orderNormal],
        server_time: '2026-11-19T19:02:09Z',
        loadedAt: 0,
      },
      degraded: false,
      denied: false,
      disabled: false,
    }) },
    '@/lib/format': load('../lib/format.ts'),
    '@/lib/orderAlerts': load('../lib/orderAlerts.ts'),
    '@/lib/kitchenQueue': load('../lib/kitchenQueue.ts'),
  });
  const card = renderToStaticMarkup(React.createElement(CozinhaPage));
  for (const label of [
    'Cozinha', 'Ao vivo', 'Mesa 12', '#1587C9', `title="${order.id}"`,
    'Espera 1:02:09', 'Em preparo', '3×', 'Hambúrguer', 'Grande', '+ 2× Queijo',
    'Obs: Sem cebola', '2×', 'Aguardando garçom', 'Pronto há 6:09', 'Pronto há 2:09',
    'Mesa 5', '#ABCDEF', 'Novo', '1×', 'Suco de Laranja',
    'Mesa 2', '#998877', 'Batata Frita', 'Pronto',
  ]) {
    assert.ok(card.includes(label), label);
  }
  assert.match(card, /data-wait-level="critical"/);
  assert.match(card, /data-wait-level="warning"/);
  assert.match(card, /data-wait-level="normal"/);
  assert.match(card, /md:grid-cols-3/);
  assert.match(card, />Iniciar preparo<\/button>/);
  assert.match(card, />Pronto<\/button>/);
  assert.doesNotMatch(card, /<input\b/i);
  assert.doesNotMatch(card, /<dt>Novas<\/dt>|<dt>Em preparo<\/dt>|<dt>Prontas<\/dt>/);
  assert.doesNotMatch(card, /Item entregue|Marcar entregue|Cancelar itens/);
  assert.doesNotMatch(card, /1 novo</);
  assert.doesNotMatch(card, /2 prontos</);

  assert.deepEqual(structuredClone(buildStartPreparationOperations(order)), [
    { item_id: 'mixed', from_stage: 'PENDING', to_stage: 'PREPARING', quantity: 2 },
  ]);
  assert.deepEqual(structuredClone(buildReadyOperations(order)), [
    { item_id: 'mixed', from_stage: 'PREPARING', to_stage: 'READY', quantity: 3 },
  ]);
  assert.deepEqual(structuredClone(buildReadyOperations({
    items: [
      { id: 'a', pending_quantity: 2, preparing_quantity: 1, ready_quantity: 0 },
      { id: 'b', pending_quantity: 3, preparing_quantity: 0, ready_quantity: 0 },
      { id: 'c', pending_quantity: 0, preparing_quantity: 0, ready_quantity: 2 },
    ],
  })), [
    { item_id: 'a', from_stage: 'PREPARING', to_stage: 'READY', quantity: 1 },
  ]);
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function queueHarness() {
  const { createOrderQueue } = load('../lib/orderQueue.ts');
  const reads = [];
  let state;
  const queue = createOrderQueue(() => {
    const read = deferred();
    reads.push(read);
    return read.promise;
  }, (next) => { state = next; }, (err) => err.status === 403, 10);
  return { queue, reads, state: () => state };
}

test('rajadas invalidam a leitura em curso e disparam uma única reconciliação completa', async () => {
  const { queue, reads, state } = queueHarness();
  try {
    queue.refresh();
    queue.event();
    queue.event();
    queue.event();
    await tick(20);
    assert.equal(reads.length, 1);
    reads[0].resolve({ items: ['antigo'] });
    await tick();
    assert.equal(state()?.snapshot ?? null, null);
    assert.equal(reads.length, 2);
    reads[1].resolve({ items: ['atual'] });
    await tick();
    assert.equal(state().snapshot.items[0], 'atual');
  } finally {
    queue.stop();
  }
});

test('reconciliação obrigatória bloqueia ações até atualizar; acesso negado esvazia a fila', async () => {
  const { queue, reads, state } = queueHarness();
  try {
    queue.refresh();
    reads[0].resolve({ items: ['pedido'] });
    await tick();
    assert.equal(queue.canOperate(), true);
    queue.requireRefresh();
    assert.equal(queue.canOperate(), false);
    reads[1].reject(new Error('rede'));
    await tick();
    assert.equal(state().degraded, true);
    assert.equal(state().snapshot.items[0], 'pedido');
    assert.equal(queue.canOperate(), false);
    queue.refresh();
    reads[2].reject({ status: 403 });
    await tick();
    assert.equal(state().denied, true);
    assert.equal(state().snapshot, null);
    assert.equal(queue.canOperate(), false);
    queue.refresh();
    reads[3].resolve({ items: ['recuperado'] });
    await tick();
    assert.equal(queue.canOperate(), true);
    assert.equal(state().snapshot.items[0], 'recuperado');
  } finally {
    queue.stop();
  }
});

test('um ciclo encerrado ignora respostas que chegaram depois da troca de sessão', async () => {
  const { queue, reads, state } = queueHarness();
  queue.refresh();
  queue.stop();
  reads[0].resolve({ items: ['outra sessão'] });
  await tick();
  assert.equal(state()?.snapshot ?? null, null);
  assert.equal(queue.canOperate(), false);
});

test('o painel reconcilia no foco, polling e reconexão e bloqueia após mudança de categoria', async () => {
  const { createOrderQueue, emptyOrderQueue } = load('../lib/orderQueue.ts');
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const handlers = new Map();
  const socket = {
    active: true,
    connected: false,
    on: (name, listener) => handlers.set(name, listener),
    connect() {},
    disconnect() {},
    removeAllListeners: () => handlers.clear(),
  };
  class ApiError extends Error {
    constructor(status, code, message) { super(message); this.status = status; this.code = code; }
  }
  const user = { id: 'employee', restaurant_id: 'restaurant', role: 'STAFF', category: 'KITCHEN' };
  const current = { ...user };
  const { canAccessKitchen } = load('../lib/kitchenQueue.ts');
  const ref = { current: null };
  const state = [];
  let stateIndex = 0;
  let cleanup;
  let poll;
  let reads = 0;
  const writes = [];
  let version = 1;
  const { useOrderQueue: evaluateOrderQueue } = load('../hooks/useOrderQueue.ts', {
    react: {
      useRef: () => ref,
      useEffect: (effect) => { cleanup ??= effect(); },
      useState: () => {
        const index = stateIndex++;
        return [state[index], (next) => { state[index] = typeof next === 'function' ? next(state[index]) : next; }];
      },
    },
    'socket.io-client': { io: () => socket },
    '@/lib/api': { API_URL: 'http://localhost:4000/api/v1', ApiError },
    '@/lib/orderQueue': {
      emptyOrderQueue,
      createOrderQueue: (read, publish, isDenied) => createOrderQueue(read, publish, isDenied, 0),
    },
    '@/lib/session': { useSession: () => ({ user }) },
    '@/lib/orderAlerts': load('../lib/orderAlerts.ts'),
    '@/services/auth': { getCurrentUser: async () => ({ ...current }) },
    '@/services/orders': {
      listOpenOrders: async () => {
        reads++;
        return { items: [{ id: 'order', version, progress: { ready: 0 } }], server_time: new Date().toISOString() };
      },
      transitionOrder: async (id, body) => {
        writes.push({ id, ...body });
        if (body.expected_version !== version) throw new ApiError(409, 'ORDER_VERSION_CONFLICT', 'Pedido mudou');
        version++;
      },
    },
  }, { window, document, URL, performance, setInterval: (callback) => { poll = callback; }, clearInterval: () => {} });
  function render() {
    stateIndex = 0;
    return evaluateOrderQueue(canAccessKitchen);
  }
  const operation = { item_id: 'item', from_stage: 'PENDING', to_stage: 'PREPARING', quantity: 1 };
  try {
    render();
    await tick();
    assert.equal(reads, 1);
    assert.equal(render().degraded, true);

    socket.connected = true;
    handlers.get('connect')();
    await tick();
    assert.equal(reads, 2);
    assert.equal(render().degraded, false);

    document.visibilityState = 'hidden';
    poll();
    handlers.get('order:created')();
    assert.equal(reads, 2);
    document.visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    await tick(10);
    assert.equal(reads, 3);
    poll();
    await tick();
    assert.equal(reads, 4);

    const previous = render().snapshot.items[0];
    version++;
    await render().change(previous, operation);
    await tick();
    const refreshed = render();
    assert.equal(refreshed.snapshot.items[0].version, 2);
    assert.equal(refreshed.conflict.version, 1);
    assert.equal(writes.length, 1, 'a ação não é reenviada automaticamente');
    await refreshed.change(refreshed.snapshot.items[0], operation);
    await tick();
    assert.equal(writes[1].expected_version, 2);

    const batch = [
      { item_id: 'item-1', from_stage: 'PENDING', to_stage: 'PREPARING', quantity: 2 },
      { item_id: 'item-2', from_stage: 'PENDING', to_stage: 'PREPARING', quantity: 1 },
    ];
    await render().change(render().snapshot.items[0], batch);
    await tick();
    assert.equal(writes[2].expected_version, 3);
    assert.deepEqual(writes[2].operations, batch);

    await render().change(render().snapshot.items[0], []);
    assert.equal(writes.length, 3);

    current.category = 'WAITER';
    socket.connected = false;
    handlers.get('disconnect')('io server disconnect');
    assert.equal(render().disabled, true);
    await tick();
    const denied = render();
    assert.equal(denied.denied, true);
    assert.equal(denied.snapshot, null);
    await denied.change(previous, operation);
    assert.equal(writes.length, 3);
  } finally {
    cleanup?.();
  }
});

test('a confirmação apresenta as quantidades da nova versão ou permite descartar sem confirmar', () => {
  const { default: Feedback } = load('../components/orderComponents/orderQueueFeedback.tsx');
  const conflict = {
    orderId: 'order', version: 1,
    operation: { item_id: 'item', from_stage: 'PREPARING', to_stage: 'READY', quantity: 3 },
  };
  const order = { id: 'order', version: 2, table_label: 'Mesa 1',
    items: [{ id: 'item', name: 'Lanche', preparing_quantity: 1 }] };
  const render = (queue) => renderToStaticMarkup(React.createElement(Feedback, { queue }));
  const waiting = render({ conflict, waiting: true, disabled: true, snapshot: { items: [order] } });
  assert.match(waiting, /Atualizando quantidades/);
  assert.doesNotMatch(waiting, /Confirmar: Marcar pronto/);
  const review = render({ conflict, snapshot: { items: [order] } });
  assert.match(review, /Mesa 1 · Lanche · Em preparo: 1/);
  assert.match(review, /max="1"[^>]*value="1"/);
  assert.match(review, /Confirmar: Marcar pronto/);
  const unavailable = render({ conflict, snapshot: { items: [] } });
  assert.match(unavailable, /Descartar ação/);
  assert.doesNotMatch(unavailable, /Confirmar: Marcar pronto/);

  const batchConflict = {
    orderId: 'order', version: 1,
    operations: [
      { item_id: 'item', from_stage: 'PREPARING', to_stage: 'READY', quantity: 2 },
      { item_id: 'item-2', from_stage: 'PENDING', to_stage: 'READY', quantity: 1 },
    ],
  };
  const batchReview = render({ conflict: batchConflict, snapshot: { items: [order] } });
  assert.match(batchReview, /<p>Mesa 1<\/p><ul><li>1× Lanche<\/li>/);
  assert.match(batchReview, /Confirmar: Marcar pronto/);
});

test('garçom vê e entrega somente as unidades prontas de pedidos mistos', () => {
  const { buildDeliveryOperations, default: ReadyOrders } = load('../components/garcomComponents/readyOrders.tsx', {
    '@/lib/format': load('../lib/format.ts'),
    '@/lib/orderAlerts': load('../lib/orderAlerts.ts'),
  });
  const order = {
    id: '12345678',
    table_label: 'Mesa 1',
    created_at: '2026-11-20T18:00:00Z',
    ready_since: '2026-11-20T18:03:00Z',
    progress: { pending: 1, ready: 2, delivered: 1 },
    items: [
      { id: 'dish', name: 'Prato', variant_name: 'Grande', selections: [], ready_quantity: 2, delivered_quantity: 1 },
      { id: 'drink', name: 'Suco', selections: [], pending_quantity: 1, ready_quantity: 0 },
    ],
  };
  const html = renderToStaticMarkup(React.createElement(ReadyOrders, {
    queue: { snapshot: { items: [order] }, disabled: false },
    orders: [order], now: Date.parse('2026-11-20T18:09:00Z'),
  }));

  assert.match(html, /Para servir/);
  assert.match(html, /role="status"[^>]*>1 pedido com itens prontos para servir/);
  assert.match(html, /Mesa 1/);
  assert.match(html, /2× Prato/);
  assert.match(html, /Ainda há itens em preparo/);
  assert.match(html, /Entrega atrasada · Pronto há 6:00/);
  assert.match(html, /border-red-500 bg-red-50/);
  assert.match(html, />Entregue<\/button>/);
  assert.doesNotMatch(html, /Suco|<input/);
  assert.deepEqual(structuredClone(buildDeliveryOperations(order)), [
    { item_id: 'dish', from_stage: 'READY', to_stage: 'DELIVERED', quantity: 2 },
  ]);
});

test('a página da mesa atualiza o status sem depender da abertura do histórico', async () => {
  const document = new EventTarget();
  document.hidden = false;
  let nextPoll;
  let cleanup;
  let stored;
  let calls = 0;
  const counts = [
    { pending: 0, preparing: 1, ready: 0, delivered: 0, cancelled: 0 },
    { pending: 0, preparing: 0, ready: 1, delivered: 0, cancelled: 0 },
    { pending: 0, preparing: 0, ready: 0, delivered: 1, cancelled: 0, is_completed: true },
  ];
  const react = {
    useEffect: (effect) => { if (!cleanup) cleanup = effect(); },
    useState: (initial) => initial === 0 ? [initial, () => {}] : [stored, (next) => { stored = next; }],
  };
  const { useDeviceOrders } = load('../hooks/useDeviceOrders.ts', {
    react,
    '@/lib/api': { ApiError: Error },
    '@/services/orders': {
      listDeviceOrders: async (token) => {
        assert.equal(token, 'device-token');
        return { items: [{ progress: counts[calls++] }] };
      },
    },
  }, {
    document,
    setTimeout: (callback, delay) => { assert.equal(delay, 10000); nextPoll = callback; },
    clearTimeout: () => { nextPoll = undefined; },
  });
  const { DeviceOrderSummary } = load('../components/mesaComponents/deviceOrderStatus.tsx', {
    react,
    '@/lib/device': {},
  });
  function MesaStatus() {
    const feed = useDeviceOrders('device-token');
    return React.createElement(DeviceOrderSummary, { feed, code: 'table-code' });
  }
  const renderSummary = () => renderToStaticMarkup(React.createElement(MesaStatus));

  try {
    renderSummary();
    await tick();
    assert.match(renderSummary(), /1 em preparo/);
    await nextPoll();
    assert.match(renderSummary(), /1 item pronto\. O garçom vai levá-lo à mesa/);
    await nextPoll();
    assert.match(renderSummary(), /1 item entregue/);
    assert.equal(nextPoll, undefined);
    assert.equal(calls, 3);
  } finally {
    cleanup();
  }
});

test('compara pedidos entre reconciliações e avisa de novos lotes sem repetir após a entrega parcial', () => {
  const { detectOrderAlerts } = load('../lib/orderAlerts.ts');
  const prepare = { id: 'a', table_label: 'Mesa 2', progress: { ready: 0 } };
  const ready = { ...prepare, progress: { ready: 2 }, ready_sequence: 3 };
  const newOrder = { ...prepare, id: 'b', table_label: 'Mesa 3' };
  const toPlain = structuredClone;

  assert.deepEqual(toPlain(detectOrderAlerts(undefined, [ready])), []);
  assert.deepEqual(toPlain(detectOrderAlerts([], [newOrder])), [
    { kind: 'order-new', orderId: 'b', table: 'Mesa 3' },
  ]);
  assert.deepEqual(toPlain(detectOrderAlerts([prepare], [ready])), [
    { kind: 'order-ready', orderId: 'a', table: 'Mesa 2' },
  ]);
  assert.deepEqual(toPlain(detectOrderAlerts([ready], [{ ...ready, progress: { ready: 1 } }])), []);
  assert.deepEqual(toPlain(detectOrderAlerts([ready], [{ ...ready, ready_sequence: 7 }])), [
    { kind: 'order-ready', orderId: 'a', table: 'Mesa 2' },
  ]);
});

test('avisa do atraso aos cinco minutos, repete após dois e respeita o botão de som', () => {
  const sounds = [];
  const refs = [];
  let index = 0;
  // Cada render visita os refs na mesma ordem que o React.
  const { useOrderSounds } = load('../hooks/useOrderSounds.ts', {
    react: {
      useEffect: (effect) => effect(),
      useRef: () => {
        const slot = index++;
        return refs[slot] ??= { current: undefined };
      },
    },
    '@/lib/orderAlerts': load('../lib/orderAlerts.ts'),
    '@/lib/sound': { playAlert: (...kinds) => sounds.push(...kinds) },
  });
  const start = Date.parse('2026-11-20T18:03:00Z');
  const order = { id: 'a', progress: { ready: 1 }, ready_since: new Date(start).toISOString() };
  const queue = { snapshot: { items: [order] } };

  function renderClock(minutes, soundOn, state = queue) {
    function Clock() {
      useOrderSounds(state, start + minutes * 60_000, soundOn);
      return null;
    }
    index = 0;
    renderToStaticMarkup(React.createElement(Clock));
  }

  renderClock(4, true);
  renderClock(5, true);
  renderClock(6, true);
  renderClock(7, true);
  renderClock(9, false);
  renderClock(10, true);
  renderClock(11, true);
  renderClock(13, true, { snapshot: { items: [] } });
  assert.deepEqual(sounds, ['order-overdue', 'order-overdue', 'order-overdue']);
});
