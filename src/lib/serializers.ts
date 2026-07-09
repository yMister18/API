import type { User } from "@prisma/client";
import { rankTitleForLevel } from "./rank";

// Forma pública do utilizador devolvida por /auth/me e afins.
// Nunca expõe discordId em bruto para além do necessário nem segredos internos.
export function toPublicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl,
    minecraftUsername: user.minecraftUsername,
    staffRole: user.staffRole,
    rank: rankTitleForLevel(user.level),
    level: user.level,
  };
}
