import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ITokenCleanupService } from "../src/modules/auth/auth.interfaces.ts";
import { container } from "../src/shared/container/container.ts";
import { api } from "./helpers/app.ts";
import { ownerOf } from "./helpers/auth.ts";
import { prisma, resetDb } from "./helpers/db.ts";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const purgeExpired = () => {
  api();
  return container.resolve<ITokenCleanupService>("TokenCleanupService").purgeExpired();
};
const past = () => new Date(Date.now() - 1000);
const future = () => new Date(Date.now() + 60_000);

describe("purgeExpired", () => {
  it("apaga só os refresh tokens e links de redefinição vencidos", async () => {
    const { user } = await ownerOf("a");
    const base = { user_id: user.id, expires_at: past() };
    await prisma.refresh_tokens.createMany({
      data: [
        { ...base, token_hash: "r-vencido" },
        { ...base, token_hash: "r-vencido-revogado", revoked_at: past() },
        { ...base, token_hash: "r-valido", expires_at: future() },
      ],
    });
    await prisma.password_resets.createMany({
      data: [
        { ...base, token_hash: "p-vencido" },
        { ...base, token_hash: "p-valido", expires_at: future() },
      ],
    });

    expect(await purgeExpired()).toBe(3);

    // Sobram o refresh token do login do ownerOf e o "r-valido"
    expect(await prisma.refresh_tokens.count()).toBe(2);
    expect((await prisma.password_resets.findMany()).map((t) => t.token_hash)).toEqual(["p-valido"]);
    expect(await prisma.refresh_tokens.findUnique({ where: { token_hash: "r-valido" } })).not.toBeNull();
  });
});
