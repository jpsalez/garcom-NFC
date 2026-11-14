// URL que vai no QR Code / NFC da mesa (DEC-05): o domínio vem do .env, nunca digitado à mão
export function tablePublicUrl(code: string) {
  return `${String(process.env.PUBLIC_APP_URL).replace(/\/$/, "")}/m/${code}`;
}
