import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { syncDiscordVipTier } from "../../lib/discordRoleSync";

function isValidInternalApiKey(key: unknown): key is string {
  if (typeof key !== "string") return false;

  const provided = Buffer.from(key);
  const expected = Buffer.from(env.INTERNAL_API_KEY);
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(provided, expected);
}

async function requireInternalApiKey(request: FastifyRequest, reply: FastifyReply) {
  const key = request.headers["x-internal-api-key"];
  if (!isValidInternalApiKey(key)) {
    return reply.code(401).send({ message: "Chave de API interna inválida." });
  }
}

const purchaseFulfilledSchema = z.object({
  deliveryId: z.string().min(1),
});

const rankPlayerEntrySchema = z.object({
  rank: z.number().int(),
  name: z.string(),
  value: z.string(),
  guild: z.string().optional(),
});

const rankClanEntrySchema = z.object({
  rank: z.number().int(),
  name: z.string(),
  tag: z.string(),
  members: z.number().int(),
  power: z.string(),
});

const onlineStatusSchema = z.object({
  updates: z.array(
    z.object({
      minecraftUsername: z.string(),
      online: z.boolean(),
    })
  ),
});

// Rotas consumidas pelo plugin do servidor Minecraft. Protegidas por
// header `x-internal-api-key` (não fazem parte da sessão de utilizador).
export default async function internalRoutes(fastify: FastifyInstance) {
  await fastify.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  fastify.addHook("preHandler", requireInternalApiKey);

  fastify.post("/purchase-fulfilled", async (request, reply) => {
    const body = purchaseFulfilledSchema.parse(request.body);

    const delivery = await prisma.pendingDelivery.findUnique({
      where: { id: body.deliveryId },
      include: { item: true, order: true },
    });
    if (!delivery) return reply.code(404).send({ message: "Entrega não encontrada." });

    await prisma.pendingDelivery.update({
      where: { id: delivery.id },
      data: { delivered: true, deliveredAt: new Date() },
    });

    const remaining = await prisma.pendingDelivery.count({
      where: { orderId: delivery.orderId, delivered: false },
    });

    if (remaining === 0) {
      await prisma.order.update({
        where: { id: delivery.orderId },
        data: { status: "entregue" },
      });
    }

    // Item de rank VIP entregue: atribui o vipTier ao comprador e sincroniza
    // o cargo no Discord. Best-effort — nunca falha a entrega em si.
    if (delivery.item.vipTier) {
      const buyer = await prisma.user.findUnique({ where: { id: delivery.order.userId } });
      if (buyer && buyer.vipTier !== delivery.item.vipTier) {
        const previousVipTier = buyer.vipTier;
        const nextVipTier = delivery.item.vipTier;

        await prisma.user.update({
          where: { id: buyer.id },
          data: { vipTier: nextVipTier },
        });

        syncDiscordVipTier(request.log, buyer.discordId, previousVipTier, nextVipTier).catch(
          (err) => request.log.error(err, "Falha ao sincronizar vipTier com o Discord")
        );
      }
    }

    return reply.code(200).send({ ok: true });
  });

  fastify.get("/deliveries/pending", async (_request, reply) => {
    const pending = await prisma.pendingDelivery.findMany({
      where: { delivered: false },
      include: { item: true },
      orderBy: { createdAt: "asc" },
    });
    return reply.send(
      pending.map((d) => ({
        id: d.id,
        orderId: d.orderId,
        itemId: d.itemId,
        itemName: d.item.name,
        minecraftUsername: d.minecraftUsername,
        createdAt: d.createdAt.toISOString(),
      }))
    );
  });

  fastify.post("/sync/rankings/players", async (request, reply) => {
    const entries = z.array(rankPlayerEntrySchema).parse(request.body);
    await prisma.$transaction([
      prisma.rankPlayerEntry.deleteMany({ where: { type: "players" } }),
      prisma.rankPlayerEntry.createMany({
        data: entries.map((e) => ({ ...e, type: "players" })),
      }),
    ]);
    return reply.send({ ok: true, count: entries.length });
  });

  fastify.post("/sync/rankings/wealth", async (request, reply) => {
    const entries = z.array(rankPlayerEntrySchema).parse(request.body);
    await prisma.$transaction([
      prisma.rankPlayerEntry.deleteMany({ where: { type: "wealth" } }),
      prisma.rankPlayerEntry.createMany({
        data: entries.map((e) => ({ ...e, type: "wealth" })),
      }),
    ]);
    return reply.send({ ok: true, count: entries.length });
  });

  fastify.post("/sync/rankings/clans", async (request, reply) => {
    const entries = z.array(rankClanEntrySchema).parse(request.body);
    await prisma.$transaction([
      prisma.rankClanEntry.deleteMany({}),
      prisma.rankClanEntry.createMany({ data: entries }),
    ]);
    return reply.send({ ok: true, count: entries.length });
  });

  fastify.post("/sync/online-status", async (request, reply) => {
    const body = onlineStatusSchema.parse(request.body);

    await Promise.all(
      body.updates.map((u) =>
        prisma.user.updateMany({
          where: { minecraftUsername: u.minecraftUsername },
          data: { isOnline: u.online, lastSeenAt: new Date() },
        })
      )
    );

    return reply.send({ ok: true, count: body.updates.length });
  });
}
