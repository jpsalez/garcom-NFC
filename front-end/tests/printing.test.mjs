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

test('acesso direto a /admin/cozinha/configuracoes restringe configuração a OWNER e MANAGER e AdminNav oculta o link', () => {
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
  await printing.issueKitchenPairingCode();
  await printing.updateKitchenPrinting({ enabled: true });
  await printing.updateKitchenPrinting({ review: { job_ids: ['j1'], decision: 'RELEASE' } });
  await printing.revokeKitchenPairing();
  await printing.listPrintJobs({ destination: 'KITCHEN', status: 'FAILED', limit: 20, cursor: 'a/b+c' });
  await printing.requestOrderReprint('order/1', { idempotency_key: 'k-1', reason: 'Sem papel' });

  assert.equal(requests[0].url, 'http://localhost:4000/api/v1/printing/kitchen');
  assert.equal(requests[1].method, 'POST');
  assert.equal(requests[1].url, 'http://localhost:4000/api/v1/printing/kitchen/pairing');
  assert.equal(requests[2].method, 'PATCH');
  assert.deepEqual(JSON.parse(requests[2].body), { enabled: true });
  assert.deepEqual(JSON.parse(requests[3].body), { review: { job_ids: ['j1'], decision: 'RELEASE' } });
  assert.equal(requests[4].method, 'DELETE');
  assert.equal(
    requests[5].url,
    'http://localhost:4000/api/v1/print-jobs?destination=KITCHEN&status=FAILED&limit=20&cursor=a%2Fb%2Bc',
  );
  assert.equal(requests[6].url, 'http://localhost:4000/api/v1/orders/order%2F1/reprints');
  assert.deepEqual(JSON.parse(requests[6].body), { idempotency_key: 'k-1', reason: 'Sem papel' });
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
    '@/lib/kitchenQueue': kitchen,
  });

  const kdsHtml = renderToStaticMarkup(React.createElement(CozinhaPage));
  assert.match(kdsHtml, /Mesa 4/);
  assert.match(kdsHtml, /Pizza Margherita/);
  assert.match(kdsHtml, /<button[^>]*>Iniciar preparo<\/button>/);
  assert.match(kdsHtml, /<button[^>]*>Pronto<\/button>/);
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

test('configuração exige confirmação do teste para ativar e exibe revisão de pendências antigas', () => {
  const printingState = load('../lib/printingState.ts', { '@/lib/api': { ApiError: MockApiError } });
  const states = [
    { destination: 'KITCHEN', enabled: false, paired: true, last_contact_at: '2026-11-20T00:00:00Z' }, // status
    '2026-11-20T00:01:00Z', // serverTime
    [{ id: 'rev-1', order_id: 'ord-9', status: 'REVIEW_REQUIRED', attempts: 0, original_job_id: null, reason: null, created_at: '2026-11-20T00:00:00Z' }], // reviewJobs
    false, // reviewHasMore
    ['rev-1'], // selectedIds
    { code: '0123456789abcdef0123', expires_at: '2026-11-20T00:10:00Z' }, // pairingCode
    false, // testConfirmed
    false, // confirmingRevoke
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
  assert.match(html, /Pareado/);
  assert.match(html, /0123456789abcdef0123/);
  assert.match(html, /<button[^>]*disabled[^>]*>Ativar impressão automática<\/button>/);
  assert.match(html, /Revisão de pendências antigas/);
  assert.match(html, /Liberar selecionadas \(1\)/);
  assert.match(html, /Descartar selecionadas \(1\)/);
});
