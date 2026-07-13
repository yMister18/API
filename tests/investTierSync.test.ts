import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyBaseLogger } from "fastify";
import { runInvestTierSync } from "../src/jobs/investTierSync";

// Estes testes evitam tocar na base de dados e no Discord: o Prisma e o
// syncDiscordInvestTier são mocked, cobrindo apenas a lógica de decisão de
// tiers em src/jobs/investTierSync.ts.

const groupBy = vi.fn();
const findMany = vi.fn();
const update = vi.fn();

vi.mock("../src/lib/prisma", () => ({
  prisma: {
    order: { groupBy: (...args: unknown[]) => groupBy(...args) },
    user: {
      findMany: (...args: unknown[]) => findMany(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

const syncDiscordInvestTier = vi.fn().mockResolvedValue(true);

vi.mock("../src/lib/discordRoleSync", () => ({
  syncDiscordInvestTier: (...args: unknown[]) => syncDiscordInvestTier(...args),
}));

const logger = { info: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger;

beforeEach(() => {
  groupBy.mockReset();
  findMany.mockReset();
  update.mockReset();
  syncDiscordInvestTier.mockClear();
  update.mockResolvedValue(undefined);
});

describe("runInvestTierSync", () => {
  it("atribui o tier mais alto cujo limiar é atingido", async () => {

    groupBy.mockResolvedValue([{ userId: "u1", _sum: { totalCents: 5000 } }]);
    findMany.mockResolvedValue([{ id: "u1", discordId: "d1", investTier: null }]);

    await runInvestTierSync(logger);

    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { investTier: "THEEND" } });
    expect(syncDiscordInvestTier).toHaveBeenCalledWith(logger, "d1", null, "THEEND");
  });

  it("não altera nem sincroniza quando o tier se mantém igual", async () => {

    groupBy.mockResolvedValue([{ userId: "u1", _sum: { totalCents: 1000 } }]);
    findMany.mockResolvedValue([{ id: "u1", discordId: "d1", investTier: "WORLD" }]);

    await runInvestTierSync(logger);

    expect(update).not.toHaveBeenCalled();
    expect(syncDiscordInvestTier).not.toHaveBeenCalled();
  });

  it("remove o tier de quem deixou de gastar o suficiente", async () => {

    groupBy.mockResolvedValue([]);
    findMany.mockResolvedValue([{ id: "u1", discordId: "d1", investTier: "NETHER" }]);

    await runInvestTierSync(logger);

    expect(update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { investTier: null } });
    expect(syncDiscordInvestTier).toHaveBeenCalledWith(logger, "d1", "NETHER", null);
  });

  it("não atribui tier a quem fica mesmo abaixo do limiar mínimo", async () => {

    groupBy.mockResolvedValue([{ userId: "u1", _sum: { totalCents: 999 } }]);
    findMany.mockResolvedValue([{ id: "u1", discordId: "d1", investTier: null }]);

    await runInvestTierSync(logger);

    expect(update).not.toHaveBeenCalled();
  });
});
