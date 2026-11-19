import type { Server as HttpServer } from "node:http";
import { injectable } from "tsyringe";
import { Server } from "socket.io";
import { ACCESS_COOKIE, readCookie } from "../utils/cookies.ts";
import type { INotifier } from "./notifier.ts";
import { type ActorContext, hasCapability } from "../authorization/capabilities.ts";

type Authenticate = (token: string) => Promise<ActorContext>;

const roomOf = (restaurantId: string) => `restaurant:${restaurantId}`;
const userRoomOf = (userId: string) => `user:${userId}`;
const ordersRoomOf = (restaurantId: string) => `restaurant:${restaurantId}:orders`;

// Uma sala por restaurante: o isolamento do tempo real é o mesmo do HTTP. Sem servidor ligado (testes), não envia nada.
@injectable()
export class SocketNotifier implements INotifier {
  private io?: Server;

  // Só OWNER e STAFF entram (SUPER_ADMIN não tem restaurante); o JWT vem do cookie httpOnly do handshake, nunca na URL.
  // authenticate e origins chegam de fora (main.ts) para o notifier não depender do HTTP.
  attach(httpServer: HttpServer, authenticate: Authenticate, origins: string[]) {
    this.io = new Server(httpServer, { cors: { origin: origins, credentials: true } });
    this.io.use(async (socket, next) => {
      try {
        const user = await authenticate(readCookie(socket.handshake.headers.cookie, ACCESS_COOKIE) ?? "");
        if (!user.restaurantId) throw new Error("Usuário sem restaurante");
        socket.join([roomOf(user.restaurantId), userRoomOf(user.id)]);
        if (hasCapability(user, "orders:read")) socket.join(ordersRoomOf(user.restaurantId));
        next();
      } catch {
        next(new Error("Não autorizado"));
      }
    });
  }

  toRestaurant(restaurantId: string, event: string, payload: unknown) {
    this.io?.to(roomOf(restaurantId)).emit(event, payload);
  }

  toOrders(restaurantId: string, event: string, payload: { order_id: string; version: number }) {
    this.io?.to(ordersRoomOf(restaurantId)).emit(event, payload);
  }

  disconnectUser(userId: string) {
    this.io?.in(userRoomOf(userId)).disconnectSockets(true);
  }

  disconnectRestaurant(restaurantId: string) {
    this.io?.in(roomOf(restaurantId)).disconnectSockets(true);
  }

  close() {
    return this.io?.close();
  }
}
