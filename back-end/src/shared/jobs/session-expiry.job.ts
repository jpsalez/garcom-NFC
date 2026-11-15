import type { ISessionsService } from "../../modules/sessions/sessions.interfaces.ts";

const EVERY_MS = 60_000;

// Encerra de minuto em minuto os atendimentos vencidos. A consulta usa o índice parcial dos ativos, então é barata.
// Varreduras sobrepostas (backlog grande) são seguras: o encerramento é condicional. Erro numa varredura é registrado e a próxima segue. unref: o timer não impede o processo de encerrar.
export function startSessionExpiryJob(sessions: Pick<ISessionsService, "expireDue">) {
  const timer = setInterval(() => {
    sessions.expireDue().catch((err) => console.error("Falha ao encerrar atendimentos vencidos", err));
  }, EVERY_MS);
  return timer.unref();
}
