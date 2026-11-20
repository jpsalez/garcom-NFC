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
    setInterval,
    clearInterval,
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

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

test('Configurações oferece acesso à impressão apenas a OWNER e MANAGER, inclusive na rota direta', () => {
  const cases = [
    [undefined, false],
    [null, false, '/login'],
    [{ role: 'OWNER', category: null }, true],
    [{ role: 'STAFF', category: 'MANAGER' }, true],
    [{ role: 'STAFF', category: 'KITCHEN' }, false, '/admin/waiter'],
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
    const { default: ConfigPage } = load('../app/(app)/admin/cozinha/configuracoes/page.tsx', {
      '@/components/requireAuth': requireAuth,
      '@/lib/kitchenQueue': kitchen,
      '@/components/cozinhaComponents/cozinhaConfigPage': { default: () => { mounted++; return null; } },
    });
    renderToStaticMarkup(React.createElement(ConfigPage));
    assert.equal(mounted, Number(allowed), JSON.stringify(user));
    assert.deepEqual(redirects, redirect ? [redirect] : [], JSON.stringify(user));

    const { default: AdminNav } = load('../components/adminComponents/adminNav.tsx', {
      'next/link': { default: ({ href, children }) => React.createElement('a', { href }, children) },
      'next/navigation': { usePathname: () => '/admin/cozinha/configuracoes' },
      '@/lib/session': { useSession: () => session },
      '@/lib/kitchenQueue': kitchen,
    });
    const nav = renderToStaticMarkup(React.createElement(AdminNav));
    assert.equal(nav.includes('href="/admin/cozinha/configuracoes"'), false, JSON.stringify(user));
    assert.equal(nav.includes('href="/admin/configuracoes"'), Boolean(session), JSON.stringify(user));

    const { default: SettingsPage } = load('../components/adminComponents/settingsPage.tsx', {
      'lucide-react': { ArrowRight: () => null, KeyRound: () => null, List: () => null, Printer: () => null, UserRound: () => null },
      'next/link': { default: ({ href, children }) => React.createElement('a', { href }, children) },
      '@/lib/session': { useSession: () => session },
      '@/lib/kitchenQueue': kitchen,
    });
    const settings = renderToStaticMarkup(React.createElement(SettingsPage));
    assert.equal(settings.includes('href="/admin/configuracoes/perfil"'), Boolean(session), JSON.stringify(user));
    assert.equal(settings.includes('href="/admin/senha"'), Boolean(session), JSON.stringify(user));
    assert.equal(settings.includes('href="/admin/cozinha/configuracoes"'), allowed, JSON.stringify(user));
    assert.equal(settings.includes('href="/admin/cozinha/impressao"'), Boolean(user && kitchen.canAccessKitchen(user)));
  }
});

test('serviço de impressão codifica filtros, cursores e payloads conforme a API', async () => {
  const requests = [];
  const api = load('../lib/api.ts', { '@/lib/session': { clearSession: () => {}, saveSession: () => {} } }, {
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      return new Response('{}', { status: 200 });
    },
    FormData,
    process,
  });
  const printing = load('../services/printing.ts', { '@/lib/api': api });

  await printing.getKitchenPrinting();
  await printing.provisionKitchenPrinter();
  await printing.updateKitchenPrinting({ enabled: true });
  await printing.updateKitchenPrinting({ review: { job_ids: ['j1'], decision: 'RELEASE' } });
  await printing.revokeKitchenPrinter();
  await printing.queueKitchenPrintTest();
  await printing.listPrintJobs({ destination: 'KITCHEN', status: 'FAILED', limit: 20, cursor: 'a/b+c' });
  await printing.requestOrderReprint('order/1', { idempotency_key: 'k-1', reason: 'Sem papel' });

  assert.equal(requests[0].url, 'http://localhost:4000/api/v1/printing/kitchen');
  assert.equal(requests[1].method, 'POST');
  assert.equal(requests[1].url, 'http://localhost:4000/api/v1/printing/kitchen/printer');
  assert.equal(requests[2].method, 'PATCH');
  assert.deepEqual(JSON.parse(requests[2].body), { enabled: true });
  assert.deepEqual(JSON.parse(requests[3].body), { review: { job_ids: ['j1'], decision: 'RELEASE' } });
  assert.equal(requests[4].method, 'DELETE');
  assert.equal(requests[5].url, 'http://localhost:4000/api/v1/printing/kitchen/test');
  assert.equal(requests[5].method, 'POST');
  assert.equal(
    requests[6].url,
    'http://localhost:4000/api/v1/print-jobs?destination=KITCHEN&status=FAILED&limit=20&cursor=a%2Fb%2Bc',
  );
  assert.equal(requests[7].url, 'http://localhost:4000/api/v1/orders/order%2F1/reprints');
  assert.deepEqual(JSON.parse(requests[7].body), { idempotency_key: 'k-1', reason: 'Sem papel' });
});

