import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

import { env, corsOrigins } from "./config/env";
import authPlugin from "./plugins/auth";

import authRoutes from "./modules/auth/auth.routes";
import profileRoutes from "./modules/profile/profile.routes";
import forumRoutes from "./modules/forum/forum.routes";
import ticketRoutes from "./modules/tickets/tickets.routes";
import shopRoutes from "./modules/shop/shop.routes";
import contentRoutes from "./modules/content/content.routes";
import contactRoutes from "./modules/contact/contact.routes";
import internalRoutes from "./modules/internal/internal.routes";

export function buildApp() {
  const app = Fastify({
    logger: {
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
  app.register(profileRoutes, { prefix: "/me" });
  app.register(forumRoutes, { prefix: "/forum" });
  app.register(ticketRoutes);
  app.register(shopRoutes);
  app.register(contentRoutes);
  app.register(contactRoutes);
  app.register(internalRoutes, { prefix: "/internal" });

  return app;
}
