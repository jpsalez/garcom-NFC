import QRCode from "qrcode";
import { inject, injectable } from "tsyringe";
import type { tables } from "../../../generated/prisma/client.ts";
import { ConflictError, NotFoundError } from "../../shared/errors/http-errors.ts";
import { tablePublicUrl } from "../../shared/utils/public-url.ts";
import { generatePublicCode } from "../../shared/utils/token.ts";
import type { ITablesService } from "./tables.interfaces.ts";
import type { ITableRepository } from "./tables.repository.interface.ts";
import type { createTableInput, updateTableInput } from "./tables.schemas.ts";

const withUrl = (table: tables) => ({ ...table, public_url: tablePublicUrl(table.public_code) });

@injectable()
export class TablesService implements ITablesService {
  private readonly tableRepository: ITableRepository;

  constructor(@inject("TableRepository") tableRepository: ITableRepository) {
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

  async update(restaurantId: string, id: string, input: updateTableInput) {
    await this.getOwned(restaurantId, id);
    return withUrl(await this.tableRepository.update(restaurantId, id, { label: input.label, active: input.active }));
  }

  async qrCode(restaurantId: string, id: string) {
    const table = await this.getOwned(restaurantId, id);
    return QRCode.toString(tablePublicUrl(table.public_code), { type: "svg" });
  }

  async remove(restaurantId: string, id: string) {
    await this.getOwned(restaurantId, id);
    if (await this.tableRepository.hasSessions(restaurantId, id)) {
      throw new ConflictError("Mesa com atendimentos registrados: desative em vez de excluir");
    }
    await this.tableRepository.delete(restaurantId, id);
  }

  // Mesa de outro restaurante também cai aqui: 404, sem revelar que ela existe
  private async getOwned(restaurantId: string, id: string) {
    const table = await this.tableRepository.findById(restaurantId, id);
    if (!table) throw new NotFoundError("Mesa não encontrada");
    return table;
  }
}
