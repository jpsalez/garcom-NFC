// @ts-check
import { $, h } from '../lib/dom.js';

/* ---------- markdown seguro (sem innerHTML) ---------- */
export function inline(txt) {
  const f = document.createDocumentFragment();
  txt.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/).forEach(p => {
    if (!p) return;
    if (p[0] === '`' && p.endsWith('`') && p.length > 2) f.append(h('code', '', p.slice(1, -1)));
    else if (p.startsWith('**') && p.endsWith('**') && p.length > 4) f.append(h('b', '', p.slice(2, -2)));
    else if (p[0] === '*' && p.endsWith('*') && p.length > 2) f.append(h('i', '', p.slice(1, -1)));
    else { const m = p.match(/^\[([^\]]+)\]\((https?:[^)]+)\)$/); if (m) { const a = h('a', '', m[1]); a.href = m[2]; a.target = '_blank'; a.rel = 'noopener noreferrer'; f.append(a); } else f.append(document.createTextNode(p)); }
  });
  return f;
}
export function md(text) {
  const root = h('div', 'md'), L = text.split('\n'); let i = 0;
  const isList = l => /^\s*([-*]|\d+\.)\s+/.test(l), isTab = l => /^\s*\|.*\|\s*$/.test(l);
  while (i < L.length) {
    const l = L[i];
    if (/^```/.test(l)) { const b = []; i++; while (i < L.length && !/^```/.test(L[i])) b.push(L[i++]); i++; const pre = h('pre'); pre.append(h('code', '', b.join('\n'))); root.append(pre); continue; }
    const hm = l.match(/^(#{1,4})\s+(.*)/); if (hm) { const e = h('h' + Math.min(hm[1].length + 2, 6)); e.append(inline(hm[2])); root.append(e); i++; continue; }
    if (isList(l)) { const ul = h(/^\s*\d+\./.test(l) ? 'ol' : 'ul'); while (i < L.length && isList(L[i])) { const li = h('li'); li.append(inline(L[i].replace(/^\s*([-*]|\d+\.)\s+/, ''))); ul.append(li); i++; } root.append(ul); continue; }
    if (isTab(l) && i + 1 < L.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(L[i + 1])) {
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(x => x.trim()); const t = h('table'), hd = h('tr'); cells(l).forEach(c => { const th = h('th'); th.append(inline(c)); hd.append(th); }); t.append(hd); i += 2;
      while (i < L.length && isTab(L[i])) { const tr = h('tr'); cells(L[i]).forEach(c => { const td = h('td'); td.append(inline(c)); tr.append(td); }); t.append(tr); i++; } root.append(t); continue;
    }
    if (!l.trim()) { i++; continue; }
    const buf = []; while (i < L.length && L[i].trim() && !/^```/.test(L[i]) && !isList(L[i]) && !/^#{1,4}\s/.test(L[i]) && !isTab(L[i])) buf.push(L[i++]);
    const p = h('p'); p.append(inline(buf.join(' ').replace(/ {2,}/g, ' '))); root.append(p);
  }
  return root;
}
