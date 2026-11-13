// Smoke test do painel: abre cada tela num chromium headless e falha se houver erro de console,
// exceção não tratada ou resposta /api com erro. Sem dependências (usa o WebSocket do Node).
//
//   node .claude/scripts/tests/smoke.mjs [--shots <pasta>] [--only tab1,tab2] [--port 8799]
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Endereços antigos que têm de continuar abrindo a tela certa. */
const REDIRECT = { geral: 'visao-geral', chat: 'conversa', projeto: 'arquivos', vivo: 'ao-vivo', tempo: 'linha-do-tempo', saude: 'saude-do-codigo' };
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('port', 8799)), CDP = PORT + 1000;
const SHOTS = arg('shots', '');
const EVAL = arg('eval', ''), NAME = arg('name', '');
const HERE = dirname(fileURLToPath(import.meta.url));
const TABS = (arg('only', '') || (process.argv.includes('--legacy') ? Object.keys(REDIRECT).join(',') : '') || 'visao-geral,conversa,orquestrar,ao-vivo,analise,linha-do-tempo,tarefas,commits,saude-do-codigo,arquivos,verificar,decisoes,dicionario').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = spawn('python3', ['-B', join(HERE, '..', 'painel.py'), '--port', String(PORT)], { stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'painel-smoke-'));
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1440,900', `--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const stop = () => { server.kill(); chrome.kill(); };
process.on('exit', stop);

async function waitFor(url) {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(url); if (r.ok || r.status < 500) return r; } catch { /* ainda subindo */ } await sleep(250); }
  throw new Error('não subiu: ' + url);
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(), listeners = [];
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else listeners.forEach(f => f(m)); };
  const ready = new Promise(res => { ws.onopen = res; });
  return { ready, on: f => listeners.push(f), close: () => ws.close(), send: (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }) };
}

async function checkTab(tab) {
  const t = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const c = connect(t.webSocketDebuggerUrl); await c.ready;
  const problems = [];
  c.on(m => {
    if (m.method === 'Runtime.exceptionThrown') problems.push('exceção: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') problems.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) problems.push(`http ${m.params.response.status}: ${m.params.response.url}`);
  });
  await Promise.all([c.send('Runtime.enable'), c.send('Log.enable'), c.send('Network.enable'), c.send('Page.enable')]);
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/#${tab}` });
  await sleep(2500);
  if (EVAL) { const ev = await c.send('Runtime.evaluate', { expression: EVAL, awaitPromise: true, returnByValue: true }); if (ev.result.exceptionDetails) problems.push('eval: ' + (ev.result.exceptionDetails.exception?.description || ev.result.exceptionDetails.text)); else if (ev.result.result.value !== undefined) console.log('      eval →', JSON.stringify(ev.result.result.value)); await sleep(1200); }
  const probe = await c.send('Runtime.evaluate', { expression: `JSON.stringify({title:document.querySelector('#title')?.textContent, main:document.querySelector('#main')?.children.length, err:document.body.dataset.err||'', hash:location.hash, current:document.querySelector('nav [aria-current=page]')?.dataset.tab||'', unlabeled:[...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(e=>!e.getAttribute('aria-label')&&!e.closest('label')&&!e.labels?.length).length})`, returnByValue: true });
  const info = JSON.parse(probe.result.result.value || '{}');
  const want = (REDIRECT[tab.split('?')[0]] || tab.split('?')[0]).split('/')[0];
  if (info.hash.slice(1).split('?')[0].split('/')[0] !== want) problems.push(`endereço ${info.hash} (esperado #${want})`);
  if (info.current !== want) problems.push(`menu sem aria-current em ${want} (achou "${info.current}")`);
  if (info.unlabeled) problems.push(`${info.unlabeled} campo(s) sem rótulo acessível`);
  if (info.err) problems.push('window.onerror: ' + info.err);
  if (!info.main) problems.push('área principal vazia');
  if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); const s = await c.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SHOTS, `${NAME || tab.replace(/[^a-z0-9]+/gi, '_')}.png`), Buffer.from(s.result.data, 'base64')); }
  c.close(); await fetch(`http://127.0.0.1:${CDP}/json/close/${t.id}`);
  return { tab, title: info.title, problems };
}

try {
  await waitFor(`http://127.0.0.1:${PORT}/`); await waitFor(`http://127.0.0.1:${CDP}/json/version`);
  let bad = 0;
  for (const tab of TABS) {
    const r = await checkTab(tab);
    console.log((r.problems.length ? 'FALHA ' : 'ok    ') + tab.padEnd(11) + ' ' + (r.title || ''));
    r.problems.forEach(p => console.log('      · ' + p)); bad += r.problems.length;
  }
  console.log(bad ? `\n${bad} problema(s)` : '\ntodas as telas sem erro');
  process.exitCode = bad ? 1 : 0;
} catch (e) { console.error(e.message); process.exitCode = 2; } finally { stop(); }
