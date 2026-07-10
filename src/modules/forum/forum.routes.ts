import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { initialsFromName } from "../../lib/initials";
import { parsePagination } from "../../lib/pagination";

const createTopicSchema = z.object({
  title: z.string().min(3).max(200),
  content: z.string().min(1).max(20_000),
});

const createReplySchema = z.object({
  content: z.string().min(1).max(20_000),
});

const patchTopicSchema = z.object({
  pinned: z.boolean(),
});

export default async function forumRoutes(fastify: FastifyInstance) {
  fastify.get("/categories", async (_request, reply) => {
    const categories = await prisma.forumCategory.findMany({ orderBy: { order: "asc" } });

    const withCounts = await Promise.all(
      categories.map(async (c) => {
        const [topicCount, postCount] = await Promise.all([
          prisma.forumTopic.count({ where: { categoryId: c.id } }),
          prisma.forumReply.count({ where: { topic: { categoryId: c.id } } }),
        ]);
        return {
          id: c.id,
          slug: c.slug,
          name: c.name,
          description: c.description,
          icon: c.icon,
          topicCount,
          postCount: postCount + topicCount,
        };
      })
    );

    return reply.send(withCounts);
  });

  fastify.get<{ Params: { slug: string } }>(
    "/categories/:slug/topics",
    async (request, reply) => {
      const category = await prisma.forumCategory.findUnique({
        where: { slug: request.params.slug },
      });
      if (!category) return reply.code(404).send({ message: "Categoria não encontrada." });

      const { page, pageSize, skip, take } = parsePagination(
        request.query as { page?: number; pageSize?: number }
      );

      const [topics, total] = await Promise.all([
        prisma.forumTopic.findMany({
          where: { categoryId: category.id },
          include: {
            author: true,
            _count: { select: { replies: true } },
          },
          orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
          skip,
          take,
        }),
        prisma.forumTopic.count({ where: { categoryId: category.id } }),
      ]);

      // FRONTEND-NOTE: esta listagem não inclui `replies` completas (só
      // metadados de preview via `replyCount`), ao contrário do
      // ForumTopic completo devolvido em GET /categories/:slug/topics/:topicId.
      return reply.send({
        data: topics.map((t) => ({
          id: t.id,
          categorySlug: category.slug,
          title: t.title,
          author: t.author.username,
          authorInitials: initialsFromName(t.author.username),
          createdAt: t.createdAt.toISOString(),
          pinned: t.pinned,
          content: t.content,
          replies: [],
          replyCount: t._count.replies,
        })),
        page,
        pageSize,
        total,
      });
    }
  );

  fastify.get<{ Params: { slug: string; topicId: string } }>(
    "/categories/:slug/topics/:topicId",
    async (request, reply) => {
      const topic = await prisma.forumTopic.findUnique({
        where: { id: request.params.topicId },
        include: {
          author: true,
          category: true,
          replies: { include: { author: true }, orderBy: { createdAt: "asc" } },
        },
      });

      if (!topic || topic.category.slug !== request.params.slug) {
        return reply.code(404).send({ message: "Tópico não encontrado." });
      }

      return reply.send({
        id: topic.id,
        categorySlug: topic.category.slug,
        title: topic.title,
        author: topic.author.username,
        authorInitials: initialsFromName(topic.author.username),
        createdAt: topic.createdAt.toISOString(),
        pinned: topic.pinned,
        content: topic.content,
        replies: topic.replies.map((r) => ({
          id: r.id,
          author: r.author.username,
          authorInitials: initialsFromName(r.author.username),
          createdAt: r.createdAt.toISOString(),
          content: r.content,
        })),
      });
    }
  );

  fastify.post<{ Params: { slug: string } }>(
    "/categories/:slug/topics",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const category = await prisma.forumCategory.findUnique({
        where: { slug: request.params.slug },
      });
      if (!category) return reply.code(404).send({ message: "Categoria não encontrada." });

      const body = createTopicSchema.parse(request.body);

      const topic = await prisma.forumTopic.create({
        data: {
          categoryId: category.id,
          title: body.title,
          content: body.content,
          authorId: request.currentUser!.id,
        },
        include: { author: true },
      });

      return reply.code(201).send({
        id: topic.id,
        categorySlug: category.slug,
        title: topic.title,
        author: topic.author.username,
        authorInitials: initialsFromName(topic.author.username),
        createdAt: topic.createdAt.toISOString(),
        pinned: topic.pinned,
        content: topic.content,
        replies: [],
      });
    }
  );

  fastify.post<{ Params: { topicId: string } }>(
    "/topics/:topicId/replies",
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const topic = await prisma.forumTopic.findUnique({ where: { id: request.params.topicId } });
      if (!topic) return reply.code(404).send({ message: "Tópico não encontrado." });

      const body = createReplySchema.parse(request.body);

      const replyEntity = await prisma.forumReply.create({
        data: {
          topicId: topic.id,
          content: body.content,
          authorId: request.currentUser!.id,
        },
        include: { author: true },
      });

      return reply.code(201).send({
        id: replyEntity.id,
        author: replyEntity.author.username,
        authorInitials: initialsFromName(replyEntity.author.username),
        createdAt: replyEntity.createdAt.toISOString(),
        content: replyEntity.content,
      });
    }
  );

  fastify.patch<{ Params: { topicId: string } }>(
    "/topics/:topicId",
    { preHandler: [fastify.authenticate, fastify.requireStaff] },
    async (request, reply) => {
      const topic = await prisma.forumTopic.findUnique({ where: { id: request.params.topicId } });
      if (!topic) return reply.code(404).send({ message: "Tópico não encontrado." });

      const body = patchTopicSchema.parse(request.body);

      const updated = await prisma.forumTopic.update({
        where: { id: topic.id },
        data: { pinned: body.pinned },
      });

      return reply.send({ id: updated.id, pinned: updated.pinned });
    }
  );
}
