import "fastify";
import "@fastify/jwt";
import type { OAuth2Namespace } from "@fastify/oauth2";
import type { User } from "@prisma/client";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireStaff: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    requireManagerStaff: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    discordOAuth2: OAuth2Namespace;
  }

  interface FastifyRequest {
    currentUser?: User;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}
