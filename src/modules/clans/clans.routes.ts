import path from "node:path";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import type { Clan, ClanMember, ClanRole, User } from "@prisma/client";

const UPLOADS_DIR = path.join(process.cwd(), "uploads", "clans");

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

// Guarda o ficheiro carregado em uploads/clans e devolve o caminho relativo
// (servido por @fastify/static em /uploads/, ver app.ts) para gravar no
// campo logoUrl/bannerUrl do Clan. Responde diretamente e devolve `null`
// quando a validação falha, para o handler saber que já respondeu.
async function handleImageUpload(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
  clanId: string,
  kind: "logo" | "banner"
): Promise<string | null> {
  const membership = await requireMembership(request.currentUser!.id);
  if (!membership || membership.clanId !== clanId || membership.role !== "LEADER") {
    reply.code(403).send({ message: "Só o líder pode alterar a imagem do clã." });
    return null;
  }

  const file = await request.file();
  if (!file) {
    reply.code(400).send({ message: "Nenhum ficheiro enviado." });
    return null;
  }

  const extension = IMAGE_EXTENSIONS[file.mimetype];
  if (!extension) {
    reply.code(400).send({ message: "Formato inválido — usa PNG, JPEG ou WEBP." });
    return null;
  }

  const filename = `${clanId}-${kind}-${Date.now()}.${extension}`;
  await pipeline(file.file, createWriteStream(path.join(UPLOADS_DIR, filename)));

  const previousPath = kind === "logo" ? membership.clan.logoUrl : membership.clan.bannerUrl;
  if (previousPath) {
    await unlink(path.join(process.cwd(), previousPath)).catch(() => {});
  }

  const relativeUrl = `/uploads/clans/${filename}`;
  await prisma.clan.update({
    where: { id: clanId },
    data: kind === "logo" ? { logoUrl: relativeUrl } : { bannerUrl: relativeUrl },
  });

  return relativeUrl;
}

// Hierarquia, do mais alto ao mais baixo (número menor = cargo mais alto).
const ROLE_ORDER: Record<ClanRole, number> = {
  LEADER: 0,
  SUBLEADER: 1,
  OFFICER: 2,
  ELITE: 3,
  MEMBER: 4,
  RECRUIT: 5,
};

// OFFICER e acima (LEADER, SUBLEADER, OFFICER) podem convidar/expulsar.
const MANAGEMENT_RANK = ROLE_ORDER.OFFICER;

function isManagementRank(role: ClanRole): boolean {
  return ROLE_ORDER[role] <= MANAGEMENT_RANK;
}

const createClanSchema = z.object({
  name: z.string().min(3).max(60),
  tag: z
    .string()
    .min(2)
    .max(6)
    .regex(/^[A-Za-z0-9]+$/, "A tag só pode ter letras e números.")
    .transform((t) => t.toUpperCase()),
  description: z.string().max(500).default(""),
  bannerAccent: z.string().min(1).max(100).default("from-purple-600 to-blue-600"),
});

const updateClanSchema = z.object({
  name: z.string().min(3).max(60).optional(),
  description: z.string().max(500).optional(),
  bannerAccent: z.string().min(1).max(100).optional(),
});

const inviteSchema = z.object({
  username: z.string().min(1),
});

const updateMemberRoleSchema = z.object({
  role: z.enum(["SUBLEADER", "OFFICER", "ELITE", "MEMBER", "RECRUIT"]),
});

const transferLeadershipSchema = z.object({
  userId: z.string().min(1),
});

function serializeClanSummary(clan: Clan & { members: ClanMember[] }) {
  const leader = clan.members.find((m) => m.role === "LEADER");
  return {
    id: clan.id,
    name: clan.name,
    tag: clan.tag,
    description: clan.description,
    bannerAccent: clan.bannerAccent,
    logoUrl: clan.logoUrl,
    bannerUrl: clan.bannerUrl,
    memberCount: clan.members.length,
    leaderId: leader?.userId ?? null,
  };
}

function serializeClanDetail(clan: Clan & { members: (ClanMember & { user: User })[] }) {
  return {
    id: clan.id,
    name: clan.name,
    tag: clan.tag,
    description: clan.description,
    bannerAccent: clan.bannerAccent,
    logoUrl: clan.logoUrl,
    bannerUrl: clan.bannerUrl,
    createdAt: clan.createdAt.toISOString(),
    members: [...clan.members]
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.joinedAt.getTime() - b.joinedAt.getTime())
      .map((m) => ({
        userId: m.user.id,
        username: m.user.username,
        avatarUrl: m.user.avatarUrl,
        minecraftUsername: m.user.minecraftUsername,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
      })),
  };
}

async function requireMembership(userId: string) {
  return prisma.clanMember.findUnique({ where: { userId }, include: { clan: true } });
}

