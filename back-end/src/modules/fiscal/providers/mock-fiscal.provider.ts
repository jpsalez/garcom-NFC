import { createHash } from "node:crypto";
import { injectable } from "tsyringe";
import type {
  CancelResult,
  FiscalAccount,
  IFiscalProvider,
  NfceInput,
  NfceResult,
} from "./fiscal-provider.interface.ts";

// Só homologação local e testes: autoriza na hora, sem rede e sem validade fiscal.
function authorized(reference: string): NfceResult {
  const digits = BigInt(`0x${createHash("sha256").update(reference).digest("hex")}`)
    .toString()
    .padStart(44, "0");
  return {
    status: "AUTHORIZED",
    externalId: reference,
    accessKey: digits.slice(0, 44),
    protocol: digits.slice(0, 15),
    sefazStatus: "100",
    sefazMessage: "Autorizado o uso da NF-e (simulação)",
    qrcodeUrl: `https://nfce.simulacao.invalid/qrcode?ref=${encodeURIComponent(reference)}`,
  };
}

@injectable()
export class MockFiscalProvider implements IFiscalProvider {
  readonly kind = "MOCK";
  readonly idempotentReference = true;

  async emit(_account: FiscalAccount, input: NfceInput) {
    return authorized(input.reference);
  }

  async status(_account: FiscalAccount, externalId: string) {
    return authorized(externalId);
  }

  async cancel(): Promise<CancelResult> {
    return { state: "CANCELLED", sefazStatus: "135", sefazMessage: "Evento registrado (simulação)" };
  }
}
