import type { InvestTier, MediaRole, StaffRole, VipTier } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../config/env";
import { assignDiscordRole, removeDiscordRole } from "./discordBot";

const STAFF_ROLE_DISCORD_IDS: Record<StaffRole, string | undefined> = {
  OWNER: env.DISCORD_ROLE_ID_OWNER,
  DEVELOPER: env.DISCORD_ROLE_ID_DEVELOPER,
  MANAGER: env.DISCORD_ROLE_ID_MANAGER,
  ADMIN: env.DISCORD_ROLE_ID_ADMIN,
  BUILDER: env.DISCORD_ROLE_ID_BUILDER,
  MOD: env.DISCORD_ROLE_ID_MOD,
  HELPER: env.DISCORD_ROLE_ID_HELPER,
};

const INVEST_TIER_DISCORD_IDS: Record<InvestTier, string | undefined> = {
  THEEND: env.DISCORD_ROLE_ID_THEEND,
  NETHER: env.DISCORD_ROLE_ID_NETHER,
  WORLD: env.DISCORD_ROLE_ID_WORLD,
};

const MEDIA_ROLE_DISCORD_IDS: Record<MediaRole, string | undefined> = {
  FAMOUS: env.DISCORD_ROLE_ID_FAMOUS,
  MEDIA: env.DISCORD_ROLE_ID_MEDIA,
};

const VIP_TIER_DISCORD_IDS: Record<VipTier, string | undefined> = {
  WARPION: env.DISCORD_ROLE_ID_WARPION,
  TITAN: env.DISCORD_ROLE_ID_TITAN,
  MASTER: env.DISCORD_ROLE_ID_MASTER,
  LEGEND: env.DISCORD_ROLE_ID_LEGEND,
  HERO: env.DISCORD_ROLE_ID_HERO,
};

// Sincroniza o cargo do Discord quando um dos eixos de rank de um utilizador
// muda (staffRole, investTier, mediaRole, vipTier são todos independentes,
// cada um com o seu próprio mapeamento para um Discord role ID).
// Best-effort: nunca lança — devolve se a sincronização foi bem-sucedida para
// o chamador poder avisar o admin sem bloquear a mudança já gravada em BD.
async function syncDiscordRole<T extends string>(
  logger: FastifyBaseLogger,
  discordUserId: string,
  roleIds: Record<T, string | undefined>,
  previousValue: T | null,
  nextValue: T | null
): Promise<boolean> {
  const previousRoleId = previousValue ? roleIds[previousValue] : undefined;
  const nextRoleId = nextValue ? roleIds[nextValue] : undefined;

  let ok = true;

  if (previousRoleId && previousRoleId !== nextRoleId) {
    try {
      await removeDiscordRole(discordUserId, previousRoleId);
    } catch (err) {
      ok = false;
      logger.error(err, "Falha ao remover cargo Discord antigo");
    }
  }

  if (nextRoleId && nextRoleId !== previousRoleId) {
    try {
      await assignDiscordRole(discordUserId, nextRoleId);
    } catch (err) {
      ok = false;
      logger.error(err, "Falha ao atribuir cargo Discord novo");
    }
  }

  return ok;
}

export function syncDiscordStaffRole(
  logger: FastifyBaseLogger,
  discordUserId: string,
  previousRole: StaffRole | null,
  nextRole: StaffRole | null
): Promise<boolean> {
  return syncDiscordRole(logger, discordUserId, STAFF_ROLE_DISCORD_IDS, previousRole, nextRole);
}

export function syncDiscordInvestTier(
  logger: FastifyBaseLogger,
  discordUserId: string,
  previousTier: InvestTier | null,
  nextTier: InvestTier | null
): Promise<boolean> {
  return syncDiscordRole(logger, discordUserId, INVEST_TIER_DISCORD_IDS, previousTier, nextTier);
}

export function syncDiscordMediaRole(
  logger: FastifyBaseLogger,
  discordUserId: string,
  previousRole: MediaRole | null,
  nextRole: MediaRole | null
): Promise<boolean> {
  return syncDiscordRole(logger, discordUserId, MEDIA_ROLE_DISCORD_IDS, previousRole, nextRole);
}

export function syncDiscordVipTier(
  logger: FastifyBaseLogger,
  discordUserId: string,
  previousTier: VipTier | null,
  nextTier: VipTier | null
): Promise<boolean> {
  return syncDiscordRole(logger, discordUserId, VIP_TIER_DISCORD_IDS, previousTier, nextTier);
}
