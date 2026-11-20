import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { type ReprintAttempt, startReprintAttempt, submitReprintAttempt } from "@/lib/printingState";
import type { PrintJob, PrintJobStatus } from "@/lib/printingTypes";
import { listPrintJobs, requestOrderReprint } from "@/services/printing";

const PAGE_LIMIT = 20;

export function usePrintJobs(enabled: boolean) {
  const [statusFilter, setStatusFilter] = useState<"" | PrintJobStatus>("");
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [failedJobs, setFailedJobs] = useState<PrintJob[]>([]);
  const [uncertainJobs, setUncertainJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<ReprintAttempt | null>(null);
  const [reprintNotice, setReprintNotice] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const [page, failed, uncertain] = await Promise.all([
        listPrintJobs({
          destination: "KITCHEN",
          status: statusFilter || undefined,
          limit: PAGE_LIMIT,
          cursor: currentCursor,
        }),
        listPrintJobs({ destination: "KITCHEN", status: "FAILED", limit: 20 }),
        listPrintJobs({ destination: "KITCHEN", status: "UNCERTAIN", limit: 20 }),
      ]);
      if (seq !== requestSeq.current) return;
      setJobs(page.jobs);
      setNextCursor(page.next_cursor);
      setFailedJobs(failed.jobs);
      setUncertainJobs(uncertain.jobs);
      setError(null);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof ApiError ? err.message : "Não foi possível consultar a fila de impressão.");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [enabled, statusFilter, currentCursor]);

  useEffect(() => {
    if (!enabled) return;
    void Promise.resolve().then(load);
    const timer = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") void load();
    }, 15000);
    return () => clearInterval(timer);
  }, [enabled, load]);

  function changeFilter(next: "" | PrintJobStatus) {
    setStatusFilter(next);
    setCursorHistory([]);
    setCurrentCursor(undefined);
  }

  function nextPage() {
    if (!nextCursor) return;
    setCursorHistory((prev) => [...prev, currentCursor]);
    setCurrentCursor(nextCursor);
  }

  function previousPage() {
    if (cursorHistory.length === 0) return;
    const previous = cursorHistory[cursorHistory.length - 1];
    setCursorHistory((prev) => prev.slice(0, -1));
    setCurrentCursor(previous);
  }

  function openReprint(orderId: string) {
    setReprintNotice(null);
    setAttempt((current) => (current?.orderId === orderId ? current : startReprintAttempt(orderId)));
  }

  function updateReprintReason(reason: string) {
    setAttempt((current) => (current ? { ...current, reason } : null));
  }

  function closeReprint() {
    setAttempt(null);
  }

  async function submitReprint() {
    if (!attempt || attempt.busy) return;
    const pendingAttempt = { ...attempt, busy: true, error: null };
    setAttempt(pendingAttempt);
    const result = await submitReprintAttempt(pendingAttempt, requestOrderReprint);
    if (result.ok) {
      setAttempt(null);
      setReprintNotice("Segunda via solicitada.");
      void load();
      return;
    }
    setAttempt(result.attempt);
  }

  return {
    jobs,
    failedCount: failedJobs.length,
    uncertainCount: uncertainJobs.length,
    statusFilter,
    changeFilter,
    pageNumber: cursorHistory.length + 1,
    hasPrevious: cursorHistory.length > 0,
    hasNext: Boolean(nextCursor),
    previousPage,
    nextPage,
    loading,
    error,
    refresh: load,
    attempt,
    reprintNotice,
    openReprint,
    updateReprintReason,
    closeReprint,
    submitReprint,
  };
}
