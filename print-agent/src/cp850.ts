const CP850_HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»" +
  "░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤" +
  "ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´\u00ad±‗¾¶§÷¸°¨·¹³²■\u00a0";

const CHAR_TO_BYTE = new Map<string, number>();

for (let i = 0; i < 128; i++) {
  CHAR_TO_BYTE.set(String.fromCharCode(i), i);
}
for (let i = 0; i < CP850_HIGH.length; i++) {
  const ch = CP850_HIGH[i];
  if (ch) CHAR_TO_BYTE.set(ch, 128 + i);
}

const TYPOGRAPHY_FALLBACK: Record<string, string> = {
  "\u2013": "-",
  "\u2014": "-",
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2026": "...",
};

function encodeChar(char: string): number {
  const mapped = TYPOGRAPHY_FALLBACK[char];
  if (mapped && mapped.length === 1) return CHAR_TO_BYTE.get(mapped) ?? 0x3f;
  const direct = CHAR_TO_BYTE.get(char);
  if (direct !== undefined) return direct;
  const base = char.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const fallback = base.length === 1 ? CHAR_TO_BYTE.get(base) : undefined;
  return fallback ?? 0x3f;
}

export function encodeCp850(text: string): Buffer {
  const bytes: number[] = [];
  for (const char of text) {
    const replacement = TYPOGRAPHY_FALLBACK[char];
    if (replacement && replacement.length > 1) {
      for (const ch of replacement) bytes.push(encodeChar(ch));
    } else {
      bytes.push(encodeChar(char));
    }
  }
  return Buffer.from(bytes);
}

export function decodeCp850(data: Uint8Array): string {
  let out = "";
  for (const byte of data) {
    if (byte < 128) out += String.fromCharCode(byte);
    else out += CP850_HIGH[byte - 128] ?? "?";
  }
  return out;
}
