import type { FastifyInstance } from "fastify";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { toPublicUser } from "../../lib/serializers";

interface DiscordUserResponse {
  id: string;
  username: string;
  avatar: string | null;
  discriminator: string;
}

function discordAvatarUrl(discordUser: DiscordUserResponse): string {
  if (discordUser.avatar) {
    // .webp funciona sempre (estático e animado); .gif dá 415 no CDN do
    // Discord para alguns avatares animados (ex. fonte AVIF que não é
    // representável como GIF), mesmo com o prefixo "a_".
    return `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.webp`;
  }
  // Utilizadores no novo sistema de username (discriminator "0") usam o índice
  // baseado no snowflake do ID; contas legadas com discriminator continuam a
  // usar o cálculo antigo. Ver https://discord.com/developers/docs/reference#image-formatting
  const defaultIndex =
    discordUser.discriminator && discordUser.discriminator !== "0"
      ? Number(discordUser.discriminator) % 5
      : Number((BigInt(discordUser.id) >> 22n) % 6n);

  return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
}

export default async function authRoutes(fastify: FastifyInstance) {
  // GET /auth/discord é registado automaticamente pelo plugin @fastify/oauth2
  // (startRedirectPath) em src/plugins/auth.ts — redireciona para o ecrã de
  // autorização do Discord.

  fastify.get("/discord/callback", async (request, reply) => {
    try {
      const { token } = await fastify.discordOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);

      const discordUserRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });

      if (!discordUserRes.ok) {
        throw new Error(`Falha ao obter perfil Discord: ${discordUserRes.status}`);
      }

      const discordUser = (await discordUserRes.json()) as DiscordUserResponse;

      const user = await prisma.user.upsert({
        where: { discordId: discordUser.id },
        update: {
          username: discordUser.username,
          avatarUrl: discordAvatarUrl(discordUser),
        },
        create: {
          discordId: discordUser.id,
          username: discordUser.username,
          avatarUrl: discordAvatarUrl(discordUser),
        },
      });

      const jwt = fastify.jwt.sign({ sub: user.id });

      reply.setCookie(env.SESSION_COOKIE_NAME, jwt, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 30,
      });

      return reply.redirect(env.FRONTEND_URL);
    } catch (err) {
      request.log.error(err, "Falha no callback do Discord OAuth2");
      return reply.redirect(`${env.FRONTEND_URL}?auth_error=1`);
    }
  });

  fastify.post("/logout", async (request, reply) => {
    reply.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
    return reply.code(204).send();
  });

  fastify.get(
    "/me",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      return reply.send(toPublicUser(request.currentUser!));
    }
  );
}
