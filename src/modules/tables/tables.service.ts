import { inject, injectable } from "tsyringe";
import { NotFoundError } from "../../shared/errors/http-errors.ts";
import { generatePublicCode } from "../../shared/utils/token.ts";
import type { ITablesService } from "./tables.interfaces.ts";
import type { ITableRepository } from "./tables.repository.interface.ts";
import type { createTableInput, updateTableInput } from "./tables.schemas.ts";

@injectable()
export class TablesService implements ITablesService {
  private readonly tableRepository: ITableRepository;

  constructor(@inject("TableRepository") tableRepository: ITableRepository) {
    this.tableRepository = tableRepository;
  }

  list(restaurantId: string) {
    return this.tableRepository.findMany(restaurantId);
  }

  async create(restaurantId: string, input: createTableInput) {
    // Colisão do código é praticamente impossível (31^12); o @unique do banco garante e vira 409 no errorHandler
    return this.tableRepository.create({
      restaurant_id: restaurantId,
      label: input.label,
      public_code: generatePublicCode(),
    });
  }

  async update(restaurantId: string, id: string, input: updateTableInput) {
    // Mesa de outro restaurante também cai aqui: 404, sem revelar que ela existe
    if (!(await this.tableRepository.findById(restaurantId, id))) {
      throw new NotFoundError("Mesa não encontrada");
    }
    return this.tableRepository.update(restaurantId, id, { label: input.label, active: input.active });
  }
}
