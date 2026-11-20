import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function load(path, dependencies, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(source, { exports, require: (name) => dependencies[name], ...globals });
  return exports;
}

function setup(responses = []) {
  const requests = [];
  let cleared = 0;
  const session = { clearSession: () => { cleared++; }, saveSession: () => {} };
  const fetch = async (url, options) => {
    requests.push({ url, ...options });
    return responses.shift() ?? new Response('{}', { status: 200 });
  };
  const api = load('../lib/api.ts', { '@/lib/session': session }, { fetch, FormData, process });
  const globals = { URLSearchParams, FormData };
  return {
    menu: load('../services/menu.ts', { '@/lib/api': api }, globals),
    orders: load('../services/orders.ts', { '@/lib/api': api }, globals),
    requests,
    get cleared() { return cleared; },
  };
}

test('consulta pública codifica mesa e não tenta renovar sessão administrativa em erro 401', async () => {
  const app = setup([new Response(JSON.stringify({ code: 'INVALID_TABLE', message: 'Inválida' }), { status: 401 })]);
  await assert.rejects(app.menu.getTableMenu('mesa/1'), (error) => error.status === 401 && error.code === 'INVALID_TABLE');
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].url, 'http://localhost:4000/api/v1/public/tables/mesa%2F1/menu');
  assert.equal(app.cleared, 0);
});

test('edição envia versão do rascunho e publicação preserva os dados', async () => {
  const app = setup();
  await app.menu.updateMenuProduct('id/1', { expected_version: 4, name: 'Prato' });
  await app.menu.publishMenu({ expected_version: 5 });
  assert.equal(app.requests[0].url, 'http://localhost:4000/api/v1/menu/products/id%2F1');
  assert.equal(app.requests[0].method, 'PATCH');
  assert.equal(app.requests[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(app.requests[0].body), { expected_version: 4, name: 'Prato' });
  assert.deepEqual(JSON.parse(app.requests[1].body), { expected_version: 5 });
});

test('upload preserva multipart e deixa o navegador definir o boundary', async () => {
  const app = setup();
  await app.menu.uploadMenuMedia(new File(['imagem'], 'produto.png', { type: 'image/png' }));
  const request = app.requests[0];
  assert.equal(request.url, 'http://localhost:4000/api/v1/media');
  assert.equal(request.method, 'POST');
  assert.equal(request.headers['Content-Type'], undefined);
  assert.equal(request.body.get('file').name, 'produto.png');
});

test('pedido envia token e chave de submissão sem renovar sessão administrativa', async () => {
  const app = setup([new Response(JSON.stringify({ code: 'INVALID_TOKEN', message: 'Token inválido' }), { status: 401 })]);
  const body = { submission_key: 'chave-1', publication_id: 'publicacao', items: [] };
  await assert.rejects(app.orders.submitOrder('token-mesa', body), (error) => error.code === 'INVALID_TOKEN');
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].headers['X-Table-Token'], 'token-mesa');
  assert.deepEqual(JSON.parse(app.requests[0].body), body);
  assert.equal(app.cleared, 0);
});

test('filtros e identificadores dos pedidos são codificados na URL', async () => {
  const app = setup();
  await app.orders.listDeviceOrders('token', { limit: 10, cursor: 'a/b+c' });
  await app.orders.listOrderEvents('pedido/1', { after_sequence: 0, limit: 20 });
  assert.equal(app.requests[0].url, 'http://localhost:4000/api/v1/public/orders?limit=10&cursor=a%2Fb%2Bc');
  assert.equal(app.requests[1].url, 'http://localhost:4000/api/v1/orders/pedido%2F1/events?after_sequence=0&limit=20');
});
