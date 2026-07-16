import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { parsePagination } from "../../lib/pagination";
import { initialsFromName } from "../../lib/initials";
import type { EventItem } from "@prisma/client";

const createNewsSchema = z.object({
  slug: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  excerpt: z.string().min(1).max(500),
  content: z.string().default(""),
  category: z.string().min(1).max(100),
  author: z.string().min(1).max(150),
  coverAccent: z.string().min(1).max(100),
});

const updateNewsSchema = createNewsSchema.partial();

function deriveEventStatus(event: EventItem): "ativo" | "agendado" | "terminado" {
  if (event.status) return event.status;
  const now = Date.now();
  if (now < event.startsAt.getTime()) return "agendado";
  if (now > event.endsAt.getTime()) return "terminado";
  return "ativo";
}

export default async function contentRoutes(fastify: FastifyInstance) {
  fastify.get("/news", async (request, reply) => {
    const { page, pageSize, skip, take } = parsePagination(
      request.query as { page?: number; pageSize?: number }
    );

    const [articles, total] = await Promise.all([
      prisma.newsArticle.findMany({ orderBy: { publishedAt: "desc" }, skip, take }),
      prisma.newsArticle.count(),
    ]);

    return reply.send({
      data: articles.map((a) => ({
        id: a.id,
        slug: a.slug,
        title: a.title,
        excerpt: a.excerpt,
        category: a.category,
        author: a.author,
        publishedAt: a.publishedAt.toISOString(),
        coverAccent: a.coverAccent,
      })),
      page,
      pageSize,
      total,
    });
  });

  fastify.get<{ Params: { slug: string } }>("/news/:slug", async (request, reply) => {
    const article = await prisma.newsArticle.findUnique({ where: { slug: request.params.slug } });
    if (!article) return reply.code(404).send({ message: "Notícia não encontrada." });

    return reply.send({
      id: article.id,
      slug: article.slug,
      title: article.title,
      excerpt: article.excerpt,
      content: article.content,
      category: article.category,
      author: article.author,
      publishedAt: article.publishedAt.toISOString(),
      coverAccent: article.coverAccent,
    });
  });

  fastify.post("/news", { preHandler: [fastify.authenticate, fastify.requireManagerStaff] }, async (request, reply) => {
    const body = createNewsSchema.parse(request.body);

    const existing = await prisma.newsArticle.findUnique({ where: { slug: body.slug } });
    if (existing) return reply.code(409).send({ message: "Já existe uma notícia com este slug." });

    const article = await prisma.newsArticle.create({ data: body });
    return reply.code(201).send(article);
  });

  fastify.patch<{ Params: { id: string } }>(
    "/news/:id",
    { preHandler: [fastify.authenticate, fastify.requireManagerStaff] },
    async (request, reply) => {
      const body = updateNewsSchema.parse(request.body);

      const article = await prisma.newsArticle.findUnique({ where: { id: request.params.id } });
      if (!article) return reply.code(404).send({ message: "Notícia não encontrada." });

      if (body.slug && body.slug !== article.slug) {
        const existing = await prisma.newsArticle.findUnique({ where: { slug: body.slug } });
        if (existing) return reply.code(409).send({ message: "Já existe uma notícia com este slug." });
      }

      const updated = await prisma.newsArticle.update({ where: { id: article.id }, data: body });
      return reply.send(updated);
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/news/:id",
    { preHandler: [fastify.authenticate, fastify.requireManagerStaff] },
    async (request, reply) => {
      const article = await prisma.newsArticle.findUnique({ where: { id: request.params.id } });
      if (!article) return reply.code(404).send({ message: "Notícia não encontrada." });

      await prisma.newsArticle.delete({ where: { id: article.id } });
      return reply.code(204).send();
    }
  );

  fastify.get("/events", async (_request, reply) => {
    const events = await prisma.eventItem.findMany({ orderBy: { startsAt: "asc" } });
    return reply.send(
      events.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt.toISOString(),
        status: deriveEventStatus(e),
      }))
    );
  });

  fastify.get("/team", async (_request, reply) => {
    const members = await prisma.teamMember.findMany({ orderBy: { order: "asc" } });
    return reply.send(
      members.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        initials: m.initials || initialsFromName(m.name),
        accent: m.accent,
        online: m.online,
      }))
    );
  });

  fastify.get("/rankings/players", async (_request, reply) => {
    const entries = await prisma.rankPlayerEntry.findMany({
      where: { type: "players" },
      orderBy: { rank: "asc" },
    });
    return reply.send(
      entries.map((e) => ({ id: e.id, rank: e.rank, name: e.name, value: e.value, guild: e.guild ?? undefined }))
    );
  });

  fastify.get("/rankings/wealth", async (_request, reply) => {
    const entries = await prisma.rankPlayerEntry.findMany({
      where: { type: "wealth" },
      orderBy: { rank: "asc" },
    });
    return reply.send(
      entries.map((e) => ({ id: e.id, rank: e.rank, name: e.name, value: e.value, guild: e.guild ?? undefined }))
    );
  });

  fastify.get("/rankings/clans", async (_request, reply) => {
    const entries = await prisma.rankClanEntry.findMany({ orderBy: { rank: "asc" } });
    return reply.send(
      entries.map((e) => ({
        id: e.id,
        rank: e.rank,
        name: e.name,
        tag: e.tag,
        members: e.members,
        power: e.power,
      }))
    );
  });

  fastify.get("/gallery", async (_request, reply) => {
    const images = await prisma.galleryImage.findMany({ orderBy: { order: "asc" } });
    return reply.send(
      images.map((i) => ({ id: i.id, title: i.title, category: i.category, accent: i.accent }))
    );
  });

  fastify.get("/faq", async (_request, reply) => {
    const items = await prisma.fAQItem.findMany({ orderBy: { order: "asc" } });
    return reply.send(items.map((f) => ({ id: f.id, question: f.question, answer: f.answer })));
  });

  fastify.get("/bans", async (request, reply) => {
    const { page, pageSize, skip, take } = parsePagination(
      request.query as { page?: number; pageSize?: number }
    );
    const { status } = request.query as { status?: string };

    const [bans, total] = await Promise.all([
      prisma.banCase.findMany({
        where: { status: status ? (status as any) : undefined },
        orderBy: { date: "desc" },
        skip,
        take,
      }),
      prisma.banCase.count({ where: { status: status ? (status as any) : undefined } }),
    ]);

    return reply.send({
      data: bans.map((b) => ({
        id: b.id,
        player: b.player,
        reason: b.reason,
        duration: b.duration,
        staff: b.staff,
        date: b.date.toISOString(),
        status: b.status,
      })),
      page,
      pageSize,
      total,
    });
  });

  fastify.get("/vote-sites", async (_request, reply) => {
    const sites = await prisma.voteSite.findMany({ orderBy: { order: "asc" } });
    return reply.send(sites.map((s) => ({ id: s.id, name: s.name, reward: s.reward, href: s.href })));
  });
}
