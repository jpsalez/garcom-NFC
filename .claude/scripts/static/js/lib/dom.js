// @ts-check
export const $ = (s, r = document) => r.querySelector(s);
export const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = txt; return e; };
const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
  flow: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7.5l3 8M16 7.5l-3 8"/>', chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>', folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>', scale: '<path d="M12 4v16M6 20h12M5 8h14M5 8l-2 6a3 3 0 0 0 6 0zM19 8l-2 6a3 3 0 0 0 6 0z"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>', pause: '<path d="M9 5v14M15 5v14"/>', play: '<path d="M7 4l13 8-13 8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', clip: '<path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>', chev: '<path d="M9 6l6 6-6 6"/>',
  diamond: '<path d="M12 3l9 9-9 9-9-9z"/>', spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>',
  git: '<circle cx="6" cy="6" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="9" r="2.2"/><path d="M6 8.2v7.6M18 11.2c0 4-6 3-11 5.6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', heart: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
  file: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>', filecode: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10.5 13l-2 2 2 2M13.5 13l2 2-2 2"/>', filetext: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  fileconf: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><circle cx="13" cy="15" r="2"/>', filedb: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><ellipse cx="13" cy="13" rx="3" ry="1.4"/><path d="M10 13v3.5c0 .8 1.3 1.4 3 1.4s3-.6 3-1.4V13"/>', folderopen: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H8l-3 8z"/><path d="M3 18l3-8h17l-3 8z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>', person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>', wrap: '<path d="M4 6h16M4 12h12a3 3 0 0 1 0 6h-3m0 0l2-2m-2 2l2 2M4 18h5"/>', external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  github: '<path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.500 1.300a12 12 0 0 0-6.200 0C6.500 2.800 5.400 3.100 5.400 3.100a4.200 4.200 0 0 0-.1 3.200A4.600 4.600 0 0 0 4 9.500c0 4.600 2.700 5.700 5.500 6-.6.600-.6 1.200-.5 2V21"/>', pr: '<circle cx="6" cy="6" r="2.200"/><circle cx="6" cy="18" r="2.200"/><circle cx="18" cy="18" r="2.200"/><path d="M6 8.200v7.600M18 15.800V9a3 3 0 0 0-3-3h-3m2.500-2.500L12 6l2.500 2.500"/>', issue: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.500"/>', run: '<circle cx="12" cy="12" r="9"/><path d="M10 8.500l5 3.500-5 3.500z"/>', command: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 1 2-2h13"/><path d="M9 7h6"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};
export function ico(n) { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i'); s.innerHTML = ICONS[n] || ''; return s; }
export function countUp(el, to, fmt = v => Math.round(v).toLocaleString('pt-BR')) { if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(to); return; } const t0 = performance.now(), dur = 900; const f = now => { const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(to * e); if (p < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); }
export function stagger(parent) { [...parent.children].forEach((c, i) => { c.classList.add('rise'); c.style.setProperty('--i', i); }); }

/** Elemento SVG com atributos. @param {string} tag @param {Record<string, string | number>} [attrs] */
export function svgEl(tag, attrs = {}) { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v))); return e; }
