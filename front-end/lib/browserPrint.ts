import type { BrowserPrintJob } from "@/lib/printingTypes";

export function kitchenReceipt(job: BrowserPrintJob) {
  const document = job.document;
  if (document === "TEST") return [`PSIU · VIA DE TESTE\nBobina de ${job.paper_width} mm\nConferência de impressão · Açúcar, pão e café`];
  const createdAt = new Date(document.created_at).toLocaleString("pt-BR");
  return [
    [document.reprint?.label ?? "PSIU · COMANDA DA COZINHA", document.table_label, `Pedido ${document.order_id}`, createdAt].join("\n"),
    ...document.items.map((item) => [
      `${item.quantity}x ${item.product_name}${item.variant_name ? ` · ${item.variant_name}` : ""}`,
      ...item.selections.map((choice) => `  + ${choice.quantity}x ${choice.group_name ? `${choice.group_name}: ` : ""}${choice.option_name}`),
      ...(item.notes ? [`Obs.: ${item.notes}`] : []),
    ].join("\n")),
  ];
}

function receiptFrame(job: BrowserPrintJob) {
  const frame = document.createElement("iframe");
  frame.title = "Documento de impressão da cozinha";
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  Object.assign(frame.style, { position: "fixed", left: "-1000px", top: "0", width: "320px", height: "200px", border: "0" });
  document.body.append(frame);
  const target = frame.contentDocument;
  const view = frame.contentWindow;
  if (!target || !view) {
    frame.remove();
    throw new Error("Não foi possível preparar a comanda.");
  }

  target.title = job.document === "TEST" ? "Psiu · Via de teste" : "Psiu · Comanda da cozinha";
  target.documentElement.lang = "pt-BR";
  const style = target.createElement("style");
  const contentWidth = job.paper_width === 58 ? 48 : 72;
  style.textContent = `
    @page { size: auto; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { color: black; width: ${contentWidth}mm; max-width: 100%; font: 9pt/1.35 monospace; }
    p { margin: 0 0 2.5mm; white-space: pre-wrap; overflow-wrap: anywhere; break-inside: avoid; }
    p:first-child { border-bottom: 1px dashed black; padding: 1mm 0 2mm; }
  `;
  target.head.append(style);
  for (const block of kitchenReceipt(job)) {
    const paragraph = target.createElement("p");
    paragraph.textContent = block;
    target.body.append(paragraph);
  }
  return { frame, target, view };
}

export async function printKitchenReceipt(job: BrowserPrintJob, shouldPrint: () => boolean) {
  const { frame, target, view } = receiptFrame(job);
  try {
    await target.fonts.ready;
    if (!shouldPrint()) return false;
    return await new Promise<boolean>((resolve) => {
      const finish = (submitted: boolean) => {
        window.clearTimeout(timeout);
        view.removeEventListener("afterprint", didPrint);
        resolve(submitted);
      };
      const didPrint = () => finish(true);
      const timeout = window.setTimeout(() => finish(false), 60_000);
      view.addEventListener("afterprint", didPrint, { once: true });
      try {
        view.print();
      } catch {
        finish(false);
      }
    });
  } finally {
    frame.remove();
  }
}
