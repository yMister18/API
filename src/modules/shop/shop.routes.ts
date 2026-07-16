import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import type { ShopItem } from "@prisma/client";

const addCartSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().min(1).max(99).default(1),
});

const SHOP_TIERS = ["vip", "cosmetic", "pet", "key", "bundle"] as const;
const VIP_TIERS = ["WARPION", "TITAN", "MASTER", "LEGEND", "HERO"] as const;

const createShopItemSchema = z.object({
  tier: z.enum(SHOP_TIERS),
  name: z.string().min(1).max(200),
  priceCents: z.number().int().min(0),
  originalPriceCents: z.number().int().min(0).nullable().optional(),
  currency: z.string().min(1).max(10).default("EUR"),
  description: z.string().min(1).max(1000),
  perks: z.array(z.string().min(1)).default([]),
  featured: z.boolean().default(false),
  vipTier: z.enum(VIP_TIERS).nullable().optional(),
});

const updateShopItemSchema = createShopItemSchema.partial().extend({
  active: z.boolean().optional(),
});

function serializeItem(item: ShopItem) {
  return {
    id: item.id,
    tier: item.tier,
    name: item.name,
    priceCents: item.priceCents,
    currency: item.currency,
    originalPriceCents: item.originalPriceCents ?? undefined,
    description: item.description,
    perks: item.perks,
    featured: item.featured,
  };
}

export default async function shopRoutes(fastify: FastifyInstance) {
  fastify.get("/shop/items", async (request, reply) => {
    const { tier } = request.query as { tier?: string };
    const items = await prisma.shopItem.findMany({
      where: { active: true, tier: tier ? (tier as any) : undefined },
      orderBy: [{ featured: "desc" }, { createdAt: "asc" }],
    });
    return reply.send(items.map(serializeItem));
  });

  // Gestão de produtos (Owner/Developer/Manager) — inclui itens inativos e o
  // campo `active`, ao contrário do GET público acima.
  fastify.get(
    "/admin/shop/items",
    { preHandler: [fastify.authenticate, fastify.requireManagerStaff] },
    async (_request, reply) => {
      const items = await prisma.shopItem.findMany({ orderBy: [{ featured: "desc" }, { createdAt: "asc" }] });
      return reply.send(items.map((item) => ({ ...serializeItem(item), active: item.active })));
    }
  );

  fastify.post(
    "/admin/shop/items",
    { preHandler: [fastify.authenticate, fastify.requireManagerStaff] },
    async (request, reply) => {
      const body = createShopItemSchema.parse(request.body);
      const item = await prisma.shopItem.create({ data: body });
      return reply.code(201).send({ ...serializeItem(item), active: item.active });
    }
  );

  fastify.patch<{ Params: { id: string } }>(
    "/admin/shop/items/:id",
    { preHandler: [fastify.authenticate, fastify.requireManagerStaff] },
    async (request, reply) => {
      const body = updateShopItemSchema.parse(request.body);

      const item = await prisma.shopItem.findUnique({ where: { id: request.params.id } });
      if (!item) return reply.code(404).send({ message: "Item não encontrado." });

      const updated = await prisma.shopItem.update({ where: { id: item.id }, data: body });
      return reply.send({ ...serializeItem(updated), active: updated.active });
    }
  );

  // Soft-delete: encomendas passadas referenciam o item (OrderItem), por isso
  // "apagar" só desativa — deixa de aparecer no GET /shop/items público.
  fastify.delete<{ Params: { id: string } }>(
    "/admin/shop/items/:id",
    { preHandler: [fastify.authenticate, fastify.requireManagerStaff] },
    async (request, reply) => {
      const item = await prisma.shopItem.findUnique({ where: { id: request.params.id } });
      if (!item) return reply.code(404).send({ message: "Item não encontrado." });

      await prisma.shopItem.update({ where: { id: item.id }, data: { active: false } });
      return reply.code(204).send();
    }
  );

  fastify.get("/me/cart", { preHandler: fastify.authenticate }, async (request, reply) => {
    const cartItems = await prisma.cartItem.findMany({
      where: { userId: request.currentUser!.id },
      include: { item: true },
      orderBy: { createdAt: "asc" },
    });

    return reply.send(
      cartItems.map((c) => ({ item: serializeItem(c.item), quantity: c.quantity }))
    );
  });

  fastify.post("/me/cart", { preHandler: fastify.authenticate }, async (request, reply) => {
    const body = addCartSchema.parse(request.body);

    const item = await prisma.shopItem.findUnique({ where: { id: body.itemId } });
    if (!item || !item.active) return reply.code(404).send({ message: "Item não encontrado." });

    const cartItem = await prisma.cartItem.upsert({
      where: { userId_itemId: { userId: request.currentUser!.id, itemId: item.id } },
      update: { quantity: body.quantity },
      create: { userId: request.currentUser!.id, itemId: item.id, quantity: body.quantity },
      include: { item: true },
    });

    return reply.code(201).send({ item: serializeItem(cartItem.item), quantity: cartItem.quantity });
  });

  fastify.delete<{ Params: { itemId: string } }>(
    "/me/cart/:itemId",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      await prisma.cartItem.deleteMany({
        where: { userId: request.currentUser!.id, itemId: request.params.itemId },
      });
      return reply.code(204).send();
    }
  );

  // FRONTEND-NOTE: `/checkout` é um stub — não há integração de pagamento real.
  // Cria a encomenda como "paga" de imediato e devolve um `checkoutUrl` fictício,
  // deixando entregas em fila para o plugin do servidor consumir via
  // POST /internal/purchase-fulfilled.
  fastify.post("/checkout", { preHandler: fastify.authenticate }, async (request, reply) => {
    const cartItems = await prisma.cartItem.findMany({
      where: { userId: request.currentUser!.id },
      include: { item: true },
    });

    if (cartItems.length === 0) {
      return reply.code(400).send({ message: "O carrinho está vazio." });
    }

    const totalCents = cartItems.reduce((sum, c) => sum + c.item.priceCents * c.quantity, 0);

    const order = await prisma.order.create({
      data: {
        userId: request.currentUser!.id,
        status: "pago",
        totalCents,
        items: {
          create: cartItems.map((c) => ({
            itemId: c.itemId,
            quantity: c.quantity,
            priceCents: c.item.priceCents,
          })),
        },
      },
      include: { items: true },
    });

    const checkoutUrl = `https://checkout.stub.warpion.pt/orders/${order.id}`;
    await prisma.order.update({ where: { id: order.id }, data: { checkoutUrl } });

    await prisma.pendingDelivery.createMany({
      data: order.items.flatMap((oi) =>
        Array.from({ length: oi.quantity }, () => ({
          orderId: order.id,
          itemId: oi.itemId,
          minecraftUsername: request.currentUser!.minecraftUsername,
        }))
      ),
    });

    await prisma.cartItem.deleteMany({ where: { userId: request.currentUser!.id } });

    return reply.code(201).send({
      orderId: order.id,
      status: "pago",
      totalCents,
      currency: order.currency,
      checkoutUrl,
    });
  });
}