test('segunda via preserva a mesma chave de idempotência ao repetir envio após falha ou 409 e exibe erro da API', async () => {
  let uuidSeq = 0;
  const mockCrypto = { randomUUID: () => `key-${++uuidSeq}` };
  const apiModule = { ApiError: MockApiError };
  const stateModule = load('../lib/printingState.ts', { '@/lib/api': apiModule }, { crypto: mockCrypto });
  const sent = [];
  let mode = 'conflict';
  const hookState = [];
  let hookIdx = 0;
  const refs = [];
  let refIdx = 0;
  let effectCleanup;

  const { usePrintJobs: evaluatePrintJobs } = load('../hooks/usePrintJobs.ts', {
    react: {
      useCallback: (fn) => fn,
      useEffect: (effect) => { effectCleanup ??= effect(); },
      useRef: (init) => (refs[refIdx] ??= { current: init }, refs[refIdx++]),
      useState: (init) => {
        const idx = hookIdx++;
        if (!(idx in hookState)) hookState[idx] = typeof init === 'function' ? init() : init;
        return [hookState[idx], (next) => { hookState[idx] = typeof next === 'function' ? next(hookState[idx]) : next; }];
      },
    },
    '@/lib/api': apiModule,
    '@/lib/printingState': stateModule,
    '@/services/printing': {
      listPrintJobs: async () => ({ jobs: [], next_cursor: null, server_time: '2026-11-20T00:00:00Z' }),
      requestOrderReprint: async (orderId, body) => {
        sent.push({ orderId, ...body });
        if (mode === 'conflict') {
          throw new MockApiError(409, 'PRINT_ORIGINAL_PENDING', 'A comanda original ainda está em andamento');
        }
        return { id: 'reprint-1', order_id: orderId, status: 'PENDING' };
      },
    },
  }, {
    crypto: mockCrypto,
  });

  const render = () => {
    hookIdx = 0;
    refIdx = 0;
    return evaluatePrintJobs(true);
  };

  try {
    render();
    await tick();

    render().openReprint('order-123');
    render().updateReprintReason('Bobina acabou');
    await render().submitReprint();

    const failed = render();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].idempotency_key, 'key-1');
    assert.equal(failed.attempt.idempotencyKey, 'key-1');
    assert.equal(failed.attempt.error, 'A comanda original ainda está em andamento');

    mode = 'ok';
    await render().submitReprint();
    const succeeded = render();
    assert.equal(sent.length, 2);
    assert.equal(sent[1].idempotency_key, 'key-1');
    assert.equal(sent[1].reason, 'Bobina acabou');
    assert.equal(succeeded.attempt, null);
    assert.match(succeeded.reprintNotice, /Segunda via solicitada/);

    render().openReprint('order-123');
    assert.equal(render().attempt.idempotencyKey, 'key-2');
  } finally {
    effectCleanup?.();
  }
});

