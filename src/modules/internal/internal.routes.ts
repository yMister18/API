import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";

async function requireInternalApiKey(request: FastifyRequest, reply: FastifyReply) {
  const key = request.headers["x-internal-api-key"];
  if (key !== env.INTERNAL_API_KEY) {
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
  fastify.addHook("preHandler", requireInternalApiKey);

  fastify.post("/purchase-fulfilled", async (request, reply) => {
    const body = purchaseFulfilledSchema.parse(request.body);

    const delivery = await prisma.pendingDelivery.findUnique({
      where: { id: body.deliveryId },
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
