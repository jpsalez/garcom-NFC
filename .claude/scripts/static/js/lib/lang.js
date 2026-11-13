// @ts-check
/** Linguagem do highlight.js a partir do nome do arquivo ('' = sem destaque). */
const BY_EXT = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', js: 'javascript', mjs: 'javascript', cjs: 'javascript', json: 'json',
  yml: 'yaml', yaml: 'yaml', prisma: 'prisma', md: 'markdown', sql: 'sql', sh: 'bash', css: 'css', html: 'xml', xml: 'xml', svg: 'xml',
  py: 'python', toml: 'ini', ini: 'ini', example: 'ini', test: 'ini', diff: 'diff', patch: 'diff',
};
const BY_NAME = { Dockerfile: 'dockerfile', '.gitignore': 'ini', '.env.example': 'ini', '.env.test': 'ini' };
export const LANG_LABEL = { typescript: 'TypeScript', javascript: 'JavaScript', json: 'JSON', yaml: 'YAML', prisma: 'Prisma', markdown: 'Markdown', sql: 'SQL', bash: 'Shell', css: 'CSS', xml: 'HTML/XML', python: 'Python', ini: 'Config', diff: 'Diff', dockerfile: 'Dockerfile' };

/** @param {string} path */
export function langOf(path) {
  const name = path.split('/').pop() || '';
  if (name in BY_NAME) return /** @type {Record<string,string>} */ (BY_NAME)[name];
  const ext = name.includes('.') ? name.split('.').pop() || '' : '';
  return /** @type {Record<string,string>} */ (BY_EXT)[ext.toLowerCase()] || '';
}
