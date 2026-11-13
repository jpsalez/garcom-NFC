// @ts-check
// Destaque de sintaxe com highlight.js (cópia local em static/vendor). Carrega o núcleo e cada linguagem só quando preciso.
const MAX_CHARS = 400_000;
/** @type {any} */ let core = null;
const registered = new Set();

/** @param {string} lang */
async function ensure(lang) {
  core ??= (await import('../../vendor/highlight/core.js')).default;
  if (registered.has(lang)) return;
  const mod = lang === 'prisma' ? await import('./prisma-lang.js') : await import(`../../vendor/highlight/languages/${lang}.js`);
  core.registerLanguage(lang, mod.default);
  registered.add(lang);
}

/**
 * Corta o HTML do highlight.js em linhas, fechando e reabrindo os <span> que atravessam quebras de linha.
 * @param {string} html
 */
export function splitLines(html) {
  /** @type {string[]} */ const out = [], stack = [];
  let cur = '';
  for (const m of html.matchAll(/<span[^>]*>|<\/span>|\n|[^<\n]+|</g)) {
    const t = m[0];
    if (t === '\n') { out.push(cur + '</span>'.repeat(stack.length)); cur = stack.join(''); }
    else if (t.startsWith('<span')) { stack.push(t); cur += t; }
    else if (t === '</span>') { stack.pop(); cur += t; }
    else cur += t;
  }
  out.push(cur + '</span>'.repeat(stack.length));
  return out;
}

/**
 * HTML por linha (já escapado pelo highlight.js) ou null quando não há destaque para o arquivo.
 * @param {string} text @param {string} lang
 * @returns {Promise<string[] | null>}
 */
export async function highlightLines(text, lang) {
  if (!lang || text.length > MAX_CHARS) return null;
  try {
    await ensure(lang);
    return splitLines(core.highlight(text, { language: lang, ignoreIllegals: true }).value);
  } catch (e) { return null; }
}
