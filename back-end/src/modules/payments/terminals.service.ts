import { inject, injectable } from "tsyringe";
import type { payment_terminals, provider_environment } from "../../../generated/prisma/client.ts";
import {
  type ActorContext,
  hasCapability,
  requireCapability,
} from "../../shared/authorization/capabilities.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/http-errors.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { decryptSecret } from "../../shared/utils/crypto.ts";
import { PaymentProviderAccountsRepository } from "./payment-provider-accounts.repository.ts";
import { PaymentTerminalsRepository } from "./payment-terminals.repository.ts";
import { activePointAccount, ensurePointEnvironment, pointCredentials } from "./point-account.ts";
import { signPointState, verifyPointState } from "./point-oauth-state.ts";
import type { ProviderTerminal } from "./providers/payment-provider.interface.ts";
import type { PaymentProviderRegistry } from "./providers/payment-provider.registry.ts";
import type { CreateTerminal, UpdateTerminal } from "./terminals.schemas.ts";

const configure = "terminals:configure";

function restaurantOf(actor: ActorContext) {
  if (!actor.restaurantId) throw new ForbiddenError();
  return actor.restaurantId;
}

function terminalView(terminal: payment_terminals) {
  return {
    id: terminal.id,
    provider: terminal.provider,
    external_device_id: terminal.external_device_id,
    serial_number: terminal.serial_number,
    label: terminal.label,
    active: terminal.active,
    last_seen_at: terminal.last_seen_at,
  };
}

@injectable()
export class TerminalsService {
  constructor(
    @inject("DbClient") private db: DbClient,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
    @inject("PaymentProviderRegistry") private providers: PaymentProviderRegistry,
  ) {}

  authorizationUrl(actor: ActorContext, environment: provider_environment) {
    requireCapability(actor, configure);
    return { url: this.providers.get("MERCADO_PAGO").authorizationUrl(signPointState(actor, environment)) };
  }

  async connect(actor: ActorContext, code: string, state: string) {
    requireCapability(actor, configure);
    const { restaurantId, environment } = verifyPointState(state, actor);
    const credentials = await this.providers.get("MERCADO_PAGO").exchangeCode(code, environment);
    ensurePointEnvironment(credentials.live, environment);
    const account = await this.unit.run(
      restaurantId,
      async ({ db, now }) => {
        return new PaymentProviderAccountsRepository(db).put(restaurantId, "MERCADO_PAGO", environment, {
          ...pointCredentials(credentials, now),
          external_account_id: credentials.merchantId,
          status: "ACTIVE",
        });
      },
      { actor, capability: configure },
    );
    if (!account)
      throw new ConflictError(
        "Já existe outra conta Mercado Pago vinculada",
        "PAYMENT_ACCOUNT_ALREADY_LINKED",
      );
    return { account: { id: account.id, environment: account.environment, status: account.status } };
  }

  async sync(actor: ActorContext, environment: provider_environment) {
    const { account, terminals } = await this.remoteTerminals(actor, environment);
    const synced = await this.saveTerminals(actor, account.id, terminals, { sync: true });
    return { terminals: synced.map(terminalView) };
  }

  async create(actor: ActorContext, input: CreateTerminal) {
    const { account, terminals } = await this.remoteTerminals(actor, input.environment);
    const terminal = terminals.find(({ id }) => id === input.external_device_id);
    if (!terminal) throw new NotFoundError("Terminal PDV não encontrado");
    const [saved] = await this.saveTerminals(actor, account.id, [terminal], { label: input.label });
    if (!saved) throw new NotFoundError("Terminal PDV não encontrado");
    return { terminal: terminalView(saved) };
  }

  async list(actor: ActorContext) {
    requireCapability(actor, "payments:create");
    const active = hasCapability(actor, configure) ? undefined : true;
    const terminals = await new PaymentTerminalsRepository(this.db).list(restaurantOf(actor), {
      provider: "MERCADO_PAGO",
      active,
    });
    return { terminals: terminals.map(terminalView) };
  }

  async get(actor: ActorContext, id: string) {
    requireCapability(actor, "payments:create");
    const terminal = await new PaymentTerminalsRepository(this.db).get(restaurantOf(actor), id);
    if (terminal?.provider !== "MERCADO_PAGO" || (!terminal.active && !hasCapability(actor, configure)))
      throw new NotFoundError("Terminal não encontrado");
    return { terminal: terminalView(terminal) };
  }

  async update(actor: ActorContext, id: string, input: UpdateTerminal) {
    const restaurantId = restaurantOf(actor);
    const terminal = await this.unit.run(
      restaurantId,
      async ({ db }) => {
        const repository = new PaymentTerminalsRepository(db);
        if ((await repository.get(restaurantId, id))?.provider !== "MERCADO_PAGO")
          throw new NotFoundError("Terminal não encontrado");
        return repository.update(restaurantId, id, input);
      },
      { actor, capability: configure },
    );
    return { terminal: terminalView(terminal) };
  }

  private async remoteTerminals(actor: ActorContext, environment: provider_environment) {
    requireCapability(actor, configure);
    const restaurantId = restaurantOf(actor);
    const account = activePointAccount(
      await new PaymentProviderAccountsRepository(this.db).find(restaurantId, "MERCADO_PAGO", environment),
    );
    const token = decryptSecret(account.access_token_encrypted);
    const terminals = await this.providers.get("MERCADO_PAGO").listTerminals(token);
    return { account, terminals: terminals.filter(({ operating_mode }) => operating_mode === "PDV") };
  }

  private saveTerminals(
    actor: ActorContext,
    accountId: string,
    terminals: ProviderTerminal[],
    options: { label: string } | { sync: true },
  ) {
    const restaurantId = restaurantOf(actor);
    return this.unit.run(
      restaurantId,
      async ({ db, now }) => {
        activePointAccount(await new PaymentProviderAccountsRepository(db).findById(restaurantId, accountId));
        const repository = new PaymentTerminalsRepository(db);
        if ("sync" in options) {
          await this.disableMissingTerminals(restaurantId, accountId, terminals, repository);
        }
        const saved: payment_terminals[] = [];
        for (const terminal of terminals) {
          const label = "label" in options ? options.label : undefined;
          saved.push(await this.saveTerminal(repository, restaurantId, accountId, terminal, now, label));
        }
        return saved;
      },
      { actor, capability: configure },
    );
  }

  private async disableMissingTerminals(
    restaurantId: string,
    accountId: string,
    terminals: ProviderTerminal[],
    repository: PaymentTerminalsRepository,
  ) {
    const configured = await repository.list(restaurantId, { accountId, active: true });
    const available = new Set(terminals.map(({ id }) => id));
    for (const terminal of configured) {
      if (terminal.external_device_id && !available.has(terminal.external_device_id))
        await repository.update(restaurantId, terminal.id, { active: false });
    }
  }

  private async saveTerminal(
    repository: PaymentTerminalsRepository,
    restaurantId: string,
    accountId: string,
    terminal: ProviderTerminal,
    now: Date,
    label?: string,
  ) {
    const serial = terminal.id.split("__").at(-1) || terminal.id;
    const entry = await repository.upsertSynced(restaurantId, {
      provider: "MERCADO_PAGO",
      provider_account_id: accountId,
      external_device_id: terminal.id,
      serial_number: serial,
      label: label ?? serial.slice(0, 80),
      last_seen_at: now,
    });
    if (!entry)
      throw new ConflictError("Terminal já vinculado a outra conta", "PAYMENT_TERMINAL_ALREADY_LINKED");
    return label && entry.label !== label ? repository.update(restaurantId, entry.id, { label }) : entry;
  }
}
