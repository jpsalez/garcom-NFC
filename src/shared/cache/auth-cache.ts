import { injectable } from "tsyringe";
import type { role } from "../../../generated/prisma/enums.ts";

// Quem é o usuário autenticado: só guardamos usuários ATIVOS de restaurantes ativos
export type AuthEntry = { id: string; restaurantId: string | null; role: role };

export interface IAuthCache {
  get(userId: string): AuthEntry | undefined;
  currentVersion(): number;
  set(entry: AuthEntry, readAtVersion: number): void;
  invalidateUser(userId: string): void;
  invalidateRestaurant(restaurantId: string): void;
}

// Cache em memória (uma instância da API). Evita consultar o banco a cada requisição.
// Quem desativa, exclui ou muda um usuário/restaurante chama invalidate*; o TTL é só a rede de segurança.
@injectable()
export class AuthCache implements IAuthCache {
  private readonly entries = new Map<string, { entry: AuthEntry; expiresAt: number }>();
  private readonly ttlMs: number;
  // Sobe a cada invalidação. Quem leu o banco antes dela não pode gravar o resultado velho no cache.
  private version = 0;

  constructor() {
    const seconds = Number(process.env.AUTH_CACHE_TTL_SECONDS ?? 30);
    this.ttlMs = Number.isFinite(seconds) ? seconds * 1000 : 30_000;
  }

  get(userId: string) {
    const cached = this.entries.get(userId);
    if (!cached) return undefined;
    if (cached.expiresAt <= Date.now()) {
      this.entries.delete(userId);
      return undefined;
    }
    return cached.entry;
  }

  currentVersion() {
    return this.version;
  }

  set(entry: AuthEntry, readAtVersion: number) {
    if (readAtVersion !== this.version) return;
    this.entries.set(entry.id, { entry, expiresAt: Date.now() + this.ttlMs });
  }

  invalidateUser(userId: string) {
    this.version++;
    this.entries.delete(userId);
  }

  invalidateRestaurant(restaurantId: string) {
    this.version++;
    for (const [userId, cached] of this.entries) {
      if (cached.entry.restaurantId === restaurantId) this.entries.delete(userId);
    }
  }
}
