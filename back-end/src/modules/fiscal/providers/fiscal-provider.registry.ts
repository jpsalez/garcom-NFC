import { inject, injectable } from "tsyringe";
import type { fiscal_provider_type } from "../../../../generated/prisma/enums.ts";
import type { IFiscalProvider } from "./fiscal-provider.interface.ts";

@injectable()
export class FiscalProviderRegistry {
  constructor(
    @inject("MockFiscalProvider") private mock: IFiscalProvider,
    @inject("NotaasProvider") private notaas: IFiscalProvider,
    @inject("FocusNfeProvider") private focus: IFiscalProvider,
  ) {}

  get(kind: fiscal_provider_type): IFiscalProvider {
    if (kind === "NOTAAS") return this.notaas;
    if (kind === "FOCUS_NFE") return this.focus;
    return this.mock;
  }
}
