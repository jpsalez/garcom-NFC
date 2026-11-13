// @ts-check
// Rótulos acessíveis para campos e botões só com ícone, sem mexer em cada tela.
const FIELDS = 'input:not([type=hidden]), select, textarea';

/** @param {Element} el */
function nomeDe(el) {
  const f = /** @type {HTMLInputElement} */ (el);
  const prev = el.previousElementSibling?.textContent?.trim();
  return el.getAttribute('title') || f.placeholder || (prev && prev.length < 40 ? prev : '') || el.closest('label')?.textContent?.trim() || /** @type {HTMLSelectElement} */ (el).options?.[0]?.text || '';
}

/** @param {ParentNode} root */
export function labelFields(root) {
  root.querySelectorAll(FIELDS).forEach(el => {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label')) return;
    if (el.id && root.querySelector(`label[for="${el.id}"]`)) return;
    const n = nomeDe(el); if (n) el.setAttribute('aria-label', n);
  });
  root.querySelectorAll('button').forEach(b => { if (!b.textContent?.trim() && !b.getAttribute('aria-label') && b.title) b.setAttribute('aria-label', b.title); });
}

/** Reaplica os rótulos quando a tela repinta pedaços (debounce curto). */
export function watchLabels(/** @type {Element} */ el) {
  let t = 0;
  new MutationObserver(() => { clearTimeout(t); t = window.setTimeout(() => labelFields(el), 80); }).observe(el, { childList: true, subtree: true });
}
