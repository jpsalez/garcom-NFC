// Mede cada tela no chromium headless: tempo até ficar pronta, requisições /api por minuto com a tela aberta e parada,
// erros de console, bytes de JS/CSS carregados. Tira uma captura por tela.
//   node .claude/scripts/tests/medir-telas.mjs --saida <json> --shots <pasta> [--port 8901] [--idle 12]
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('port', 8901)), CDP = PORT + 1000, IDLE = Number(arg('idle', 12)), SHOTS = arg('shots', ''), SAIDA = arg('saida', '');
const TELAS = (arg('only', '') || 'visao-geral,conversa,orquestrar,ao-vivo,analise,linha-do-tempo,tarefas,commits,github,saude-do-codigo,arquivos,verificar,decisoes,dicionario').split(',');
const HERE = dirname(fileURLToPath(import.meta.url));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = spawn('python3', ['-B', join(HERE, '..', 'painel.py'), '--port', String(PORT)], { stdio: 'ignore' });
const chrome = spawn('chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1440,900', `--remote-debugging-port=${CDP}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'medir-'))}`, 'about:blank'], { stdio: 'ignore' });
const stop = () => { server.kill(); chrome.kill(); }; process.on('exit', stop);
async function waitFor(url) { for (let i = 0; i < 80; i++) { try { const r = await fetch(url); if (r.status < 500) return; } catch { /* subindo */ } await sleep(250); } throw new Error('não subiu ' + url); }
function connect(ws) { const s = new WebSocket(ws); let id = 0; const p = new Map(), L = []; s.onmessage = e => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } else L.forEach(f => f(m)); }; return { ready: new Promise(r => { s.onopen = r; }), on: f => L.push(f), close: () => s.close(), send: (method, params = {}) => new Promise(r => { const i = ++id; p.set(i, r); s.send(JSON.stringify({ id: i, method, params })); }) }; }
const EVAL = 'JSON.stringify((()=>{const r=performance.getEntriesByType("resource");return{api:r.filter(e=>e.name.includes("/api/")).length,js:r.filter(e=>/\\.js(\\?|$)/.test(e.name)).reduce((a,e)=>a+(e.encodedBodySize||0),0),css:r.filter(e=>/\\.css/.test(e.name)).reduce((a,e)=>a+(e.encodedBodySize||0),0),pronta:!document.querySelector("#main [aria-busy]")&&document.querySelector("#main")?.children.length>0}})())';
try {
  await waitFor(`http://127.0.0.1:${PORT}/`); await waitFor(`http://127.0.0.1:${CDP}/json/version`);
  const out = {};
  for (const tela of TELAS) {
    const t = await (await fetch(`http://127.0.0.1:${CDP}/json/new?about:blank`, { method: 'PUT' })).json(); const c = connect(t.webSocketDebuggerUrl); await c.ready;
    let erros = 0; c.on(m => { if (m.method === 'Runtime.exceptionThrown' || (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')) erros++; });
    await Promise.all([c.send('Runtime.enable'), c.send('Log.enable'), c.send('Page.enable')]);
    const t0 = Date.now(); await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/#${tela}` });
    let pronta = null, info = {};
    for (let i = 0; i < 200 && pronta === null; i++) { await sleep(50); try { info = JSON.parse((await c.send('Runtime.evaluate', { expression: EVAL, returnByValue: true })).result.result.value); if (info.pronta) pronta = Date.now() - t0; } catch { /* ainda carregando */ } }
    await sleep(5000);
    const a = JSON.parse((await c.send('Runtime.evaluate', { expression: EVAL, returnByValue: true })).result.result.value).api;
    await sleep(IDLE * 1000);
    const b = JSON.parse((await c.send('Runtime.evaluate', { expression: EVAL, returnByValue: true })).result.result.value);
    out[tela] = { pronta_ms: pronta, requisicoes_por_min_parada: Math.round((b.api - a) * 60 / IDLE), requisicoes_no_carregamento: a, bytes_js: b.js, bytes_css: b.css, erros_console: erros };
    if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); const s = await c.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(SHOTS, tela + '.png'), Buffer.from(s.result.data, 'base64')); }
    c.close(); await fetch(`http://127.0.0.1:${CDP}/json/close/${t.id}`); console.log(tela, JSON.stringify(out[tela]));
  }
  if (SAIDA) { mkdirSync(dirname(SAIDA), { recursive: true }); writeFileSync(SAIDA, JSON.stringify(out, null, 1)); }
} catch (e) { console.error(e.message); process.exitCode = 2; } finally { stop(); }
