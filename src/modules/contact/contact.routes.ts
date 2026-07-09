import type { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { prisma } from "../../lib/prisma";

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5_000),
});

export default async function contactRoutes(fastify: FastifyInstance) {
  fastify.register(async (scoped) => {
    scoped.register(rateLimit, {
      max: 5,
      timeWindow: "10 minutes",
    });

    scoped.post("/contact", async (request, reply) => {
      const body = contactSchema.parse(request.body);

      const entry = await prisma.contactMessage.create({ data: body });

      // FRONTEND-NOTE: no MVP a mensagem só é persistida em BD para consulta
      // pela staff — o envio de email fica como ponto de extensão futuro.
      return reply.code(201).send({ id: entry.id });
    });
  });
}