test('falha na fila de impressão fica isolada no PrintJobsPanel e KDS segue limpo sem painel de impressão', () => {
  const order = {
    id: 'ord-1',
    table_label: 'Mesa 4',
    created_at: '2026-11-20T00:00:00Z',
    version: 1,
    progress: { pending: 2, preparing: 0, ready: 0, delivered: 0, cancelled: 0 },
    items: [{
      id: 'item-1',
      name: 'Pizza Margherita',
      variant_name: 'Média',
      notes: null,
      selections: [],
      pending_quantity: 2,
      preparing_quantity: 0,
      ready_quantity: 0,
    }],
  };
  const printingState = load('../lib/printingState.ts', { '@/lib/api': { ApiError: MockApiError } });
  const kitchen = load('../lib/kitchenQueue.ts');
  const { default: PrintJobsPanel } = load('../components/cozinhaComponents/printJobsPanel.tsx', {
    'next/link': { default: ({ href, children }) => React.createElement('a', { href }, children) },
    '@/hooks/usePrintJobs': {
      usePrintJobs: () => ({
        jobs: [],
        failedCount: 0,
        uncertainCount: 0,
        statusFilter: '',
        changeFilter: () => {},
        pageNumber: 1,
        hasPrevious: false,
        hasNext: false,
        previousPage: () => {},
        nextPage: () => {},
        loading: false,
        error: 'Serviço de impressão indisponível',
        refresh: () => {},
        attempt: null,
        reprintNotice: null,
        openReprint: () => {},
        updateReprintReason: () => {},
        closeReprint: () => {},
        submitReprint: () => {},
      }),
    },
    '@/lib/kitchenQueue': kitchen,
    '@/lib/printingState': printingState,
    '@/lib/session': { useSession: () => ({ user: { role: 'STAFF', category: 'KITCHEN' } }) },
  });

  const feedback = load('../components/orderComponents/orderQueueFeedback.tsx');
  const { default: CozinhaPage } = load('../components/cozinhaComponents/cozinhaPage.tsx', {
    react: { useEffect: () => {}, useState: () => [0] },
    '@/components/orderComponents/orderQueueFeedback': feedback,
    '@/hooks/useOrderQueue': {
      useOrderQueue: () => ({
        snapshot: { items: [order], server_time: '2026-11-20T00:01:00Z', loadedAt: 0 },
        denied: false,
        degraded: false,
        disabled: false,
        waiting: false,
        change: () => {},
      }),
    },
    '@/lib/format': load('../lib/format.ts'),
    '@/lib/orderAlerts': load('../lib/orderAlerts.ts'),
    '@/lib/kitchenQueue': kitchen,
  });

  const kdsHtml = renderToStaticMarkup(React.createElement(CozinhaPage));
  assert.match(kdsHtml, /Mesa 4/);
  assert.match(kdsHtml, /Pizza Margherita/);
  assert.match(kdsHtml, /<button[^>]*>Iniciar preparo<\/button>/);
  assert.doesNotMatch(kdsHtml, /<button[^>]*>Pronto<\/button>/);
  assert.doesNotMatch(kdsHtml, /<button[^>]*\sdisabled(?:=|\s|>)[^>]*>Iniciar preparo<\/button>/);
  assert.doesNotMatch(kdsHtml, /Serviço de impressão indisponível|Configurações de impressão/);

  const printHtml = renderToStaticMarkup(React.createElement(PrintJobsPanel, { enabled: true, orders: [order] }));
  assert.match(printHtml, /Serviço de impressão indisponível/);
  assert.doesNotMatch(printHtml, /Configurações de impressão/);
});

test('painel de impressão destaca FAILED e UNCERTAIN e exibe formulário de segunda via com erro 409', () => {
  const printingState = load('../lib/printingState.ts', { '@/lib/api': { ApiError: MockApiError } });
  const kitchen = load('../lib/kitchenQueue.ts');
  const { default: PrintJobsPanel } = load('../components/cozinhaComponents/printJobsPanel.tsx', {
    'next/link': { default: ({ href, children }) => React.createElement('a', { href }, children) },
    '@/hooks/usePrintJobs': {
      usePrintJobs: () => ({
        jobs: [
          {
            id: 'job-failed',
            order_id: 'ord-1',
            destination: 'KITCHEN',
            status: 'FAILED',
            attempts: 3,
            original_job_id: null,
            reason: null,
            created_at: '2026-11-20T00:00:00Z',
          },
          {
            id: 'job-uncertain',
            order_id: 'ord-2',
            destination: 'KITCHEN',
            status: 'UNCERTAIN',
            attempts: 1,
            original_job_id: null,
            reason: null,
            created_at: '2026-11-20T00:01:00Z',
          },
        ],
        failedCount: 1,
        uncertainCount: 1,
        statusFilter: '',
        changeFilter: () => {},
        pageNumber: 1,
        hasPrevious: false,
        hasNext: true,
        previousPage: () => {},
        nextPage: () => {},
        loading: false,
        error: null,
        refresh: () => {},
        attempt: {
          orderId: 'ord-1',
          idempotencyKey: 'key-1',
          reason: 'Sem papel',
          busy: false,
          error: 'Pedido cancelado',
        },
        reprintNotice: null,
        openReprint: () => {},
        updateReprintReason: () => {},
        closeReprint: () => {},
        submitReprint: () => {},
      }),
    },
    '@/lib/kitchenQueue': kitchen,
    '@/lib/printingState': printingState,
    '@/lib/session': { useSession: () => ({ user: { role: 'OWNER', category: null } }) },
  });

  const html = renderToStaticMarkup(React.createElement(PrintJobsPanel, {
    enabled: true,
    orders: [{ id: 'ord-1', table_label: 'Mesa 7' }],
  }));
  assert.match(html, /1 falha\(s\) · 1 resultado\(s\) incerto\(s\)/);
  assert.match(html, /data-attention="true"/);
  assert.match(html, /Mesa 7/);
  assert.match(html, /Pedido cancelado/);
  assert.match(html, /Configurações de impressão/);
  assert.match(html, /Página 1/);
});

