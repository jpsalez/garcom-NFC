import { encodeCp850 } from "./cp850.ts";
import type { PrintPayload } from "./types.ts";

// Inicialização (ESC @), página de código PC850 (ESC t 2) e corte parcial (GS V 1).
export const ESCPOS_HEADER = Buffer.from([0x1b, 0x40, 0x1b, 0x74, 0x02]);
export const ESCPOS_CUT = Buffer.from([0x1d, 0x56, 0x01]);
export const TICKET_WIDTH = 48;

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function sanitizeText(text: string): string {
  return [...text]
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 32;
      return code < 32 || code === 127 ? " " : ch;
    })
    .join("");
}

function wrapSingleLine(raw: string, width: number): string[] {
  const clean = sanitizeText(raw).trim();
  if (!clean) return [""];

  const lines: string[] = [];
  const words = clean.split(/\s+/);
  let current = "";

  const pushCurrent = () => {
    if (current) lines.push(current);
    current = "";
  };

  for (const word of words) {
    const indent = lines.length > 0 ? "  " : "";
    const prefix = current ? `${current} ` : indent;
    if (prefix.length + word.length <= width) {
      current = `${prefix}${word}`;
      continue;
    }
    pushCurrent();
    let remaining = word;
    while (remaining.length > 0) {
      const lineIndent = lines.length > 0 ? "  " : "";
      const sliceLen = Math.max(1, width - lineIndent.length);
      lines.push(`${lineIndent}${remaining.slice(0, sliceLen)}`);
      remaining = remaining.slice(sliceLen);
    }
  }
  pushCurrent();
  return lines;
}

export function wrapTicketLines(lines: string[], width = TICKET_WIDTH): string[] {
  const wrapped: string[] = [];
  for (const line of lines) {
    const segments = line.split(/\r?\n/);
    for (const segment of segments) {
      wrapped.push(...wrapSingleLine(segment, width));
    }
  }
  return wrapped;
}

export function formatTicketDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return DATE_FORMATTER.format(parsed);
}

export function renderOrderTicket(payload: PrintPayload): Buffer {
  const lines: string[] = ["COMANDA DE PRODUÇÃO"];
  if (payload.reprint?.label) {
    lines.push(payload.reprint.label);
  }
  lines.push(
    payload.table_label,
    `Pedido ${payload.order_id}`,
    formatTicketDate(payload.created_at),
    "-".repeat(TICKET_WIDTH),
  );

  for (const item of payload.items) {
    lines.push(`${item.quantity}x ${item.product_name} (${item.variant_name})`);
    for (const selection of item.selections) {
      const label = selection.group_name
        ? `${selection.group_name}: ${selection.option_name}`
        : selection.option_name;
      lines.push(`  + ${selection.quantity}x ${label}`);
    }
    if (item.notes) {
      lines.push(`  Obs.: ${item.notes}`);
    }
  }

  const body = `${wrapTicketLines(lines).join("\n")}\n\n\n`;
  return Buffer.concat([ESCPOS_HEADER, encodeCp850(body), ESCPOS_CUT]);
}

export function sampleTestPayload(): PrintPayload {
  return {
    order_id: "00000000-0000-4000-8000-000000000001",
    created_at: new Date().toISOString(),
    table_label: "Mesa Teste",
    items: [
      {
        item_id: "00000000-0000-4000-8000-000000000002",
        product_name: "Hambúrguer da casa",
        variant_name: "Duplo",
        quantity: 2,
        notes: "Sem cebola. Pão bem tostado e molho à parte.",
        selections: [
          { group_name: "Adicionais", option_name: "Queijo extra", quantity: 1 },
        ],
      },
    ],
  };
}
