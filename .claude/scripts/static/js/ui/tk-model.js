// @ts-check
// Regras da tela Tarefas, sem DOM: o que é "pronta", "bloqueada", quanto uma tarefa "destrava" e qual é a fase atual.

export const FASES = ['Agora', 'MVP-1', 'MVP-2', 'MVP-3', 'Pós-MVP'];
export const STATUS = { 'a-fazer': 'A fazer', fazendo: 'Fazendo', bloqueada: 'Bloqueada', feita: 'Feita', arquivada: 'Arquivada' };
export const PRIORIDADES = ['P0', 'P1', 'P2', 'P3'];
const FECHADAS = new Set(['feita', 'arquivada']);

/**
 * @typedef {{ id: string, titulo: string, status: string, fase: string, prioridade: string, depende_de?: string[], bloqueada_por_decisao?: string | string[],
 *   criterios?: string[], arquivos?: string[], motivo?: string, atualizada_em?: string, descricao?: string, modulo?: string, refs?: string, quem?: string, notas?: string }} Task
 * @typedef {{ pendentes: { id: string, titulo: string, bloqueia: string[] }[], resolvidas: any[], tarefas_bloqueadas: string[] }} Decisoes
 */

/** @param {Task[]} tasks @param {Decisoes} decisoes */
export function criarModelo(tasks, decisoes) {
  const porId = new Map(tasks.map(t => [t.id, t]));
  const pendentes = new Map(decisoes.pendentes.map(d => [d.id, d]));
  /** @type {Map<string, string[]>} quem depende de quem */
  const dependentes = new Map();
  tasks.forEach(t => (t.depende_de || []).forEach(d => { if (!dependentes.has(d)) dependentes.set(d, []); /** @type {string[]} */ (dependentes.get(d)).push(t.id); }));

  const aberta = (/** @type {Task} */ t) => !FECHADAS.has(t.status);
  const decisoesDe = (/** @type {Task} */ t) => { const d = t.bloqueada_por_decisao; return d ? (typeof d === 'string' ? [d] : d) : []; };
  const decisoesPendentes = (/** @type {Task} */ t) => decisoesDe(t).filter(d => pendentes.has(d));
  const dependenciasPendentes = (/** @type {Task} */ t) => (t.depende_de || []).filter(i => { const x = porId.get(i); return !!x && aberta(x); });

  /** A fazer, sem dependência aberta e sem decisão pendente. */
  const pronta = (/** @type {Task} */ t) => t.status === 'a-fazer' && !dependenciasPendentes(t).length && !decisoesPendentes(t).length;
  const bloqueada = (/** @type {Task} */ t) => t.status === 'bloqueada' || (t.status === 'a-fazer' && !pronta(t));

  /** Texto curto do que impede a tarefa (vazio quando nada impede). */
  function motivoBloqueio(/** @type {Task} */ t) {
    if (t.status === 'arquivada') return t.motivo ? 'arquivada: ' + t.motivo : 'arquivada';
    if (!aberta(t)) return '';
    const partes = [];
    const deps = dependenciasPendentes(t), decs = decisoesPendentes(t);
    if (decs.length) partes.push(`decisão ${decs.join(', ')} pendente`);
    if (deps.length) partes.push(`depende de ${deps.join(', ')}`);
    if (!partes.length && t.status === 'bloqueada') partes.push(t.motivo || 'bloqueada');
    return partes.join(' · ');
  }

  /** @type {Map<string, number>} */ const memo = new Map();
  /** Quantas tarefas abertas dependem desta, direta ou indiretamente. */
  function destrava(/** @type {string} */ id) {
    if (memo.has(id)) return /** @type {number} */ (memo.get(id));
    const vistos = new Set();
    const anda = (/** @type {string} */ k) => (dependentes.get(k) || []).forEach(d => { const t = porId.get(d); if (t && aberta(t) && !vistos.has(d)) { vistos.add(d); anda(d); } });
    anda(id); memo.set(id, vistos.size); return vistos.size;
  }

  /** Primeira fase (na ordem do roadmap) que ainda tem tarefa aberta. */
  const faseAtual = () => FASES.find(f => tasks.some(t => t.fase === f && aberta(t))) || FASES[FASES.length - 1];
  /** Progresso de uma fase: feitas / (tudo que não está arquivado). */
  function progressoFase(/** @type {string} */ fase) {
    const l = tasks.filter(t => t.fase === fase && t.status !== 'arquivada'), feitas = l.filter(t => t.status === 'feita').length;
    return { feitas, total: l.length, pct: l.length ? Math.round(feitas / l.length * 100) : 0 };
  }
  function contagem(/** @type {string} */ fase) {
    const l = tasks.filter(t => t.fase === fase);
    return { fazendo: l.filter(t => t.status === 'fazendo').length, prontas: l.filter(pronta).length, bloqueadas: l.filter(bloqueada).length };
  }

  /** Decisões pendentes que travam tarefas e quantas tarefas ficam travadas (também pela cadeia de dependências). */
  function bloqueioPorDecisao() {
    const direto = tasks.filter(t => aberta(t) && decisoesPendentes(t).length);
    const travadas = new Set(direto.map(t => t.id));
    const anda = (/** @type {string} */ k) => (dependentes.get(k) || []).forEach(d => { const t = porId.get(d); if (t && aberta(t) && !travadas.has(d)) { travadas.add(d); anda(d); } });
    direto.forEach(t => anda(t.id));
    const quais = decisoesPendentes_ordenadas();
    return { decisoes: quais.length, tarefas: travadas.size, lista: quais };
  }
  /** Decisões pendentes ordenadas pelo quanto travam. */
  function decisoesPendentes_ordenadas() {
    return decisoes.pendentes.map(d => {
      const travadas = new Set(d.bloqueia);
      const anda = (/** @type {string} */ k) => (dependentes.get(k) || []).forEach(x => { const t = porId.get(x); if (t && aberta(t) && !travadas.has(x)) { travadas.add(x); anda(x); } });
      d.bloqueia.forEach(anda);
      return { id: d.id, titulo: d.titulo, diretas: d.bloqueia.length, total: travadas.size };
    }).filter(d => d.diretas > 0).sort((a, b) => b.total - a.total);
  }

  const modulos = () => [...new Set(tasks.map(t => t.modulo).filter(Boolean))].sort();
  /** @param {Task} a @param {Task} b ordem de trabalho: prioridade, depois quem mais destrava, depois id */
  const porTrabalho = (a, b) => a.prioridade.localeCompare(b.prioridade) || destrava(b.id) - destrava(a.id) || a.id.localeCompare(b.id);

  return { tasks, porId, aberta, pronta, bloqueada, motivoBloqueio, destrava, faseAtual, progressoFase, contagem, bloqueioPorDecisao, modulos, porTrabalho, decisoesPendentes, dependenciasPendentes };
}

/** Próximo status ao clicar na bolinha: a-fazer → fazendo → feita → a-fazer; bloqueada volta para a-fazer. @param {string} s */
export const proximoStatus = s => ({ 'a-fazer': 'fazendo', fazendo: 'feita', feita: 'a-fazer', bloqueada: 'a-fazer' }[/** @type {'fazendo'} */ (s)] || 'a-fazer');
