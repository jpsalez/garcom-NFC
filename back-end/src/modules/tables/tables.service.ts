import QRCode from "qrcode";
import { inject, injectable } from "tsyringe";
import type { tables } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import { ConflictError, NotFoundError } from "../../shared/errors/http-errors.ts";
import { tablePublicUrl } from "../../shared/utils/public-url.ts";
import { generatePublicCode } from "../../shared/utils/token.ts";
import { closeSessionResources, notifySessionClosed } from "../sessions/close-session.ts";
import { findOpenTableTab } from "../tabs/tabs-state.ts";
import { TableSessionRepository } from "../sessions/sessions.repository.ts";
import type { INotifier } from "../../shared/realtime/notifier.ts";
import type { ITablesService } from "./tables.interfaces.ts";
import type { ITableRepository } from "./tables.repository.interface.ts";
import type { createTableInput, updateTableInput } from "./tables.schemas.ts";
import type { IRestaurantUnitOfWork } from "../../shared/transactions/restaurant-unit-of-work.interface.ts";
import { TableRepository } from "./tables.repository.ts";

const withUrl = (table: tables) => ({ ...table, public_url: tablePublicUrl(table.public_code) });

@injectable()
export class TablesService implements ITablesService {
  private readonly tableRepository: ITableRepository;

  constructor(
    @inject("TableRepository") tableRepository: ITableRepository,
    @inject("Notifier") private notifier: INotifier,
    @inject("RestaurantUnitOfWork") private unit: IRestaurantUnitOfWork,
  ) {
    this.tableRepository = tableRepository;
  }

  async list(restaurantId: string) {
    return (await this.tableRepository.findMany(restaurantId)).map(withUrl);
  }

  async create(restaurantId: string, input: createTableInput) {
    // Colisão do código é praticamente impossível (31^12); o @unique do banco garante e vira 409 no errorHandler
    const table = await this.tableRepository.create({
      restaurant_id: restaurantId,
      label: input.label,
      public_code: generatePublicCode(),
    });
    return withUrl(table);
  }

  async update(restaurantId: string, id: string, input: updateTableInput, userId: string) {
    await this.getOwned(restaurantId, id);
    const result = await this.unit.run(restaurantId, async ({ db, now }) => {
      const active = input.active === false ? await this.ensureNoOpenTab(db, restaurantId, id) : null;
      const table = await new TableRepository(db).update(restaurantId, id, {
        label: input.label,
        active: input.active,
      });
      const closed = active
        ? await closeSessionResources(db, restaurantId, active.id, now, "STAFF", userId)
        : null;
      return { table, closed };
    });
    if (result.closed) notifySessionClosed(this.notifier, result.closed);
    return withUrl(result.table);
  }

  async qrCode(restaurantId: string, id: string) {
    await this.getOwned(restaurantId, id);
    const table = await this.unit.run(restaurantId, ({ db }) =>
      new TableRepository(db).update(restaurantId, id, { active: true }),
    );
    return QRCode.toString(tablePublicUrl(table.public_code), { type: "svg" });
  }

  async remove(restaurantId: string, id: string) {
    await this.getOwned(restaurantId, id);
    await this.unit.run(restaurantId, async ({ db }) => {
      await this.ensureNoOpenTab(db, restaurantId, id);
      const repository = new TableRepository(db);
      if (await repository.hasSessions(restaurantId, id))
        throw new ConflictError(
          "Mesa com atendimentos registrados: desative em vez de excluir",
          "TABLE_HAS_SESSIONS",
        );
      await repository.delete(restaurantId, id);
    });
  }

  private async ensureNoOpenTab(db: DbClient, restaurantId: string, id: string) {
    const session = await new TableSessionRepository(db).findActiveByTable(restaurantId, id);
    if (await findOpenTableTab(db, restaurantId, id, session))
      throw new ConflictError("Encerre a comanda antes de desativar ou excluir a mesa", "TABLE_HAS_OPEN_TAB");
    return session;
  }

  // Mesa de outro restaurante também cai aqui: 404, sem revelar que ela existe
  private async getOwned(restaurantId: string, id: string) {
    const table = await this.tableRepository.findById(restaurantId, id);
    if (!table) throw new NotFoundError("Mesa não encontrada");
    return table;
  }
}
