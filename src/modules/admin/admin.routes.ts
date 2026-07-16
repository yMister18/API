import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { parsePagination } from "../../lib/pagination";
import {
  syncDiscordInvestTier,
  syncDiscordMediaRole,
  syncDiscordStaffRole,
  syncDiscordVipTier,
} from "../../lib/discordRoleSync";

const STAFF_ROLES = ["OWNER", "DEVELOPER", "MANAGER", "ADMIN", "BUILDER", "MOD", "HELPER"] as const;
const INVEST_TIERS = ["THEEND", "NETHER", "WORLD"] as const;
const MEDIA_ROLES = ["FAMOUS", "MEDIA"] as const;
const VIP_TIERS = ["WARPION", "TITAN", "MASTER", "LEGEND", "HERO"] as const;

const updateStaffRoleSchema = z.object({
  staffRole: z.enum(STAFF_ROLES).nullable(),
});

// Todos os campos são opcionais — só os presentes no body são alterados
// (omitido = não mexer; null = limpar o eixo, voltar a Membro base).
const updateRanksSchema = z.object({
  investTier: z.enum(INVEST_TIERS).nullable().optional(),
  mediaRole: z.enum(MEDIA_ROLES).nullable().optional(),
  vipTier: z.enum(VIP_TIERS).nullable().optional(),
});

export default async function adminRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.authenticate);

  // Pesquisa de utilizadores para o painel de gestão de cargos (Cargos).
  fastify.get("/users", { preHandler: fastify.requireManagerStaff }, async (request, reply) => {
    const { search } = request.query as { search?: string };
    const { page, pageSize, skip, take } = parsePagination(
      request.query as { page?: number; pageSize?: number }
    );

    const where = search
      ? { username: { contains: search, mode: "insensitive" as const } }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, username: true, avatarUrl: true, staffRole: true, discordId: true },
        orderBy: { username: "asc" },
        skip,
        take,
      }),
      prisma.user.count({ where }),
    ]);

    return reply.send({ data: users, page, pageSize, total });
  });

  fastify.patch<{ Params: { id: string } }>(
    "/users/:id/staff-role",
    { preHandler: fastify.requireManagerStaff },
    async (request, reply) => {
      const body = updateStaffRoleSchema.parse(request.body);

      const target = await prisma.user.findUnique({ where: { id: request.params.id } });
      if (!target) return reply.code(404).send({ message: "Utilizador não encontrado." });

      const updated = await prisma.user.update({
        where: { id: target.id },
        data: { staffRole: body.staffRole },
      });

      const discordSynced = await syncDiscordStaffRole(
        request.log,
        updated.discordId,
        target.staffRole,
        updated.staffRole
      );

      return reply.send({ id: updated.id, staffRole: updated.staffRole, discordSynced });
    }
  );

  // Invest / Media / VIP — eixos independentes do staff, menos sensíveis que
  // promover staff, por isso acessível a qualquer membro do staff.
  fastify.patch<{ Params: { id: string } }>(
    "/users/:id/ranks",
    { preHandler: fastify.requireStaff },
    async (request, reply) => {
      const body = updateRanksSchema.parse(request.body);

      const target = await prisma.user.findUnique({ where: { id: request.params.id } });
      if (!target) return reply.code(404).send({ message: "Utilizador não encontrado." });

      const updated = await prisma.user.update({
        where: { id: target.id },
        data: body,
      });

      const syncResults = await Promise.all([
        body.investTier !== undefined
          ? syncDiscordInvestTier(request.log, updated.discordId, target.investTier, updated.investTier)
          : true,
        body.mediaRole !== undefined
          ? syncDiscordMediaRole(request.log, updated.discordId, target.mediaRole, updated.mediaRole)
          : true,
        body.vipTier !== undefined
          ? syncDiscordVipTier(request.log, updated.discordId, target.vipTier, updated.vipTier)
          : true,
      ]);

      return reply.send({
        id: updated.id,
        investTier: updated.investTier,
        mediaRole: updated.mediaRole,
        vipTier: updated.vipTier,
        discordSynced: syncResults.every(Boolean),
      });
    }
  );
}
