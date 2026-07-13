import type { InvestTier, OrderStatus } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import { prisma } from "../lib/prisma";
import { syncDiscordInvestTier } from "../lib/discordRoleSync";

// Gasto acumulado nos últimos 30 dias necessário para cada tier (em cêntimos).
// Reavaliado diariamente — quem deixa de gastar o suficiente perde o tier.
const INVEST_TIER_THRESHOLDS: Array<{ tier: InvestTier; minCents: number }> = [
  { tier: "THEEND", minCents: 5000 },
  { tier: "NETHER", minCents: 2500 },
  { tier: "WORLD", minCents: 1000 },
];

const WINDOW_DAYS = 30;
const QUALIFYING_ORDER_STATUSES: OrderStatus[] = ["pago", "entregue"];

function tierForSpend(spendCents: number): InvestTier | null {
  for (const { tier, minCents } of INVEST_TIER_THRESHOLDS) {
    if (spendCents >= minCents) return tier;
  }
  return null;
}

// Recalcula o investTier de todos os utilizadores relevantes: quem gastou o
// suficiente nos últimos 30 dias (sobe/mantém) e quem já tinha um tier mas
// deixou de qualificar-se (desce/remove). Sincroniza o Discord best-effort.
export async function runInvestTierSync(logger: FastifyBaseLogger): Promise<void> {
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const spendByUser = await prisma.order.groupBy({
    by: ["userId"],
    where: {
      status: { in: QUALIFYING_ORDER_STATUSES },
      createdAt: { gte: windowStart },
    },
    _sum: { totalCents: true },
  });

  const spendMap = new Map(spendByUser.map((s) => [s.userId, s._sum.totalCents ?? 0]));

  const usersToCheck = await prisma.user.findMany({
    where: {
      OR: [{ id: { in: [...spendMap.keys()] } }, { investTier: { not: null } }],
    },
    select: { id: true, discordId: true, investTier: true },
  });

  let changed = 0;

  for (const user of usersToCheck) {
    const spendCents = spendMap.get(user.id) ?? 0;
    const nextTier = tierForSpend(spendCents);

    if (nextTier === user.investTier) continue;

    await prisma.user.update({ where: { id: user.id }, data: { investTier: nextTier } });

    syncDiscordInvestTier(logger, user.discordId, user.investTier, nextTier).catch((err) =>
      logger.error(err, "Falha ao sincronizar investTier com o Discord")
    );

    changed++;
  }

  logger.info(`Sync de investTier: ${usersToCheck.length} utilizadores avaliados, ${changed} alterados.`);
}
