'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { API_URL, ApiError } from "@/lib/api";
import { printKitchenReceipt } from "@/lib/browserPrint";
import { claimBrowserPrintJob, getPrintStationSocketTicket, reportBrowserPrintJob } from "@/services/printing";

export default function PrintStationPage() {
  const [message, setMessage] = useState("Conectando à fila de impressão…");
  const [stopped, setStopped] = useState(false);

  useEffect(() => {
    let active = true;
    let running = false;
    let pending = false;
    const socket = io(`${new URL(API_URL).origin}/print-station`, {
      autoConnect: false,
      forceNew: true,
      withCredentials: true,
      auth: (done) => {
        void getPrintStationSocketTicket().then(({ ticket }) => done({ ticket }), () => done({}));
      },
    });

    async function wake() {
      if (!active) return;
      pending = true;
      if (running) return;
      running = true;
      let handledJob = false;
      try {
        while (active && pending) {
          pending = false;
          const requestedAt = performance.now();
          const job = await claimBrowserPrintJob();
          if (!active) return;
          if (!job) {
            if (!handledJob) setMessage("Estação conectada. Aguardando comandas.");
            continue;
          }
          handledJob = true;
          setMessage(job.document === "TEST" ? "Enviando via de teste…" : "Enviando comanda…");
          let submitted = false;
          try {
            submitted = await printKitchenReceipt(job, () => active && performance.now() - requestedAt < job.valid_for_ms);
          } catch {
            // A estação pode ter falhado após entregar o documento ao navegador.
          }
          await reportBrowserPrintJob(job.token, submitted);
          if (active) setMessage(submitted
            ? "Enviada para impressão. Aguardando a próxima comanda."
            : "Resultado incerto. Confira a impressora e a fila.");
          pending = true;
        }
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          stop();
          setStopped(true);
          setMessage("Vincule este navegador nas configurações da cozinha.");
        } else {
          setMessage("Conexão indisponível. Tentando reconectar…");
        }
      } finally {
        running = false;
      }
    }

    const reconcile = () => {
      if (!active) return;
      if (!socket.active) socket.connect();
      void wake();
    };
    const onDisconnect = (reason: string) => {
      if (reason === "io server disconnect") void wake();
    };
    socket.on("connect", wake);
    socket.on("print:available", wake);
    socket.on("disconnect", onDisconnect);
    window.addEventListener("online", reconcile);
    const fallback = window.setInterval(reconcile, 30_000);
    const initial = window.setTimeout(reconcile, 0);

    function stop() {
      active = false;
      window.clearTimeout(initial);
      window.clearInterval(fallback);
      window.removeEventListener("online", reconcile);
      socket.removeAllListeners();
      socket.disconnect();
    }

    return stop;
  }, []);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12">
      <h1 className="text-3xl font-bold">Estação de impressão da cozinha</h1>
      <p role="status" className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-800">{message}</p>
      {stopped ? (
        <Link href="/admin/cozinha/configuracoes" className="mt-4 inline-block text-sm underline">Abrir configurações de impressão</Link>
      ) : (
        <p className="mt-4 text-sm text-slate-600">Mantenha esta aba aberta e o computador ligado para receber os pedidos.</p>
      )}
    </main>
  );
}
