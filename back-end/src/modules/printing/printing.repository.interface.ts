import type { print_destination, print_destinations } from "../../../generated/prisma/client.ts";

export type DestinationKey = Pick<print_destinations, "restaurant_id" | "destination">;
export type AgentProof = { pairing_code_hash: string } | { credential_hash: string };

export interface IPrintingRepository {
  findByHash(proof: AgentProof): Promise<DestinationKey | null>;
  get(restaurantId: string, destination: print_destination): Promise<print_destinations | null>;
}
