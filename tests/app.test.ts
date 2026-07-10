import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";

// Estes testes evitam tocar na base de dados: cobrem apenas caminhos que
// terminam antes de qualquer query Prisma (autenticação, validação Zod,
// rate limiting), pelo que correm sem Postgres disponível.

let app: FastifyInstance;

beforeEach(() => {
  app = buildApp();
});

afterEach(async () => {
  await app.close();
});

describe("GET /health", () => {
  it("responde 200 ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});

describe("erro handler global (Zod)", () => {
  it("devolve 400 com issues para body inválido em /contact", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/contact",
      payload: { name: "" },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.message).toBe("Dados inválidos.");
    expect(body.issues).toHaveProperty("email");
  });
});

describe("autenticação interna (/internal/*)", () => {
  it("rejeita pedidos sem x-internal-api-key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/purchase-fulfilled",
      payload: { deliveryId: "abc" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejeita pedidos com chave errada", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/purchase-fulfilled",
      headers: { "x-internal-api-key": "chave-errada" },
      payload: { deliveryId: "abc" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("aceita a chave correta e valida o body (Zod) sem tocar na BD", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/purchase-fulfilled",
      headers: { "x-internal-api-key": process.env.INTERNAL_API_KEY! },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toBe("Dados inválidos.");
  });
});

describe("rate limit do login Discord", () => {
  it("bloqueia após exceder o limite configurado", async () => {
    const responses = [];
    for (let i = 0; i < 11; i++) {
      responses.push(
        await app.inject({ method: "GET", url: "/auth/discord/callback" })
      );
    }

    const statusCodes = responses.map((r) => r.statusCode);
    expect(statusCodes.slice(0, 10)).not.toContain(429);
    expect(statusCodes[10]).toBe(429);
  });
});
