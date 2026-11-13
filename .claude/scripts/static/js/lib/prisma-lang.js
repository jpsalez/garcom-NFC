// @ts-check
// Gramática mínima do Prisma para o highlight.js (o pacote não traz uma).
/** @param {any} hljs */
export default function prisma(hljs) {
  return {
    name: 'Prisma',
    keywords: { keyword: 'model enum type view datasource generator', type: 'String Int BigInt Float Decimal Boolean DateTime Json Bytes Unsupported', literal: 'true false null' },
    contains: [
      hljs.C_LINE_COMMENT_MODE, hljs.QUOTE_STRING_MODE, hljs.C_NUMBER_MODE,
      { className: 'meta', begin: /@@?[A-Za-z_][\w.]*/ },
      { className: 'title.function', begin: /\b[a-z_][A-Za-z0-9_]*(?=\()/ },
    ],
  };
}
