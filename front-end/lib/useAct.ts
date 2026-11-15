'use client'
import { useState } from "react";
import { ApiError } from "@/lib/api";

// Executa uma ação do painel e recarrega a tela no fim: se outra pessoa agiu antes (404/409), a tela volta a refletir o servidor.
// Devolve true se a ação deu certo (para limpar formulários).
export function useAct(reload: () => Promise<unknown>) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false); // evita duplo clique (criar/excluir duas vezes)

  async function act(action: () => Promise<unknown>) {
    if (busy) return false;
    setBusy(true);
    setError("");
    let ok = true;
    try {
      await action();
    } catch (err) {
      ok = false;
      setError(err instanceof ApiError ? err.message : "Não foi possível concluir a ação.");
    }
    await reload().catch(() => setError((current) => current || "Não foi possível atualizar a lista."));
    setBusy(false);
    return ok;
  }

  return { error, busy, act };
}
