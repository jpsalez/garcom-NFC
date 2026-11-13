// @ts-check
import { $, ico } from '../lib/dom.js';

(() => { const root = document.documentElement; try { const sv = localStorage.getItem('tema'); if (sv) root.dataset.theme = sv; } catch (e) { }
  const b = $('#theme'); b.append(ico('sun')); b.onclick = () => { const cur = root.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); const nx = cur === 'light' ? 'dark' : 'light'; root.dataset.theme = nx; try { localStorage.setItem('tema', nx); } catch (e) { } }; })();
