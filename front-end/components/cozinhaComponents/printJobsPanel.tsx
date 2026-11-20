'use client'

import Link from "next/link";
import { usePrintJobs } from "@/hooks/usePrintJobs";
import { canConfigurePrinting } from "@/lib/kitchenQueue";
import type { Order } from "@/lib/orderTypes";
import {
  isAttentionPrintStatus,
  printJobStatusLabel,
  printJobStatusOptions,
} from "@/lib/printingState";
import type { PrintJob, PrintJobStatus } from "@/lib/printingTypes";
import { useSession } from "@/lib/session";

function statusBadgeClass(status: PrintJobStatus) {
  if (status === "FAILED") return "bg-red-100 text-red-900";
  if (status === "UNCERTAIN") return "bg-amber-100 text-amber-950";
  if (status === "REVIEW_REQUIRED") return "bg-amber-50 text-amber-900";
  if (status === "SENT") return "bg-emerald-100 text-emerald-900";
  return "bg-slate-100 text-slate-800";
}

function cardClass(status: PrintJobStatus) {
  if (status === "FAILED") return "border-red-300 bg-red-50/70";
  if (status === "UNCERTAIN") return "border-amber-300 bg-amber-50/70";
  return "border-slate-200 bg-white";
}

export default function PrintJobsPanel({ enabled, orders }: { enabled: boolean; orders?: Order[] }) {
  const session = useSession();
  const printing = usePrintJobs(enabled);
  if (!enabled) return null;

  const tableByOrderId = new Map(orders?.map((order) => [order.id, order.table_label]) ?? []);
  const hasAttention = printing.failedCount > 0 || printing.uncertainCount > 0;

  return (
    <section aria-label="Pendências de impressão" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Impressão da cozinha</h2>
          <p className="text-sm text-slate-600">
            Acompanhe falhas e casos incertos. Confira o papel na impressora antes de solicitar segunda via.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void printing.refresh()}
            disabled={printing.loading}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 disabled:opacity-50"
          >
            {printing.loading ? "Atualizando..." : "Atualizar impressão"}
          </button>
          {session?.user && canConfigurePrinting(session.user) && (
            <Link
              href="/admin/cozinha/configuracoes"
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800"
            >
              Configurações de impressão
            </Link>
          )}
        </div>
      </div>

      {printing.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {printing.error}
        </p>
      )}

      {printing.reprintNotice && (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          {printing.reprintNotice}
        </p>
      )}

      {hasAttention && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-medium">
            Atenção na impressão: {printing.failedCount} falha(s) · {printing.uncertainCount} resultado(s) incerto(s).
          </p>
          <div className="flex flex-wrap gap-2">
            {printing.failedCount > 0 && (
              <button
                type="button"
                onClick={() => printing.changeFilter("FAILED")}
                className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Ver falhas ({printing.failedCount})
              </button>
            )}
            {printing.uncertainCount > 0 && (
              <button
                type="button"
                onClick={() => printing.changeFilter("UNCERTAIN")}
                className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Ver incertos ({printing.uncertainCount})
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="text-sm font-medium">
          Filtrar estado
          <select
            aria-label="Filtrar estado de impressão"
            value={printing.statusFilter}
            onChange={(event) => printing.changeFilter(event.target.value as "" | PrintJobStatus)}
            className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-normal"
          >
            {printJobStatusOptions.map((option) => (
              <option key={option.value || "ALL"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={printing.previousPage}
            disabled={!printing.hasPrevious || printing.loading}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="tabular-nums text-slate-600">Página {printing.pageNumber}</span>
          <button
            type="button"
            onClick={printing.nextPage}
            disabled={!printing.hasNext || printing.loading}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium disabled:opacity-50"
          >
            Próxima
          </button>
        </div>
      </div>

      {printing.attempt && (
        <form
          aria-label="Solicitar segunda via"
          className="space-y-3 rounded-xl border border-slate-300 bg-slate-50 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void printing.submitReprint();
          }}
        >
          <p className="break-all text-sm font-bold">Segunda via · Pedido {printing.attempt.orderId}</p>
          {printing.attempt.error && (
            <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">
              {printing.attempt.error}
            </p>
          )}
          <label className="block text-sm font-medium">
            Motivo da segunda via
            <input
              type="text"
              required
              minLength={3}
              maxLength={500}
              value={printing.attempt.reason}
              onChange={(event) => printing.updateReprintReason(event.target.value)}
              disabled={printing.attempt.busy}
              placeholder="Ex.: Papel acabou durante a impressão"
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={printing.attempt.busy}
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {printing.attempt.busy ? "Enviando..." : "Confirmar segunda via"}
            </button>
            <button
              type="button"
              onClick={printing.closeReprint}
              disabled={printing.attempt.busy}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {printing.jobs.length === 0 ? (
        <p className="rounded-xl border border-slate-200 p-4 text-center text-sm text-slate-600">
          {printing.error ? "Fila de impressão indisponível no momento." : "Nenhuma comanda encontrada para este filtro."}
        </p>
      ) : (
        <ul className="space-y-2">
          {printing.jobs.map((job: PrintJob) => {
            const tableLabel = tableByOrderId.get(job.order_id);
            const attention = isAttentionPrintStatus(job.status);
            return (
              <li
                key={job.id}
                data-attention={attention ? "true" : undefined}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 ${cardClass(job.status)}`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(job.status)}`}>
                      {job.status === "SENT" && job.delivery_mode === "BROWSER" ? "Enviada pelo navegador" : printJobStatusLabel[job.status]}
                    </span>
                    {tableLabel && <span className="text-sm font-bold">{tableLabel}</span>}
                    <span className="text-xs font-medium text-slate-700">
                      {job.original_job_id ? "Segunda via" : "Comanda original"}
                    </span>
                  </div>
                  <p className="break-all text-xs text-slate-600">
                    Pedido {job.order_id} · Tentativas: {job.attempts} · {new Date(job.created_at).toLocaleString("pt-BR")}
                  </p>
                  {job.reason && <p className="text-xs text-slate-700">Motivo: {job.reason}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => printing.openReprint(job.order_id)}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                >
                  Segunda via
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
