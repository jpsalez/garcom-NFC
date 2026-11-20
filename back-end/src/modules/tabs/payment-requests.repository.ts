import { inject, injectable } from "tsyringe";
import type { Prisma, payment_requests, payment_request_status } from "../../../generated/prisma/client.ts";
import type { DbClient } from "../../shared/providers/prisma.ts";

type CreatePaymentRequestData = Pick<
  Prisma.payment_requestsUncheckedCreateInput,
  | "session_id"
  | "session_token_id"
  | "payer_label"
  | "preferred_method"
  | "requested_amount_cents"
  | "selection_json"
  | "created_at"
>;
type UpdatePaymentRequestData = Partial<
  Pick<payment_requests, "status" | "payment_id" | "handled_by_user_id">
>;
type EndRequestStatus = Extract<payment_request_status, "CANCELLED" | "EXPIRED">;

@injectable()
export class PaymentRequestsRepository {
  constructor(@inject("DbClient") private readonly db: DbClient) {}

  create(restaurantId: string, tabId: string, data: CreatePaymentRequestData) {
    return this.db.payment_requests.create({ data: { ...data, restaurant_id: restaurantId, tab_id: tabId } });
  }

  list(restaurantId: string, tabId: string) {
    return this.db.payment_requests.findMany({
      where: { restaurant_id: restaurantId, tab_id: tabId },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });
  }

  findOpenByToken(restaurantId: string, tabId: string, tokenId: string) {
    return this.db.payment_requests.findFirst({
      where: { restaurant_id: restaurantId, tab_id: tabId, session_token_id: tokenId, status: "OPEN" },
    });
  }

  findById(restaurantId: string, tabId: string, id: string) {
    return this.db.payment_requests.findUnique({ where: { id, restaurant_id: restaurantId, tab_id: tabId } });
  }

  update(restaurantId: string, tabId: string, id: string, data: UpdatePaymentRequestData) {
    return this.db.payment_requests.update({
      where: { id, restaurant_id: restaurantId, tab_id: tabId },
      data,
    });
  }

  reopenForPayment(restaurantId: string, paymentId: string) {
    return this.db.payment_requests.updateManyAndReturn({
      where: { restaurant_id: restaurantId, payment_id: paymentId, status: "CONVERTED" },
      data: { status: "ACCEPTED", payment_id: null },
    });
  }

  closeOpenForSession(restaurantId: string, sessionId: string, status: EndRequestStatus) {
    return this.db.payment_requests.updateManyAndReturn({
      where: { restaurant_id: restaurantId, session_id: sessionId, status: { in: ["OPEN", "ACCEPTED"] } },
      data: { status },
    });
  }

  closeOpenForTab(restaurantId: string, tabId: string, status: EndRequestStatus) {
    return this.db.payment_requests.updateManyAndReturn({
      where: { restaurant_id: restaurantId, tab_id: tabId, status: { in: ["OPEN", "ACCEPTED"] } },
      data: { status },
    });
  }

  moveToTab(restaurantId: string, sourceTabId: string, targetTabId: string) {
    return this.db.payment_requests.updateMany({
      where: { restaurant_id: restaurantId, tab_id: sourceTabId },
      data: { tab_id: targetTabId },
    });
  }
}
