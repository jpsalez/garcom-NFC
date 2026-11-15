import type { ITokenCleanupService } from "../../modules/auth/auth.interfaces.ts";

const EVERY_MS = 60 * 60 * 1000;

// De hora em hora apaga os refresh tokens e links de redefinição vencidos (a tabela só cresceria).
// Erro numa varredura é registrado e a próxima segue. unref: o timer não impede o processo de encerrar.
export function startTokenCleanupJob(cleanup: ITokenCleanupService) {
  const timer = setInterval(() => {
    cleanup.purgeExpired().catch((err) => console.error("Falha ao limpar tokens vencidos", err));
  }, EVERY_MS);
  return timer.unref();
}
