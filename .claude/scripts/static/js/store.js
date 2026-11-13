// @ts-check
// Estado único do painel. As telas leem daqui; quem atualiza é status.js (e cada tela, nos seus próprios dados).
export const S = { tab: 'visao-geral', draft: [], runs: [], sel: null, cat: null, ev: {}, open: new Set(), timers: [], liveSession: '', anSession: '', spend: null, pipes: [], view: null, live: null, statusAt: 0 };
S.teams = []; S.selTeam = null; S.closed = new Set(); S.mode = 'local';

const ativo = (/** @type {{status: string}} */ r) => r.status === 'rodando' || r.status === 'pausado';

/** Agentes rodando agora, somando as duas origens: conversas do painel e a sessão interativa do Claude Code. */
export function agentCounts() {
  const panel = S.runs.filter(ativo).length;
  const live = S.live ? S.live.agents.filter((/** @type {{status: string}} */ a) => a.status === 'rodando').length : 0;
  const pipes = S.pipes.filter((/** @type {{status: string}} */ p) => p.status === 'rodando' || p.status === 'aguardando').length;
  return { panel, live, pipes, total: panel + live };
}
