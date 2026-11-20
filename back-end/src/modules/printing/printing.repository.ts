import { inject, injectable } from "tsyringe";
import type { print_destination, Prisma } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";
import type { AgentProof, IPrintingRepository } from "./printing.repository.interface.ts";

@injectable()
export class PrintingRepository implements IPrintingRepository {
  constructor(@inject("DbClient") private db: DbClient) {}

  // Descobre o escopo pela prova opaca. O service a confere novamente sob o lock do restaurante.
  findByHash(proof: AgentProof) {
    return this.db.print_destinations.findUnique({
      where: proof,
      select: { restaurant_id: true, destination: true },
    });
  }

  get(restaurantId: string, destination: print_destination) {
    return this.db.print_destinations.findUnique({
      where: { restaurant_id_destination: { restaurant_id: restaurantId, destination } },
    });
  }

  savePairingCode(restaurantId: string, destination: print_destination, hash: string, expiresAt: Date) {
    const pairing = { pairing_code_hash: hash, pairing_expires_at: expiresAt };
    return this.db.print_destinations.upsert({
      where: { restaurant_id_destination: { restaurant_id: restaurantId, destination } },
      create: { restaurant_id: restaurantId, destination, ...pairing },
      update: pairing,
    });
  }

  update(
    restaurantId: string,
    destination: print_destination,
    data: Prisma.print_destinationsUpdateManyMutationInput,
  ) {
    return this.db.print_destinations.update({
      where: { restaurant_id_destination: { restaurant_id: restaurantId, destination } },
      data,
    });
  }

  createOriginal(
    restaurantId: string,
    orderId: string,
    destination: print_destination,
    payload: Prisma.InputJsonObject,
  ) {
    return this.db.print_jobs.create({
      data: {
        restaurant_id: restaurantId,
        order_id: orderId,
        destination,
        source_event: "ORDER_CREATED",
        payload_version: 1,
        payload,
      },
    });
  }
}
