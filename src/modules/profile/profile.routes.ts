import { randomInt } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../lib/prisma";
import { rankTitleForLevel } from "../../lib/rank";
import { initialsFromName } from "../../lib/initials";
import { parsePagination } from "../../lib/pagination";

// Sem 0/O/1/I para evitar confusão ao escrever o código no chat do jogo.
const LINK_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LINK_CODE_TTL_MS = 15 * 60_000;

function generateLinkCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += LINK_CODE_CHARS[randomInt(LINK_CODE_CHARS.length)];
  }
  return code;
}

export default async function profileRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/profile", async (request, reply) => {
    const user = request.currentUser!;
    return reply.send({
      username: user.username,
      rank: rankTitleForLevel(user.level),
      level: user.level,
      xp: user.xp,
      xpToNextLevel: user.xpToNextLevel,
      joinedAt: user.joinedAt.toISOString(),
      coins: user.coins,
      streakDays: user.streakDays,
    });
  });

  fastify.get("/missions", async (request, reply) => {
    const missions = await prisma.mission.findMany({
      where: { userId: request.currentUser!.id },
      orderBy: { expiresAt: "asc" },
    });

    const now = Date.now();
    return reply.send(
      missions.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        progress: m.progress,
        target: m.target,
        reward: m.reward,
        expiresInHours: Math.max(0, Math.round((m.expiresAt.getTime() - now) / 3_600_000)),
      }))
    );
  });

  fastify.get("/achievements", async (request, reply) => {
    const { page, pageSize, skip, take } = parsePagination(
      request.query as { page?: number; pageSize?: number }
    );

    const [achievements, total] = await Promise.all([
      prisma.achievement.findMany({
        orderBy: { order: "asc" },
        skip,
        take,
        include: {
          unlockedBy: {
            where: { userId: request.currentUser!.id },
          },
        },
      }),
      prisma.achievement.count(),
    ]);

    return reply.send({
      data: achievements.map((a) => {
        const progress = a.unlockedBy[0];
        return {
          id: a.id,
          title: a.title,
          description: a.description,
          icon: a.icon,
          unlocked: progress?.unlocked ?? false,
          unlockedAt: progress?.unlockedAt?.toISOString(),
        };
      }),
      page,
      pageSize,
      total,
    });
  });

  fastify.get("/activity", async (request, reply) => {
    const { page, pageSize, skip, take } = parsePagination(
      request.query as { page?: number; pageSize?: number }
    );

    const entries = await prisma.activityEntry.findMany({
      where: { userId: request.currentUser!.id },
      orderBy: { timestamp: "desc" },
      skip,
      take,
    });

    return reply.send({
      data: entries.map((e) => ({
        id: e.id,
        message: e.message,
        timestamp: e.timestamp.toISOString(),
        icon: e.icon,
      })),
      page,
      pageSize,
    });
  });

  fastify.get("/stats", async (request, reply) => {
    const stats = await prisma.stat.findMany({
      where: { userId: request.currentUser!.id },
      orderBy: { order: "asc" },
    });

    return reply.send(
      stats.map((s) => ({
        id: s.id,
        label: s.label,
        value: s.value,
        suffix: s.suffix ?? undefined,
        icon: s.icon,
      }))
    );
  });

  fastify.get("/friends", async (request, reply) => {
    const userId = request.currentUser!.id;
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ userId }, { friendId: userId }] },
      include: { user: true, friend: true },
    });

    return reply.send(
      friendships.map((f) => {
        const other = f.userId === userId ? f.friend : f.user;
        return {
          id: other.id,
          name: other.username,
          online: other.isOnline,
          initials: initialsFromName(other.username),
        };
      })
    );
  });

  fastify.get("/notifications", async (request, reply) => {
    const { page, pageSize, skip, take } = parsePagination(
      request.query as { page?: number; pageSize?: number }
    );

    const [notifications, total] = await Promise.all([
      prisma.notificationItem.findMany({
        where: { userId: request.currentUser!.id },
        orderBy: { timestamp: "desc" },
        skip,
        take,
      }),
      prisma.notificationItem.count({ where: { userId: request.currentUser!.id } }),
    ]);

    return reply.send({
      data: notifications.map((n) => ({
        id: n.id,
        message: n.message,
        timestamp: n.timestamp.toISOString(),
        read: n.read,
        icon: n.icon,
      })),
      page,
      pageSize,
      total,
    });
  });

  fastify.post("/notifications/read-all", async (request, reply) => {
    const result = await prisma.notificationItem.updateMany({
      where: { userId: request.currentUser!.id, read: false },
      data: { read: true },
    });

    return reply.send({ ok: true, count: result.count });
  });

  fastify.get("/minecraft", async (request, reply) => {
    const user = request.currentUser!;
    const pendingCode = await prisma.minecraftLinkCode.findFirst({
      where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });

    return reply.send({
      linked: Boolean(user.minecraftUsername),
      username: user.minecraftUsername,
      accountType: user.minecraftAccountType,
      pendingCode: pendingCode?.code ?? null,
      pendingExpiresAt: pendingCode?.expiresAt.toISOString() ?? null,
    });
  });

  // Gera um código de associação válido tanto para conta original como pirata
  // — o jogador entra no servidor com a conta que quer associar e o próprio
  // servidor (em modo online ou offline) é quem prova, ao aceitar a ligação,
  // que a posse é real. O plugin reporta o tipo em POST /internal/minecraft/link.
  fastify.post("/minecraft/code", async (request, reply) => {
    const userId = request.currentUser!.id;
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);

    await prisma.minecraftLinkCode.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    const created = await prisma.minecraftLinkCode.create({
      data: { userId, code: generateLinkCode(), expiresAt },
    });

    return reply.send({ code: created.code, expiresAt: created.expiresAt.toISOString() });
  });

  fastify.patch<{ Params: { id: string } }>("/notifications/:id", async (request, reply) => {
    const notification = await prisma.notificationItem.findUnique({
      where: { id: request.params.id },
    });

    if (!notification || notification.userId !== request.currentUser!.id) {
      return reply.code(404).send({ message: "Notificação não encontrada." });
    }

    const updated = await prisma.notificationItem.update({
      where: { id: notification.id },
      data: { read: true },
    });

    return reply.send({
      id: updated.id,
      message: updated.message,
      timestamp: updated.timestamp.toISOString(),
      read: updated.read,
      icon: updated.icon,
    });
  });
}
