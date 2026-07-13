import { env } from "../config/env";

const DISCORD_API_BASE = "https://discord.com/api/v10";

function requireBotConfig() {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) {
    throw new Error(
      "Bot do Discord não configurado (DISCORD_BOT_TOKEN / DISCORD_GUILD_ID em falta no .env)."
    );
  }
  return { token: env.DISCORD_BOT_TOKEN, guildId: env.DISCORD_GUILD_ID };
}

async function discordRequest(
  path: string,
  token: string,
  init: { method: string; body?: unknown }
) {
  const res = await fetch(`${DISCORD_API_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord API ${init.method} ${path} falhou: ${res.status} ${body}`);
  }

  return res;
}

// Atribui um cargo a um membro do servidor. Requer que o cargo do bot esteja
// posicionado acima, na hierarquia de cargos, do cargo a atribuir — caso
// contrário a API do Discord devolve 403 mesmo com a permissão MANAGE_ROLES.
export async function assignDiscordRole(discordUserId: string, roleId: string): Promise<void> {
  const { token, guildId } = requireBotConfig();
  await discordRequest(`/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, token, {
    method: "PUT",
  });
}

export async function removeDiscordRole(discordUserId: string, roleId: string): Promise<void> {
  const { token, guildId } = requireBotConfig();
  await discordRequest(`/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, token, {
    method: "DELETE",
  });
}

// Envia uma DM ao utilizador. Só funciona se o bot e o utilizador partilharem
// um servidor e o utilizador permitir DMs de membros do servidor.
export async function sendDiscordDM(discordUserId: string, content: string): Promise<void> {
  const { token } = requireBotConfig();

  const dmChannelRes = await discordRequest(`/users/@me/channels`, token, {
    method: "POST",
    body: { recipient_id: discordUserId },
  });
  const dmChannel = (await dmChannelRes.json()) as { id: string };

  await discordRequest(`/channels/${dmChannel.id}/messages`, token, {
    method: "POST",
    body: { content },
  });
}
