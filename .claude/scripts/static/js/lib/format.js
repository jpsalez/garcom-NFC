// @ts-check
import { h } from './dom.js';

export const hh = t => t ? new Date(t).toLocaleTimeString('pt-BR') : '--';
export const fmtDur = ms => { if (ms == null || ms < 0) return ''; const s = Math.round(ms / 1000); if (s < 60) return s + 's'; const m = Math.floor(s / 60); if (m < 60) return m + 'min ' + (s % 60) + 's'; return Math.floor(m / 60) + 'h ' + (m % 60) + 'min'; };
export const fmtN = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' mi' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.', ',') + ' mil' : String(n);
export const ago = ts => { const d = Date.now() / 1000 - ts; if (d < 90) return 'agora'; if (d < 3600) return Math.round(d / 60) + ' min'; if (d < 86400) return Math.round(d / 3600) + ' h'; return Math.round(d / 86400) + ' d'; };
export const dayLabel = ts => { const d = new Date(ts * 1000), t = new Date(); const dd = Math.floor((+new Date(t.getFullYear(), t.getMonth(), t.getDate()) - +new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000); return dd === 0 ? 'Hoje' : dd === 1 ? 'Ontem' : d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }); };
/* ---------- Dicionário ---------- */
export const norm = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
