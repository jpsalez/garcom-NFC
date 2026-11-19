import { describe, expect, it } from "vitest";
import { openApiSpec } from "../src/docs/openapi.ts";

describe("contrato OpenAPI de cardápio e pedidos", () => {
  it("publica contrato serializável para o cliente de mesa sem substituir o login administrativo", () => {
    const serialized = JSON.stringify(openApiSpec);
    const spec = JSON.parse(serialized);
    expect(spec.paths["/public/orders"].post.security).toEqual([{ tableToken: [] }]);
    expect(spec.paths["/menu/draft"].patch.security).toEqual([{ cookieAuth: [] }]);
    expect(spec.components.securitySchemes.tableToken.name).toBe("X-Table-Token");
    const submission = spec.paths["/public/orders"].post.requestBody.content["application/json"].schema;
    expect(submission.required).toContain("submission_key");
    expect(submission.properties.total_cents).toBeUndefined();
  });
  it("documenta transições e upload com formato e limite de escolhas usados na validação", () => {
    const spec = JSON.parse(JSON.stringify(openApiSpec));
    const transition =
      spec.paths["/orders/{id}/transitions"].post.requestBody.content["application/json"].schema;
    expect(transition.properties.operations.maxItems).toBe(50);
    expect(transition.properties.operations.items.properties.to_stage.enum).toContain("CANCELLED");
    expect(spec.paths["/media"].post.requestBody.content["multipart/form-data"].schema.required).toEqual([
      "file",
    ]);
  });
});
