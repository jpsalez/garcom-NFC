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

it("documenta a gestão e a comunicação CloudPRNT com credenciais distintas", () => {
  const { paths, components } = openApiSpec;
  expect(paths["/printing/kitchen"].get.security).toEqual([{ cookieAuth: [] }]);
  expect(paths["/printing/kitchen"].patch.responses[409].description).toContain("PRINT_TEST_REQUIRED");
  expect(paths["/printing/kitchen/printer"].delete.responses[204]).toBeDefined();
  expect(paths["/printing/kitchen/test"].post.security).toEqual([{ cookieAuth: [] }]);
  for (const method of ["get", "post", "delete"] as const) {
    expect(paths["/printing/cloudprnt"][method].security).toEqual([{ cloudPrinterAuth: [] }]);
  }
  expect(components.securitySchemes.cloudPrinterAuth).toEqual({ type: "http", scheme: "basic" });
});

it("publica os contratos da fila, revisão e segunda via", () => {
  const { paths } = JSON.parse(JSON.stringify(openApiSpec));
  expect(paths["/print-agent/pair"]).toBeUndefined();
  expect(paths["/print-jobs/claim"]).toBeUndefined();
  expect(paths["/printing/cloudprnt"].get.responses[200].content["image/png"].schema.format).toBe("binary");
  const reprint = paths["/orders/{id}/reprints"].post;
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
