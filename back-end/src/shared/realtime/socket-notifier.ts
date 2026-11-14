import type { Server as HttpServer } from "node:http";
import { injectable } from "tsyringe";
import { Server } from "socket.io";
import type { INotifier } from "./notifier.ts";

type Authenticate = (token: string) => Promise<{ id: string; restaurantId: string | null }>;

const roomOf = (restaurantId: string) => `restaurant:${restaurantId}`;
const userRoomOf = (userId: string) => `user:${userId}`;

// Uma sala por restaurante: o isolamento do tempo real é o mesmo do HTTP. Sem servidor ligado (testes), não envia nada.
@injectable()
export class SocketNotifier implements INotifier {
  private io?: Server;

  // Só OWNER e STAFF entram (SUPER_ADMIN não tem restaurante); o JWT vem em handshake.auth.token, nunca na URL.
  // authenticate e origins chegam de fora (main.ts) para o notifier não depender do HTTP.
  attach(httpServer: HttpServer, authenticate: Authenticate, origins: string[]) {
    this.io = new Server(httpServer, { cors: { origin: origins } });
    this.io.use(async (socket, next) => {
      try {
        const user = await authenticate(String(socket.handshake.auth.token ?? ""));
        if (!user.restaurantId) throw new Error("Usuário sem restaurante");
        socket.join([roomOf(user.restaurantId), userRoomOf(user.id)]);
        next();
      } catch {
        next(new Error("Não autorizado"));
      }
    });
  }

  toRestaurant(restaurantId: string, event: string, payload: unknown) {
    this.io?.to(roomOf(restaurantId)).emit(event, payload);
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
