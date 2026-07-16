import path from "node:path";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { ZodError } from "zod";

import { env, corsOrigins } from "./config/env";
import authPlugin from "./plugins/auth";

import authRoutes from "./modules/auth/auth.routes";
import adminRoutes from "./modules/admin/admin.routes";
import profileRoutes from "./modules/profile/profile.routes";
import forumRoutes from "./modules/forum/forum.routes";
import ticketRoutes from "./modules/tickets/tickets.routes";
import clanRoutes from "./modules/clans/clans.routes";
import shopRoutes from "./modules/shop/shop.routes";
import contentRoutes from "./modules/content/content.routes";
import contactRoutes from "./modules/contact/contact.routes";
import internalRoutes from "./modules/internal/internal.routes";

export function buildApp() {
  const app = Fastify({
    logger:
      env.NODE_ENV === "test"
        ? false
        : {
            level: env.NODE_ENV === "development" ? "info" : "warn",
            transport:
              env.NODE_ENV === "development"
                ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
                : undefined,
          },
  });

  app.register(cors, {
    origin: corsOrigins,
    credentials: true,
  });

  app.register(rateLimit, {
    global: false,
  });

  // Uploads de imagens (logo/banner de clã) — limite de 5MB por ficheiro.
  app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  app.register(fastifyStatic, {
    root: path.join(process.cwd(), "uploads"),
    prefix: "/uploads/",
  });

  // Limita tentativas de login Discord (start + callback) contra abuso/brute-force.
  app.after(() => {
    const discordLoginLimiter = app.rateLimit({ max: 10, timeWindow: "1 minute" });
    app.addHook("onRequest", async (request, reply) => {
      if (request.url.startsWith("/auth/discord")) {
        await discordLoginLimiter.call(app, request, reply);
      }
    });
  });

  app.setErrorHandler(function (this: FastifyInstance, error: FastifyError | ZodError, request, reply) {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        message: "Dados inválidos.",
        issues: error.flatten().fieldErrors,
      });
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error(error);
      return reply.code(statusCode).send({ message: "Erro interno do servidor." });
    }

    return reply.code(statusCode).send({ message: error.message });
  });

  app.register(swagger, {
    openapi: {
      info: {
        title: "Warpion API",
        description: "API backend da plataforma web do Warpion.",
        version: "0.1.0",
      },
      servers: [{ url: `http://localhost:${env.PORT}` }],
    },
  });
  app.register(swaggerUi, {
    routePrefix: "/docs",
  });

  app.register(authPlugin);

  app.get("/health", async () => ({ status: "ok" }));

  app.register(authRoutes, { prefix: "/auth" });
  app.register(adminRoutes, { prefix: "/admin" });
  app.register(profileRoutes, { prefix: "/me" });
  app.register(forumRoutes, { prefix: "/forum" });
  app.register(ticketRoutes);
  app.register(clanRoutes);
  app.register(shopRoutes);
  app.register(contentRoutes);
  app.register(contactRoutes);
  app.register(internalRoutes, { prefix: "/internal" });

  return app;
}
