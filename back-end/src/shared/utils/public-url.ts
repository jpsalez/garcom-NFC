// URL que vai no QR Code / NFC da mesa (DEC-05): o domínio vem do .env, nunca digitado à mão
export function tablePublicUrl(code: string) {
  return `${(process.env.PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/m/${code}`;
}