test('configuração aguarda confirmação da impressora e exibe revisão de pendências antigas', () => {
  const printingState = load('../lib/printingState.ts', { '@/lib/api': { ApiError: MockApiError } });
  const states = [
    { destination: 'KITCHEN', enabled: false, paired: true, last_contact_at: new Date().toISOString(), test_status: 'SENDING' },
    [{ id: 'rev-1', order_id: 'ord-9', status: 'REVIEW_REQUIRED', attempts: 0, original_job_id: null, created_at: '2026-11-20T00:00:00Z' }],
    false,
    ['rev-1'],
    { url: 'https://psiu.test/api/v1/printing/cloudprnt', username: 'psiu', password: 'senha-de-teste' },
    null,
    true, // loaded
    false, // denied
    false, // busy
    '', // error
    '', // notice
  ];
  let idx = 0;
  const { default: CozinhaConfigPage } = load('../components/cozinhaComponents/cozinhaConfigPage.tsx', {
    react: {
      useCallback: (fn) => fn,
      useEffect: () => {},
      useState: () => [states[idx++], () => {}],
    },
    'next/link': { default: ({ href, children }) => React.createElement('a', { href }, children) },
    '@/lib/api': { ApiError: MockApiError },
    '@/lib/printingState': printingState,
    '@/services/printing': {},
  });

  const html = renderToStaticMarkup(React.createElement(CozinhaConfigPage));
  assert.match(html, /Conectada/);
  assert.match(html, /https:\/\/psiu.test\/api\/v1\/printing\/cloudprnt/);
  assert.match(html, /Aguardando confirmação da impressora/);
  assert.match(html, /<button[^>]*disabled[^>]*>Ativar impressão automática<\/button>/);
  assert.match(html, /Revisão de pendências antigas/);
  assert.match(html, /Liberar selecionadas \(1\)/);
  assert.match(html, /Descartar selecionadas \(1\)/);
});

test('a via de teste e a comanda são formatadas para a bobina e enviadas sem imprimir a tela da estação', async () => {
  const { printKitchenReceipt } = load('../lib/browserPrint.ts', {}, {
    document: { createElement: () => frame, body: { append: (value) => assert.equal(value, frame) } },
    window: { setTimeout, clearTimeout },
  });
  const printed = [];
  const styles = [];
  const text = [];
  let afterPrint;
  let removed = 0;
  const frame = {
    style: {},
    setAttribute() {},
    remove() { removed++; },
    contentDocument: {
      documentElement: {},
      head: { append: (style) => styles.push(style.textContent) },
      body: { append: (paragraph) => text.push(paragraph.textContent) },
      createElement: () => ({}),
      fonts: { ready: Promise.resolve() },
    },
    contentWindow: {
      addEventListener: (event, handler) => { if (event === 'afterprint') afterPrint = handler; },
      removeEventListener: () => { afterPrint = undefined; },
      print: () => { printed.push([...text]); afterPrint(); },
    },
  };

  assert.equal(await printKitchenReceipt({ paper_width: 58, document: 'TEST' }, () => true), true);
  assert.match(printed[0][0], /Bobina de 58 mm/);
  assert.match(styles[0], /width: 48mm/);

  text.length = 0;
  const order = {
    order_id: '123', table_label: 'Mesa Açucena', created_at: '2026-11-20T00:00:00Z',
    reprint: { label: 'SEGUNDA VIA' }, items: [{
      product_name: 'Café', variant_name: 'Médio', quantity: 2, notes: '<sem açúcar>',
      selections: [{ group_name: 'Acompanhamento', option_name: 'Pão', quantity: 1 }],
    }],
  };
  assert.equal(await printKitchenReceipt({ paper_width: 80, document: order }, () => true), true);
  assert.match(printed[1][0], /SEGUNDA VIA\nMesa Açucena/);
  assert.match(printed[1][1], /2x Café.*Médio\n.*Acompanhamento: Pão\nObs\.: <sem açúcar>/);
  assert.match(styles[1], /width: 72mm/);
  assert.equal(await printKitchenReceipt({ paper_width: 80, document: order }, () => false), false);
  assert.equal(printed.length, 2);
  assert.equal(removed, 3);
});

