import QRCode from "qrcode";
import { inject, injectable } from "tsyringe";
import type { tables } from "../../../generated/prisma/client.ts";
import { ConflictError, NotFoundError } from "../../shared/errors/http-errors.ts";
import { tablePublicUrl } from "../../shared/utils/public-url.ts";
import { generatePublicCode } from "../../shared/utils/token.ts";
import type { ISessionsService } from "../sessions/sessions.interfaces.ts";
import type { ITablesService } from "./tables.interfaces.ts";
import type { ITableRepository } from "./tables.repository.interface.ts";
import type { createTableInput, updateTableInput } from "./tables.schemas.ts";

const withUrl = (table: tables) => ({ ...table, public_url: tablePublicUrl(table.public_code) });

@injectable()
export class TablesService implements ITablesService {
  private readonly tableRepository: ITableRepository;
  private readonly sessionsService: ISessionsService;

  constructor(
    @inject("TableRepository") tableRepository: ITableRepository,
    @inject("SessionsService") sessionsService: ISessionsService,
  ) {
    this.tableRepository = tableRepository;
    this.sessionsService = sessionsService;
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
    const table = await this.tableRepository.update(restaurantId, id, { label: input.label, active: input.active });
    // Desativa primeiro (um novo scan já dá 404) e depois encerra o atendimento que ainda estava aberto
    if (input.active === false) await this.sessionsService.closeActiveOfTable(restaurantId, id, userId);
    return withUrl(table);
  }

  async qrCode(restaurantId: string, id: string) {
    const table = await this.getOwned(restaurantId, id);
    // Gerar o QR Code põe a mesa em uso: reativa se estiver inativa
    if (!table.active) await this.tableRepository.update(restaurantId, id, { active: true });
    return QRCode.toString(tablePublicUrl(table.public_code), { type: "svg" });
  }

  async remove(restaurantId: string, id: string) {
    await this.getOwned(restaurantId, id);
    if (await this.tableRepository.hasSessions(restaurantId, id)) {
      throw new ConflictError("Mesa com atendimentos registrados: desative em vez de excluir", "TABLE_HAS_SESSIONS");
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