export default async function clanRoutes(fastify: FastifyInstance) {
  fastify.get("/clans", async (_request, reply) => {
    const clans = await prisma.clan.findMany({ include: { members: true }, orderBy: { createdAt: "asc" } });
    return reply.send(clans.map(serializeClanSummary));
  });

  fastify.get<{ Params: { tag: string } }>("/clans/:tag", async (request, reply) => {
    const clan = await prisma.clan.findUnique({
      where: { tag: request.params.tag.toUpperCase() },
      include: { members: { include: { user: true } } },
    });
    if (!clan) return reply.code(404).send({ message: "Clã não encontrado." });
    return reply.send(serializeClanDetail(clan));
  });

  fastify.post("/clans", { preHandler: fastify.authenticate }, async (request, reply) => {
    const body = createClanSchema.parse(request.body);
    const userId = request.currentUser!.id;

    const existingMembership = await requireMembership(userId);
    if (existingMembership) {
      return reply.code(409).send({ message: "Já pertences a um clã — sai dele primeiro." });
    }

    const existingTag = await prisma.clan.findUnique({ where: { tag: body.tag } });
    if (existingTag) return reply.code(409).send({ message: "Já existe um clã com esta tag." });

    const clan = await prisma.clan.create({
      data: {
        name: body.name,
        tag: body.tag,
        description: body.description,
        bannerAccent: body.bannerAccent,
        members: { create: { userId, role: "LEADER" } },
      },
      include: { members: { include: { user: true } } },
    });

    return reply.code(201).send(serializeClanDetail(clan));
  });

  fastify.get("/me/clan", { preHandler: fastify.authenticate }, async (request, reply) => {
    const membership = await requireMembership(request.currentUser!.id);
    if (!membership) return reply.send(null);

    const clan = await prisma.clan.findUnique({
      where: { id: membership.clanId },
      include: { members: { include: { user: true } } },
    });
    return reply.send({ ...serializeClanDetail(clan!), myRole: membership.role });
  });

  fastify.delete("/me/clan", { preHandler: fastify.authenticate }, async (request, reply) => {
    const membership = await requireMembership(request.currentUser!.id);
    if (!membership) return reply.code(404).send({ message: "Não pertences a nenhum clã." });

    if (membership.role === "LEADER") {
      return reply
        .code(400)
        .send({ message: "És o líder — transfere a liderança ou dissolve o clã antes de sair." });
    }

    await prisma.clanMember.delete({ where: { userId: request.currentUser!.id } });
    return reply.code(204).send();
  });

  fastify.get("/me/clan/invites", { preHandler: fastify.authenticate }, async (request, reply) => {
    const invites = await prisma.clanInvite.findMany({
      where: { invitedUserId: request.currentUser!.id, status: "pendente" },
      include: { clan: true, invitedBy: true },
      orderBy: { createdAt: "desc" },
    });
    return reply.send(
      invites.map((i) => ({
        id: i.id,
        clanId: i.clanId,
        clanName: i.clan.name,
        clanTag: i.clan.tag,
        invitedByUsername: i.invitedBy.username,
        createdAt: i.createdAt.toISOString(),
      }))
    );
  });

  fastify.post<{ Params: { id: string } }>(
    "/me/clan/invites/:id/accept",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const userId = request.currentUser!.id;
      const invite = await prisma.clanInvite.findUnique({ where: { id: request.params.id } });
      if (!invite || invite.invitedUserId !== userId || invite.status !== "pendente") {
        return reply.code(404).send({ message: "Convite não encontrado." });
      }

      const existingMembership = await requireMembership(userId);
      if (existingMembership) {
        return reply.code(409).send({ message: "Já pertences a um clã — sai dele primeiro." });
      }

      await prisma.$transaction([
        prisma.clanMember.create({ data: { clanId: invite.clanId, userId, role: "RECRUIT" } }),
        prisma.clanInvite.update({ where: { id: invite.id }, data: { status: "aceite" } }),
        prisma.clanInvite.updateMany({
          where: { invitedUserId: userId, status: "pendente", id: { not: invite.id } },
          data: { status: "cancelado" },
        }),
      ]);

      return reply.code(204).send();
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/me/clan/invites/:id/decline",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const invite = await prisma.clanInvite.findUnique({ where: { id: request.params.id } });
      if (!invite || invite.invitedUserId !== request.currentUser!.id || invite.status !== "pendente") {
        return reply.code(404).send({ message: "Convite não encontrado." });
      }

      await prisma.clanInvite.update({ where: { id: invite.id }, data: { status: "recusado" } });
      return reply.code(204).send();
    }
  );

  fastify.patch<{ Params: { id: string } }>(
    "/clans/:id",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const membership = await requireMembership(request.currentUser!.id);
      if (!membership || membership.clanId !== request.params.id || membership.role !== "LEADER") {
        return reply.code(403).send({ message: "Só o líder pode editar o clã." });
      }

      const body = updateClanSchema.parse(request.body);
      const updated = await prisma.clan.update({
        where: { id: request.params.id },
        data: body,
        include: { members: { include: { user: true } } },
      });
      return reply.send(serializeClanDetail(updated));
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/clans/:id/logo",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const url = await handleImageUpload(request, reply, request.params.id, "logo");
      if (url === null) return;
      return reply.send({ logoUrl: url });
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/clans/:id/banner",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const url = await handleImageUpload(request, reply, request.params.id, "banner");
      if (url === null) return;
      return reply.send({ bannerUrl: url });
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/clans/:id",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const membership = await requireMembership(request.currentUser!.id);
      if (!membership || membership.clanId !== request.params.id || membership.role !== "LEADER") {
        return reply.code(403).send({ message: "Só o líder pode dissolver o clã." });
      }

      await Promise.all(
        [membership.clan.logoUrl, membership.clan.bannerUrl]
          .filter((p): p is string => Boolean(p))
          .map((p) => unlink(path.join(process.cwd(), p)).catch(() => {}))
      );
      await prisma.clan.delete({ where: { id: request.params.id } });
      return reply.code(204).send();
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/clans/:id/invites",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const membership = await requireMembership(request.currentUser!.id);
      if (!membership || membership.clanId !== request.params.id || !isManagementRank(membership.role)) {
        return reply.code(403).send({ message: "Só o líder ou oficiais podem convidar jogadores." });
      }

      const body = inviteSchema.parse(request.body);
      const target = await prisma.user.findFirst({ where: { username: body.username } });
      if (!target) return reply.code(404).send({ message: "Jogador não encontrado." });

      const targetMembership = await requireMembership(target.id);
      if (targetMembership) return reply.code(409).send({ message: "Este jogador já pertence a um clã." });

      const existingInvite = await prisma.clanInvite.findFirst({
        where: { clanId: request.params.id, invitedUserId: target.id, status: "pendente" },
      });
      if (existingInvite) return reply.code(409).send({ message: "Este jogador já tem um convite pendente." });

      const invite = await prisma.clanInvite.create({
        data: { clanId: request.params.id, invitedUserId: target.id, invitedById: request.currentUser!.id },
      });
      return reply.code(201).send({ id: invite.id });
    }
  );

  fastify.delete<{ Params: { id: string; inviteId: string } }>(
    "/clans/:id/invites/:inviteId",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const membership = await requireMembership(request.currentUser!.id);
      if (!membership || membership.clanId !== request.params.id || !isManagementRank(membership.role)) {
        return reply.code(403).send({ message: "Só o líder ou oficiais podem cancelar convites." });
      }

      const invite = await prisma.clanInvite.findUnique({ where: { id: request.params.inviteId } });
      if (!invite || invite.clanId !== request.params.id) {
        return reply.code(404).send({ message: "Convite não encontrado." });
      }

      await prisma.clanInvite.update({ where: { id: invite.id }, data: { status: "cancelado" } });
      return reply.code(204).send();
    }
  );

  fastify.delete<{ Params: { id: string; userId: string } }>(
    "/clans/:id/members/:userId",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const membership = await requireMembership(request.currentUser!.id);
      if (!membership || membership.clanId !== request.params.id || !isManagementRank(membership.role)) {
        return reply.code(403).send({ message: "Só o líder ou oficiais podem expulsar membros." });
      }

      const target = await prisma.clanMember.findUnique({ where: { userId: request.params.userId } });
      if (!target || target.clanId !== request.params.id) {
        return reply.code(404).send({ message: "Membro não encontrado neste clã." });
      }
      if (target.role === "LEADER") {
        return reply.code(400).send({ message: "O líder não pode ser expulso." });
      }
      if (ROLE_ORDER[membership.role] >= ROLE_ORDER[target.role]) {
        return reply.code(403).send({ message: "Não podes expulsar alguém com um cargo igual ou superior ao teu." });
      }

      await prisma.clanMember.delete({ where: { userId: request.params.userId } });
      return reply.code(204).send();
    }
  );

  fastify.patch<{ Params: { id: string; userId: string } }>(
    "/clans/:id/members/:userId",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const membership = await requireMembership(request.currentUser!.id);
      if (!membership || membership.clanId !== request.params.id || membership.role !== "LEADER") {
        return reply.code(403).send({ message: "Só o líder pode promover ou despromover membros." });
      }

      const body = updateMemberRoleSchema.parse(request.body);
      const target = await prisma.clanMember.findUnique({ where: { userId: request.params.userId } });
      if (!target || target.clanId !== request.params.id || target.role === "LEADER") {
        return reply.code(404).send({ message: "Membro não encontrado neste clã." });
      }

      const updated = await prisma.clanMember.update({
        where: { userId: request.params.userId },
        data: { role: body.role },
      });
      return reply.send({ userId: updated.userId, role: updated.role });
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/clans/:id/transfer-leadership",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const membership = await requireMembership(request.currentUser!.id);
      if (!membership || membership.clanId !== request.params.id || membership.role !== "LEADER") {
        return reply.code(403).send({ message: "Só o líder pode transferir a liderança." });
      }

      const body = transferLeadershipSchema.parse(request.body);
      const target = await prisma.clanMember.findUnique({ where: { userId: body.userId } });
      if (!target || target.clanId !== request.params.id) {
        return reply.code(404).send({ message: "Membro não encontrado neste clã." });
      }

      await prisma.$transaction([
        prisma.clanMember.update({ where: { userId: request.currentUser!.id }, data: { role: "OFFICER" } }),
        prisma.clanMember.update({ where: { userId: body.userId }, data: { role: "LEADER" } }),
      ]);

      return reply.code(204).send();
    }
  );
}