test('estação drena a fila por aviso, agrupa avisos simultâneos e consulta após reconectar ou perder um aviso', async () => {
  const listeners = new Map();
  const events = new Map();
  const queue = [];
  const printed = [];
  const reported = [];
  let requests = 0;
  let initial;
  let fallback;
  let clearedInterval;
  let cleanup;
  let release;
  const firstPrint = new Promise((resolve) => { release = resolve; });
  const socket = {
    active: false,
    on: (event, listener) => listeners.set(event, listener),
    connect: () => { socket.active = true; },
    disconnect: () => { socket.active = false; },
    removeAllListeners: () => listeners.clear(),
  };
  const { default: Station } = load('../components/cozinhaComponents/printStationPage.tsx', {
    react: {
      useEffect: (effect) => { cleanup = effect(); },
      useState: (value) => [value, () => {}],
    },
    'next/link': { default: () => null },
    'socket.io-client': {
      io: (url, options) => {
        assert.equal(url, 'https://psiu.test/print-station');
        assert.equal(options.autoConnect, false);
        return socket;
      },
    },
    '@/lib/api': { API_URL: 'https://psiu.test/api/v1', ApiError: MockApiError },
    '@/lib/browserPrint': {
      printKitchenReceipt: async (job, shouldPrint) => {
        assert.equal(shouldPrint(), true);
        printed.push(job.token);
        if (job.token === 'first') await firstPrint;
        return true;
      },
    },
    '@/services/printing': {
      claimBrowserPrintJob: async () => { requests++; return queue.shift(); },
      getPrintStationSocketTicket: async () => ({ ticket: 'test' }),
      reportBrowserPrintJob: async (token, submitted) => { assert.equal(submitted, true); reported.push(token); },
    },
  }, {
    URL, performance,
    window: {
      setTimeout: (callback, ms) => { assert.equal(ms, 0); initial = callback; return 1; },
      clearTimeout: () => {},
      setInterval: (callback, ms) => { assert.equal(ms, 30_000); fallback = callback; return 2; },
      clearInterval: (id) => { clearedInterval = id; },
      addEventListener: (event, callback) => events.set(event, callback),
      removeEventListener: (event) => events.delete(event),
    },
  });
  const job = (token) => ({ token, document: {}, valid_for_ms: 120_000 });
  renderToStaticMarkup(React.createElement(Station));

  initial();
  await tick();
  assert.equal(requests, 1);
  assert.equal(socket.active, true);

  queue.push(job('first'), job('second'));
  const drain = listeners.get('print:available')();
  await tick();
  await listeners.get('print:available')();
  await listeners.get('print:available')();
  assert.deepEqual(printed, ['first']);
  assert.equal(requests, 2);
  release();
  await drain;
  assert.deepEqual(printed, ['first', 'second']);
  assert.deepEqual(reported, printed);
  assert.equal(requests, 4);

  queue.push(job('missed'));
  fallback();
  await tick();
  assert.deepEqual(printed, ['first', 'second', 'missed']);
  queue.push(job('reconnected'));
  await listeners.get('connect')();
  assert.deepEqual(printed, ['first', 'second', 'missed', 'reconnected']);
  cleanup();
  assert.equal(clearedInterval, 2);
  assert.equal(events.size, 0);
  assert.equal(listeners.size, 0);
});
