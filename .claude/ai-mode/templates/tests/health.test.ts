import { describe, expect, it } from "vitest";
import { api } from "./helpers/app.ts";

describe("GET /health", () => {
  it("responde 200", async () => {
    const res = await api().get("/health");
    expect(res.status).toBe(200);
  });
});
