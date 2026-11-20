import sharp from "sharp";
import type { PrinterDocument } from "./printing.interfaces.ts";

const width = 576;
const lineHeight = 30;
const margin = 16;
const columns = 37;

function wrap(line: string) {
  const characters = Array.from(line.replace(/[\p{Cc}\p{Cf}]/gu, " "));
  const lines: string[] = [];
  while (characters.length > columns) {
    const space = characters.lastIndexOf(" ", columns);
    const end = space > 0 ? space : columns;
    lines.push(characters.splice(0, end).join(""));
    if (space > 0) characters.shift();
  }
  lines.push(characters.join(""));
  return lines;
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function ticketLines(payload: PrinterDocument) {
  if (payload === "TEST") return ["PSIU · IMPRESSÃO DE TESTE", "", "Impressora da cozinha conectada."];
  const shortId = payload.order_id.slice(0, 6).toUpperCase();
  const time = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" });
  return [
    payload.reprint?.label ?? "PSIU · COMANDA DA COZINHA",
    `Mesa: ${payload.table_label}`,
    `Pedido #${shortId} · ${time.format(new Date(payload.created_at))} UTC`,
    ...payload.items.flatMap((item) => [
      "",
      `${item.quantity}x ${item.product_name}${item.variant_name ? ` · ${item.variant_name}` : ""}`,
      ...item.selections.map((choice) => `  + ${choice.quantity}x ${choice.option_name}`),
      ...(item.notes ? item.notes.split(/\r?\n/).map((note) => `  Obs: ${note}`) : []),
    ]),
  ];
}

export function renderTicket(payload: PrinterDocument) {
  const lines = ticketLines(payload).flatMap(wrap);
  const height = lines.length * lineHeight + margin * 2;
  const text = lines.map((line, i) =>
    `<text x="${margin}" y="${margin + (i + 1) * lineHeight - 5}">${escapeXml(line)}</text>`,
  ).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="white"/>
    <g font-family="DejaVu Sans Mono, monospace" font-size="24" xml:space="preserve">${text}</g>
  </svg>`;
  return sharp(Buffer.from(svg)).greyscale().threshold().png({ palette: true, colours: 2 }).toBuffer();
}
