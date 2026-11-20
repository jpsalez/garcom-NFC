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
    expect(spec.paths["/menu/published"].get.security).toEqual([{ cookieAuth: [] }]);
    expect(spec.paths["/orders"].post.security).toEqual([{ cookieAuth: [] }]);
    const posSchema = spec.paths["/orders"].post.requestBody.content["application/json"].schema;
    expect(posSchema.required).toEqual(expect.arrayContaining(["table_id", "publication_id", "submission_key", "items"]));
  });
});

it("documenta a gestão e o pareamento com credenciais distintas no OpenAPI", () => {
  const { paths, components } = openApiSpec;
  expect(paths["/printing/kitchen"].get.security).toEqual([{ cookieAuth: [] }]);
  expect(paths["/printing/kitchen"].patch.responses[409].description).toContain("PRINT_AGENT_NOT_PAIRED");
  expect(paths["/printing/kitchen/pairing"].delete.responses[204]).toBeDefined();
  expect(paths["/print-agent/pair"].post.security).toEqual([]);
  expect(paths["/print-agent/pair"].post.responses[201].content["application/json"].schema.required).toEqual([
    "destination",
    "credential",
  ]);
  expect(paths["/print-agent/contact"].post.security).toEqual([{ printAgentToken: [] }]);
  expect(components.securitySchemes.printAgentToken).toEqual({ type: "http", scheme: "bearer" });
});

it("publica os contratos de reserva, resultado, revisão e segunda via", () => {
  const { paths } = JSON.parse(JSON.stringify(openApiSpec));
  const claim = paths["/print-jobs/claim"].post;
  const result = paths["/print-jobs/{id}/result"].post;
  const reprint = paths["/orders/{id}/reprints"].post;
  expect(claim.security).toEqual([{ printAgentToken: [] }]);
  expect(claim.responses[200].content["application/json"].schema.required).toContain("reservation_id");
  expect(result.security).toEqual(claim.security);
  expect(result.responses[409].description).toContain("PRINT_RESERVATION_CONFLICT");
  expect(result.requestBody.content["application/json"].schema.properties.outcome.enum).toEqual([
    "SENT",
    "FAILED_BEFORE_SEND",
    "UNCERTAIN",
  ]);
  const list = paths["/print-jobs"].get;
  expect(list.security).toEqual([{ cookieAuth: [] }]);
  expect(list.parameters.find((param: { name: string }) => param.name === "status").schema.enum).toContain(
    "REVIEW_REQUIRED",
  );
  expect(reprint.security).toEqual(list.security);
  expect(reprint.requestBody.content["application/json"].schema.required).toEqual([
    "idempotency_key",
    "reason",
  ]);
  expect(paths["/printing/kitchen"].patch.requestBody.content["application/json"].schema.anyOf).toHaveLength(
    2,
  );
});
