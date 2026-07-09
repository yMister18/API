import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import type { Ticket, TicketMessage, TicketStatus } from "@prisma/client";

export const TICKET_CATEGORIES = [
  "Pagamentos",
  "Bugs",
  "Denúncias",
  "Recuperação de conta",
  "Outro",
] as const;

const createTicketSchema = z.object({
  subject: z.string().min(3).max(200),
  category: z.enum(TICKET_CATEGORIES),
  message: z.string().min(1).max(20_000),
});

const createMessageSchema = z.object({
  content: z.string().min(1).max(20_000),
});

const patchTicketSchema = z.object({
  status: z.enum(["aberto", "em_progresso", "resolvido", "fechado"]),
});

function serializeTicket(ticket: Ticket & { messages: TicketMessage[] }) {
  return {
    id: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    messages: ticket.messages.map((m) => ({
      id: m.id,
      author: m.author,
      authorName: m.authorName,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export default async function ticketRoutes(fastify: FastifyInstance) {
  fastify.get("/me/tickets", { preHandler: fastify.authenticate }, async (request, reply) => {
    const tickets = await prisma.ticket.findMany({
      where: { userId: request.currentUser!.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    return reply.send(tickets.map(serializeTicket));
  });

  fastify.get<{ Params: { id: string } }>(
    "/tickets/:id",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const ticket = await prisma.ticket.findUnique({
        where: { id: request.params.id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });

      if (!ticket) return reply.code(404).send({ message: "Ticket não encontrado." });

      const isOwner = ticket.userId === request.currentUser!.id;
      const isStaff = Boolean(request.currentUser!.staffRole);
      if (!isOwner && !isStaff) {
        return reply.code(403).send({ message: "Sem permissão para ver este ticket." });
      }

      return reply.send(serializeTicket(ticket));
    }
  );

  fastify.post("/tickets", { preHandler: fastify.authenticate }, async (request, reply) => {
    const body = createTicketSchema.parse(request.body);
    const user = request.currentUser!;

    const ticket = await prisma.ticket.create({
      data: {
        userId: user.id,
        subject: body.subject,
        category: body.category,
        messages: {
          create: {
            author: "user",
            authorName: user.username,
            authorUserId: user.id,
            content: body.message,
          },
        },
      },
      include: { messages: true },
    });

    return reply.code(201).send(serializeTicket(ticket));
  });

  fastify.post<{ Params: { id: string } }>(
    "/tickets/:id/messages",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const ticket = await prisma.ticket.findUnique({ where: { id: request.params.id } });
      if (!ticket) return reply.code(404).send({ message: "Ticket não encontrado." });

      const user = request.currentUser!;
      const isOwner = ticket.userId === user.id;
      const isStaff = Boolean(user.staffRole);
      if (!isOwner && !isStaff) {
        return reply.code(403).send({ message: "Sem permissão para responder a este ticket." });
      }

      const body = createMessageSchema.parse(request.body);

      const message = await prisma.ticketMessage.create({
        data: {
          ticketId: ticket.id,
          author: isStaff && !isOwner ? "staff" : isStaff ? "staff" : "user",
          authorName: user.username,
          authorUserId: user.id,
          content: body.content,
        },
      });

      // Reabre o ticket automaticamente se o dono responder a um ticket resolvido/fechado.
      if (isOwner && !isStaff && (ticket.status === "resolvido" || ticket.status === "fechado")) {
        await prisma.ticket.update({ where: { id: ticket.id }, data: { status: "aberto" } });
      }

      return reply.code(201).send({
        id: message.id,
        author: message.author,
        authorName: message.authorName,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      });
    }
  );

  fastify.patch<{ Params: { id: string } }>(
    "/tickets/:id",
    { preHandler: [fastify.authenticate, fastify.requireStaff] },
    async (request, reply) => {
      const ticket = await prisma.ticket.findUnique({ where: { id: request.params.id } });
      if (!ticket) return reply.code(404).send({ message: "Ticket não encontrado." });

      const body = patchTicketSchema.parse(request.body);

      const updated = await prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: body.status as TicketStatus },
      });

      return reply.send({ id: updated.id, status: updated.status });
    }
  );

  fastify.get(
    "/staff/tickets",
    { preHandler: [fastify.authenticate, fastify.requireStaff] },
    async (request, reply) => {
      const query = request.query as { status?: string; category?: string };

      const tickets = await prisma.ticket.findMany({
        where: {
          status: query.status ? (query.status as TicketStatus) : undefined,
          category: query.category || undefined,
        },
        include: { messages: { orderBy: { createdAt: "asc" } }, user: true },
        orderBy: { createdAt: "desc" },
      });

      return reply.send(
        tickets.map((t) => ({ ...serializeTicket(t), player: t.user.username }))
      );
    }
  );
}
