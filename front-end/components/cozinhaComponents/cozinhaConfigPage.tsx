'use client'

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { isPrinterRecentlyOnline } from "@/lib/printingState";
import type { PrintDeliveryMode, PrinterSetup, PrintingStatus, PrintJob, PrintPaperWidth, PrintReviewDecision } from "@/lib/printingTypes";
import {
  connectBrowserPrintStation,
  getKitchenPrinting,
  provisionKitchenPrinter,
  listPrintJobs,
  revokeKitchenPrinter,
  queueKitchenPrintTest,
  updateKitchenPrinting,
  verifyBrowserPrintTest,
} from "@/services/printing";

const button = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const secondary = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50";

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Nenhum contato registrado";
}

export default function CozinhaConfigPage() {
  const [status, setStatus] = useState<PrintingStatus | null>(null);
  const [reviewJobs, setReviewJobs] = useState<PrintJob[]>([]);
  const [reviewHasMore, setReviewHasMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [setup, setSetup] = useState<PrinterSetup | null>(null);
  const [confirmation, setConfirmation] = useState<"replace" | "revoke" | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [chosenMode, setChosenMode] = useState<PrintDeliveryMode | null>(null);
  const [chosenWidth, setChosenWidth] = useState<PrintPaperWidth | null>(null);

  const mode = chosenMode ?? status?.mode ?? "CLOUDPRNT";
  const paperWidth = chosenWidth ?? status?.paper_width ?? 80;
  const browserStation = status?.mode === "BROWSER";

  const load = useCallback(async () => {
    try {
      const [printing, pendingReview] = await Promise.all([
        getKitchenPrinting(),
        listPrintJobs({ destination: "KITCHEN", status: "REVIEW_REQUIRED", limit: 100 }),
      ]);
      setStatus(printing);
      setReviewJobs(pendingReview.jobs);
      setReviewHasMore(Boolean(pendingReview.next_cursor));
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

  const paired = status?.paired ?? false;
  useEffect(() => {
    if (!paired || busy || denied) return;
    let active = true;
    const timer = window.setInterval(async () => {
      try {
        const latest = await getKitchenPrinting();
        if (active) setStatus(latest);
      } catch (err) {
        if (active && err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          setSetup(null);
          setDenied(true);
          setError("Você não tem permissão para configurar a impressão da cozinha.");
        }
      }
    }, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [paired, busy, denied]);

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

  function handleProvision() {
    setConfirmation(null);
    setSetup(null);
    if (mode === "BROWSER") {
      void runAction(async () => {
        await connectBrowserPrintStation(paperWidth);
        await load();
      }, "Navegador vinculado. Abra a estação neste computador para receber as comandas.");
      return;
    }
    void runAction(async () => {
      setSetup(await provisionKitchenPrinter());
      await load();
    }, "Credenciais geradas. Configure a impressora para conectá-la.");
  }

  function handleVerifyTest() {
    if (!status?.test_id) return;
    const token = status.test_id;
    void runAction(async () => {
      setStatus(await verifyBrowserPrintTest(token));
    }, "Via de teste confirmada.");
  }

  function handleTest() {
    void runAction(async () => {
      setStatus(await queueKitchenPrintTest());
    }, "Teste colocado na fila de impressão.");
  }

  function handleToggle(enabled: boolean) {
    void runAction(async () => {
      await updateKitchenPrinting({ enabled });
      await load();
    }, enabled ? "Impressão automática ativada." : "Impressão automática pausada.");
  }

  function handleRevoke() {
    void runAction(async () => {
      await revokeKitchenPrinter();
      setSetup(null);
      setConfirmation(null);
      await load();
    }, "Impressora desconectada e impressão automática pausada.");
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

  const online = status ? isPrinterRecentlyOnline(status.last_contact_at) : false;

  const testInProgress = status?.test_status === "PENDING" || status?.test_status === "SENDING";
  const testPassed = status?.test_status === "SENT";
  const testConfirmed = status?.test_confirmed ?? false;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-5 pb-16 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Configurações da cozinha</p>
          <h1 className="mt-1 text-3xl font-bold">Impressão automática</h1>
          <p className="mt-2 text-sm text-slate-600">
            Escolha como a cozinha vai receber as comandas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void load()} disabled={busy} className={secondary}>
            Atualizar estado
          </button>
          <Link href="/admin/configuracoes" className={secondary}>
            Voltar às configurações
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
                <dt className="text-xs text-slate-500">{browserStation ? "Navegador da cozinha" : "Impressora de rede"}</dt>
                <dd className="mt-1 font-semibold">
                  {online ? "Conectada" : status.paired ? "Aguardando conexão" : "Não configurada"}
                </dd>
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
                    {online ? "Contato recente" : "Sem contato nos últimos 5 minutos"}
                  </p>
                )}
              </div>
            </dl>
          </section>

          <section aria-label="Conexão da impressora" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-lg font-bold">Conexão da impressora</h2>
              <label className="mt-3 block text-sm font-medium">
                Modo de impressão
                <select value={mode} onChange={(event) => {
                  setChosenMode(event.target.value === "BROWSER" ? "BROWSER" : "CLOUDPRNT");
                  setConfirmation(null);
                  setSetup(null);
                }} disabled={busy} className="mt-1 block rounded-lg border border-slate-300 bg-white p-2">
                  <option value="CLOUDPRNT">Star CloudPRNT</option>
                  <option value="BROWSER">Navegador da cozinha · USB ou Bluetooth</option>
                </select>
              </label>
              {mode === "BROWSER" ? (
                <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-600">
                  <li>Neste computador, conecte a térmica e defina-a como impressora padrão no Windows.</li>
                  <li>Use o Edge 144 ou posterior com a política de impressão silenciosa habilitada.</li>
                  <li>Vincule o navegador, abra a estação e mantenha a aba aberta.</li>
                </ol>
              ) : (
                <p className="mt-3 text-sm text-slate-600">
                  Na Star mC-Print3 de 80 mm, use firmware 3.2 ou posterior e informe a URL e as credenciais no painel CloudPRNT.
                </p>
              )}
              {mode === "BROWSER" && (
                <label className="mt-3 block text-sm font-medium">
                  Largura da bobina
                  <select value={paperWidth} onChange={(event) => setChosenWidth(event.target.value === "58" ? 58 : 80)}
                    disabled={busy} className="mt-1 block rounded-lg border border-slate-300 bg-white p-2">
                    <option value={58}>58 mm</option>
                    <option value={80}>80 mm</option>
                  </select>
                </label>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => status.paired ? setConfirmation("replace") : handleProvision()} disabled={busy} className={button}>
                {mode === "BROWSER" ? "Vincular este navegador" : status.paired ? "Gerar novas credenciais" : "Gerar credenciais"}
              </button>
              {status.paired && (
                <button type="button" onClick={() => setConfirmation("revoke")} disabled={busy} className={secondary}>
                  {browserStation ? "Desvincular estação" : "Desconectar impressora"}
                </button>
              )}
            </div>
            {browserStation && status.paired && (
              <Link href="/estacao-impressao" target="_blank" rel="noopener" className={secondary + " inline-block"}>
                Abrir estação de impressão
              </Link>
            )}
            {confirmation && (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                <p>A credencial atual será revogada e a impressão automática ficará pausada.</p>
                <button type="button" className={button} disabled={busy} onClick={confirmation === "replace" ? handleProvision : handleRevoke}>
                  {confirmation === "replace" ? "Confirmar troca" : "Confirmar desconexão"}
                </button>
                <button type="button" className={secondary} disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</button>
              </div>
            )}
            {setup && (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <p>Copie os dados para o painel da impressora. A senha só aparece ao gerar as credenciais.</p>
                <label className="block">URL do servidor<input className="mt-1 w-full rounded border px-2 py-1 font-mono" readOnly value={setup.url} /></label>
                <label className="block">Usuário<input className="mt-1 w-full rounded border px-2 py-1 font-mono" readOnly value={setup.username} /></label>
                <label className="block">Senha<input className="mt-1 w-full rounded border px-2 py-1 font-mono" readOnly value={setup.password} /></label>
                <button type="button" className={secondary} onClick={() => setSetup(null)}>Ocultar credenciais</button>
              </div>
            )}
          </section>

          <section aria-label="Teste e ativação" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Teste e ativação</h2>
            <p className="text-sm text-slate-600">Envie uma via de teste e confira o papel antes de ativar a impressão dos pedidos.</p>
            <button type="button" onClick={handleTest} disabled={busy || !online || testInProgress} className={secondary}>
              Imprimir via de teste
            </button>
            {testInProgress && <p role="status" className="text-sm">
              {browserStation ? "Aguardando envio pela estação." : "Aguardando confirmação da impressora."}
            </p>}
            {browserStation && testPassed && !testConfirmed && (
              <div className="space-y-2">
                <p className="text-sm">Confirme se a via saiu no papel sem abrir uma janela de impressão.</p>
                <button type="button" onClick={handleVerifyTest} disabled={busy} className={secondary}>A via saiu automaticamente</button>
              </div>
            )}
            {testConfirmed && <p role="status" className="text-sm text-emerald-800">
              {browserStation ? "Via de teste confirmada." : "A impressora confirmou a via de teste."}
            </p>}
            {status.test_status === "FAILED" && <p role="status" className="text-sm text-amber-800">O teste expirou antes de ser retirado. Verifique a impressora e tente novamente.</p>}
            {status.test_status === "UNCERTAIN" && <p role="status" className="text-sm text-amber-800">Resultado do teste incerto. Confira o papel antes de tentar novamente.</p>}
            <button
              type="button"
              onClick={() => handleToggle(!status.enabled)}
              disabled={busy || (!status.enabled && (!online || !testConfirmed))}
              className={status.enabled ? secondary : button}
            >
              {status.enabled ? "Pausar impressão automática" : "Ativar impressão automática"}
            </button>
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
