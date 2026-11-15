import nodemailer, { type Transporter } from "nodemailer";

// Os services dependem só desta interface; nos testes entra uma implementação que guarda as mensagens
export interface IMailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

// SMTP_URL no formato smtp://usuario:senha@host:587 (smtps:// para TLS direto)
export class SmtpMailer implements IMailer {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(smtpUrl: string, from: string) {
    this.transport = nodemailer.createTransport(smtpUrl);
    this.from = from;
  }

  async send(to: string, subject: string, text: string) {
    await this.transport.sendMail({ from: this.from, to, subject, text });
  }
}

// Sem SMTP_URL nada é enviado. O conteúdo não vai para o log: o link de redefinição é um segredo.
export class DisabledMailer implements IMailer {
  async send() {
    console.warn("SMTP_URL não definido: e-mail não enviado");
  }
}

export function createMailer(): IMailer {
  const url = process.env.SMTP_URL;
  return url ? new SmtpMailer(url, process.env.MAIL_FROM ?? "garcom-NFC <nao-responda@localhost>") : new DisabledMailer();
}
