'use client'

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { isAgentRecentlyOnline } from "@/lib/printingState";
import type { PairingCode, PrintingStatus, PrintJob, PrintReviewDecision } from "@/lib/printingTypes";
import {
  getKitchenPrinting,
  issueKitchenPairingCode,
  listPrintJobs,
  revokeKitchenPairing,
  updateKitchenPrinting,
} from "@/services/printing";

const button = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50";

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Nenhum contato registrado";
}

export default function CozinhaConfigPage() {
  const [status, setStatus] = useState<PrintingStatus | null>(null);
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [reviewJobs, setReviewJobs] = useState<PrintJob[]>([]);
  const [reviewHasMore, setReviewHasMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
  const [testConfirmed, setTestConfirmed] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [printing, pendingReview] = await Promise.all([
        getKitchenPrinting(),
        listPrintJobs({ destination: "KITCHEN", status: "REVIEW_REQUIRED", limit: 100 }),
      ]);
      setStatus(printing);
      setReviewJobs(pendingReview.jobs);
      setReviewHasMore(Boolean(pendingReview.next_cursor));
      setServerTime(pendingReview.server_time);
      setSelectedIds(pendingReview.jobs.map((job) => job.id));
      setDenied(false);
      setError("");
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setDenied(true);
        setError("Você não tem permissão para configurar a impressão da cozinha.");
      } else {
        setError(err instanceof ApiError ? err.message : "Não foi possível carregar as configurações de impressão.");
      }
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function runAction(task: () => Promise<void>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      setNotice(message);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setDenied(true);
        setError("Você não tem permissão para configurar a impressão da cozinha.");
      } else {
        // Recarrega antes de exibir o erro, porque load() limpa a mensagem anterior.
        await load();
        setError(err instanceof ApiError ? err.message : "Não foi possível concluir a operação.");
      }
    } finally {
      setBusy(false);
    }
  }

  function handleIssueCode() {
    void runAction(async () => {
      const code = await issueKitchenPairingCode();
      setPairingCode(code);
      setConfirmingRevoke(false);
    }, "Código temporário gerado. Informe-o no serviço local antes do vencimento.");
  }

  function handleToggle(enabled: boolean) {
    if (enabled && !testConfirmed) {
      setError("Confirme que a impressão de teste funcionou antes de ativar.");
      return;
    }
    void runAction(async () => {
      const updated = await updateKitchenPrinting({ enabled });
      setStatus(updated);
      if (!enabled) setTestConfirmed(false);
      await load();
    }, enabled ? "Impressão automática ativada." : "Impressão automática pausada.");
  }

  function handleRevoke() {
    void runAction(async () => {
      await revokeKitchenPairing();
      setPairingCode(null);
      setTestConfirmed(false);
      setConfirmingRevoke(false);
      await load();
    }, "Pareamento revogado e impressão automática pausada.");
  }

  function handleReview(decision: PrintReviewDecision) {
    if (selectedIds.length === 0) return;
    void runAction(async () => {
      const updated = await updateKitchenPrinting({ review: { job_ids: selectedIds, decision } });
      setStatus(updated);
      await load();
    }, decision === "RELEASE" ? "Pendências selecionadas liberadas para impressão." : "Pendências selecionadas descartadas.");
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  if (!loaded) {
    return (
      <main className="mx-auto w-full max-w-4xl p-5 sm:p-8">
        <p role="status">Carregando configurações de impressão...</p>
      </main>
    );
  }

  if (denied) {
    return (
      <main className="mx-auto w-full max-w-4xl space-y-4 p-5 sm:p-8">
        <h1 className="text-3xl font-bold">Configurações da cozinha</h1>
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>
      </main>
    );
  }

  const online = status ? isAgentRecentlyOnline(status.last_contact_at, serverTime ? Date.parse(serverTime) : undefined) : false;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-5 pb-16 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Configurações da cozinha</p>
          <h1 className="mt-1 text-3xl font-bold">Impressão automática</h1>
          <p className="mt-2 text-sm text-slate-600">
            Pareie o serviço local do computador da cozinha, confira o teste e gerencie a fila automática.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} disabled={busy} className={secondary}>
            Atualizar estado
          </button>
          <Link href="/admin/cozinha" className={secondary}>
            Voltar para a cozinha
          </Link>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}

      {!status ? (
        <button type="button" onClick={() => void load()} className={button}>Tentar novamente</button>
      ) : (
        <>
          <section aria-label="Estado do serviço de impressão" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Estado do serviço</h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Pareamento</dt>
                <dd className="mt-1 font-semibold">{status.paired ? "Pareado" : "Não pareado"}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Impressão automática</dt>
                <dd className="mt-1 font-semibold">{status.enabled ? "Ativa" : "Pausada"}</dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">Último contato</dt>
                <dd className="mt-1 text-sm font-semibold">{formatDateTime(status.last_contact_at)}</dd>
                {status.paired && status.last_contact_at && (
                  <p className="mt-1 text-xs text-slate-600">
                    {online ? "Serviço online recentemente" : "Sem contato nos últimos 5 minutos"}
                  </p>
                )}
              </div>
            </dl>
          </section>

          <section aria-label="Pareamento do serviço local" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-lg font-bold">Pareamento</h2>
              <p className="mt-1 text-sm text-slate-600">
                Gere um código temporário de uso único para conectar o serviço local ao destino Cozinha.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={handleIssueCode} disabled={busy} className={button}>
                Gerar código temporário
              </button>
              {(status.paired || pairingCode) && !confirmingRevoke && (
                <button type="button" onClick={() => setConfirmingRevoke(true)} disabled={busy} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50">
                  Revogar pareamento
                </button>
              )}
            </div>

            {confirmingRevoke && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <span>Revogar desconecta o agente atual e pausa a impressão automática.</span>
                <button type="button" onClick={handleRevoke} disabled={busy} className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                  Confirmar revogação
                </button>
                <button type="button" onClick={() => setConfirmingRevoke(false)} disabled={busy} className={secondary}>
                  Cancelar
                </button>
              </div>
            )}

            {pairingCode && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Código de pareamento</p>
                <p className="mt-1 break-all font-mono text-xl font-bold tracking-wider text-slate-900">{pairingCode.code}</p>
                <p className="mt-2 text-xs text-slate-600">
                  Validade: {formatDateTime(pairingCode.expires_at)} · Uso único (exibido apenas agora).
                </p>
              </div>
            )}
          </section>

          <section aria-label="Ativação da impressão automática" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-lg font-bold">Ativação e pausa</h2>
              <p className="mt-1 text-sm text-slate-600">
                Antes de ativar, selecione a impressora no computador da cozinha e confira a impressão de teste.
              </p>
            </div>
            {!status.enabled ? (
              <div className="space-y-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={testConfirmed}
                    onChange={(event) => setTestConfirmed(event.target.checked)}
                    disabled={busy || !status.paired}
                    className="mt-1"
                  />
                  <span>Confirmei que a impressão de teste foi concluída no computador da cozinha.</span>
                </label>
                {!status.paired && (
                  <p className="text-xs text-amber-800">Pareie o serviço local antes de ativar a impressão automática.</p>
                )}
                <button
                  type="button"
                  onClick={() => handleToggle(true)}
                  disabled={busy || !status.paired || !testConfirmed}
                  className={button}
                >
                  Ativar impressão automática
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => handleToggle(false)} disabled={busy} className={secondary}>
                Pausar impressão automática
              </button>
            )}
          </section>

          {reviewJobs.length > 0 && (
            <section aria-label="Revisão de pendências antigas" className="space-y-4 rounded-2xl border border-amber-300 bg-amber-50/70 p-5 shadow-sm">
              <div>
                <h2 className="text-lg font-bold text-amber-950">Revisão de pendências antigas</h2>
                <p className="mt-1 text-sm text-amber-900">
                  Há {reviewJobs.length} comanda(s) retida(s) durante pausa ou desconexão. Escolha quais devem ser liberadas ou descartadas.
                </p>
                {reviewHasMore && (
                  <p className="mt-1 text-xs text-amber-800">Exibindo até 100 comandas mais recentes aguardando revisão.</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedIds(selectedIds.length === reviewJobs.length ? [] : reviewJobs.map((job) => job.id))}
                  disabled={busy}
                  className={secondary}
                >
                  {selectedIds.length === reviewJobs.length ? "Desmarcar todas" : "Selecionar todas"}
                </button>
                <button
                  type="button"
                  onClick={() => handleReview("RELEASE")}
                  disabled={busy || selectedIds.length === 0}
                  className={button}
                >
                  Liberar selecionadas ({selectedIds.length})
                </button>
                <button
                  type="button"
                  onClick={() => handleReview("DISCARD")}
                  disabled={busy || selectedIds.length === 0}
                  className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
                >
                  Descartar selecionadas ({selectedIds.length})
                </button>
              </div>

              <ul className="space-y-2">
                {reviewJobs.map((job) => (
                  <li key={job.id} className="rounded-xl border border-amber-200 bg-white p-3 text-sm">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(job.id)}
                        onChange={() => toggleSelected(job.id)}
                        disabled={busy}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="break-all font-semibold">
                          Pedido {job.order_id} {job.original_job_id ? "· Segunda via" : "· Comanda original"}
                        </p>
                        <p className="text-xs text-slate-600">
                          Criada em {formatDateTime(job.created_at)} · Tentativas: {job.attempts}
                          {job.reason ? ` · Motivo: ${job.reason}` : ""}
                        </p>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
