import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import fastifyOauth2 from "@fastify/oauth2";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";

export default fp(async function authPlugin(fastify: FastifyInstance) {
  await fastify.register(fastifyCookie, {
    secret: env.COOKIE_SECRET,
  });

  await fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    cookie: {
      cookieName: env.SESSION_COOKIE_NAME,
      signed: false,
    },
    sign: { expiresIn: "30d" },
  });

  await fastify.register(fastifyOauth2, {
    name: "discordOAuth2",
    scope: ["identify"],
    credentials: {
      client: {
        id: env.DISCORD_CLIENT_ID,
        secret: env.DISCORD_CLIENT_SECRET,
      },
      auth: fastifyOauth2.DISCORD_CONFIGURATION,
    },
    startRedirectPath: "/auth/discord",
    callbackUri: env.DISCORD_CALLBACK_URL,
    cookie: { secure: env.NODE_ENV === "production", sameSite: "lax" },
  });

  fastify.decorate("authenticate", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ message: "Não autenticado." });
    }

    const payload = request.user as { sub: string };
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user) {
      return reply.code(401).send({ message: "Não autenticado." });
    }

    request.currentUser = user;
  });

  fastify.decorate("requireStaff", async (request, reply) => {
    if (!request.currentUser) {
      return reply.code(401).send({ message: "Não autenticado." });
    }
    if (!request.currentUser.staffRole) {
      return reply.code(403).send({ message: "Sem permissão para esta ação." });
    }
  });

  // Restrito a OWNER/DEVELOPER/MANAGER — para ações de gestão como gerir o
  // staffRole de outros utilizadores, publicar notícias e gerir produtos da
  // loja (que qualquer staff, ex. HELPER, não deveria poder fazer).
  fastify.decorate("requireManagerStaff", async (request, reply) => {
    if (!request.currentUser) {
      return reply.code(401).send({ message: "Não autenticado." });
    }
    if (
      request.currentUser.staffRole !== "OWNER" &&
      request.currentUser.staffRole !== "DEVELOPER" &&
      request.currentUser.staffRole !== "MANAGER"
    ) {
      return reply.code(403).send({ message: "Sem permissão para esta ação." });
    }
  });
});
