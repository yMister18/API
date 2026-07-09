import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("A semear dados de demonstração...");

  // --- Utilizador de demonstração + staff ---
  const demoUser = await prisma.user.upsert({
    where: { discordId: "demo-discord-id-1" },
    update: {},
    create: {
      discordId: "demo-discord-id-1",
      username: "Ashion_Player",
      avatarUrl: "https://cdn.discordapp.com/embed/avatars/1.png",
      minecraftUsername: "AshionPlayer",
      level: 24,
      xp: 8200,
      xpToNextLevel: 10000,
      coins: 4200,
      streakDays: 5,
      isOnline: true,
    },
  });

  const staffUser = await prisma.user.upsert({
    where: { discordId: "demo-discord-id-2" },
    update: {},
    create: {
      discordId: "demo-discord-id-2",
      username: "WarpionAdmin",
      avatarUrl: "https://cdn.discordapp.com/embed/avatars/2.png",
      staffRole: "Administrador",
      level: 60,
      xp: 100,
      xpToNextLevel: 5000,
      isOnline: true,
    },
  });

  const friendUser = await prisma.user.upsert({
    where: { discordId: "demo-discord-id-3" },
    update: {},
    create: {
      discordId: "demo-discord-id-3",
      username: "Luna_Builder",
      avatarUrl: "https://cdn.discordapp.com/embed/avatars/3.png",
      level: 30,
      isOnline: false,
    },
  });

  await prisma.friendship.upsert({
    where: { userId_friendId: { userId: demoUser.id, friendId: friendUser.id } },
    update: {},
    create: { userId: demoUser.id, friendId: friendUser.id },
  });

  // --- Missões ---
  await prisma.mission.createMany({
    data: [
      {
        userId: demoUser.id,
        title: "Caçador de Feras",
        description: "Derrota 20 monstros no Overworld.",
        progress: 12,
        target: 20,
        reward: "150 Coins",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 18),
      },
      {
        userId: demoUser.id,
        title: "Explorador",
        description: "Descobre 3 novos biomas.",
        progress: 3,
        target: 3,
        reward: "Baú Raro",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 6),
      },
    ],
  });

  // --- Conquistas ---
  const achievementDefs = [
    { key: "first-blood", title: "Primeiro Sangue", description: "Derrota o teu primeiro mob.", icon: "Swords", order: 1 },
    { key: "champion", title: "Campeão da Arena", description: "Vence 10 duelos PvP.", icon: "Trophy", order: 2 },
    { key: "explorer", title: "Grande Explorador", description: "Visita todos os biomas do servidor.", icon: "Compass", order: 3 },
  ];
  for (const def of achievementDefs) {
    await prisma.achievement.upsert({ where: { key: def.key }, update: def, create: def });
  }
  const firstBlood = await prisma.achievement.findUniqueOrThrow({ where: { key: "first-blood" } });
  await prisma.userAchievement.upsert({
    where: { userId_achievementId: { userId: demoUser.id, achievementId: firstBlood.id } },
    update: { unlocked: true, unlockedAt: new Date() },
    create: { userId: demoUser.id, achievementId: firstBlood.id, unlocked: true, unlockedAt: new Date() },
  });

  // --- Atividade, inventário, stats, notificações ---
  await prisma.activityEntry.createMany({
    data: [
      { userId: demoUser.id, message: "Subiu para o nível 24.", icon: "TrendingUp" },
      { userId: demoUser.id, message: "Desbloqueou a conquista Primeiro Sangue.", icon: "Trophy" },
    ],
  });

  await prisma.inventoryItem.createMany({
    data: [
      { userId: demoUser.id, name: "Espada Flamejante", rarity: "epico", icon: "Sword" },
      { userId: demoUser.id, name: "Poção de Vida", rarity: "comum", icon: "FlaskConical" },
      { userId: demoUser.id, name: "Coroa do Dragão", rarity: "lendario", icon: "Crown" },
    ],
  });

  await prisma.stat.createMany({
    data: [
      { userId: demoUser.id, label: "Mortes de Mobs", value: 1284, icon: "Skull", order: 1 },
      { userId: demoUser.id, label: "Blocos Colocados", value: 45210, icon: "Box", order: 2 },
      { userId: demoUser.id, label: "Tempo Jogado", value: 132, suffix: "h", icon: "Clock", order: 3 },
    ],
  });

  await prisma.notificationItem.createMany({
    data: [
      { userId: demoUser.id, message: "A tua encomenda foi entregue!", icon: "Package", read: false },
      { userId: demoUser.id, message: "Novo evento: Guerra dos Reinos.", icon: "Calendar", read: true },
    ],
  });

  // --- Fórum ---
  const category = await prisma.forumCategory.upsert({
    where: { slug: "geral" },
    update: {},
    create: {
      slug: "geral",
      name: "Geral",
      description: "Discussão geral sobre o servidor.",
      icon: "MessageSquare",
      order: 1,
    },
  });

  await prisma.forumCategory.upsert({
    where: { slug: "suporte-tecnico" },
    update: {},
    create: {
      slug: "suporte-tecnico",
      name: "Suporte Técnico",
      description: "Problemas técnicos e dúvidas de instalação.",
      icon: "LifeBuoy",
      order: 2,
    },
  });

  const topic = await prisma.forumTopic.create({
    data: {
      categoryId: category.id,
      title: "Bem-vindos ao Warpion!",
      content: "Este é o tópico oficial de boas-vindas. Apresentem-se aqui!",
      authorId: staffUser.id,
      pinned: true,
    },
  });

  await prisma.forumReply.create({
    data: {
      topicId: topic.id,
      content: "Olá a todos, animado por estar aqui!",
      authorId: demoUser.id,
    },
  });

  // --- Loja ---
  const vipItem = await prisma.shopItem.create({
    data: {
      tier: "vip",
      name: "Rank VIP",
      priceCents: 999,
      currency: "EUR",
      description: "Acesso a comandos exclusivos, kit VIP e cosmético especial.",
      perks: ["Comando /fly", "Kit VIP diário", "Tag [VIP] no chat"],
      featured: true,
    },
  });

  await prisma.shopItem.create({
    data: {
      tier: "cosmetic",
      name: "Asas de Fénix",
      priceCents: 499,
      originalPriceCents: 699,
      currency: "EUR",
      description: "Cosmético de asas animadas.",
      perks: ["Partículas exclusivas"],
    },
  });

  await prisma.shopItem.create({
    data: {
      tier: "key",
      name: "Chave Lendária",
      priceCents: 199,
      currency: "EUR",
      description: "Abre o baú lendário na spawn.",
      perks: ["1 item lendário garantido"],
    },
  });

  // --- Tickets ---
  await prisma.ticket.create({
    data: {
      userId: demoUser.id,
      subject: "Não recebi o meu VIP",
      category: "Pagamentos",
      status: "aberto",
      messages: {
        create: [
          {
            author: "user",
            authorName: demoUser.username,
            authorUserId: demoUser.id,
            content: "Comprei o rank VIP mas ainda não recebi in-game.",
          },
          {
            author: "ashion",
            authorName: "Ashion",
            content: "Obrigado pela tua mensagem! A tua compra está a ser verificada, a staff vai responder em breve.",
          },
        ],
      },
    },
  });

  // --- Conteúdo público ---
  await prisma.newsArticle.upsert({
    where: { slug: "temporada-2-lancada" },
    update: {},
    create: {
      slug: "temporada-2-lancada",
      title: "Temporada 2 já está disponível!",
      excerpt: "Novos biomas, missões e recompensas exclusivas.",
      content: "A Temporada 2 do Warpion chegou com um mapa totalmente novo...",
      category: "Atualizações",
      author: "Equipa Warpion",
      coverAccent: "from-purple-500 to-blue-500",
    },
  });

  await prisma.eventItem.create({
    data: {
      title: "Guerra dos Reinos",
      description: "Batalha épica entre clãs pelo controlo dos territórios.",
      startsAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      endsAt: new Date(Date.now() + 1000 * 60 * 60 * 30),
    },
  });

  await prisma.teamMember.create({
    data: {
      name: staffUser.username,
      role: "Administrador",
      initials: "WA",
      accent: "from-red-500 to-orange-500",
      online: true,
      order: 1,
    },
  });

  await prisma.rankPlayerEntry.createMany({
    data: [
      { type: "players", rank: 1, name: "Ashion_Player", value: "284.200 XP" },
      { type: "players", rank: 2, name: "Luna_Builder", value: "210.100 XP" },
      { type: "wealth", rank: 1, name: "WarpionAdmin", value: "$18.420.000" },
    ],
  });

  await prisma.rankClanEntry.create({
    data: { rank: 1, name: "Fénix Negra", tag: "FNX", members: 24, power: "9.820" },
  });

  await prisma.galleryImage.createMany({
    data: [
      { title: "Spawn Principal", category: "Construções", accent: "from-blue-500 to-cyan-500", order: 1 },
      { title: "Arena PvP", category: "Eventos", accent: "from-red-500 to-pink-500", order: 2 },
    ],
  });

  await prisma.fAQItem.createMany({
    data: [
      { question: "Como faço login no servidor?", answer: "Usa o IP play.warpion.pt na versão mais recente do Minecraft.", order: 1 },
      { question: "Como ligo a minha conta Discord?", answer: "Vai a Definições > Conta e clica em 'Continuar com Discord'.", order: 2 },
    ],
  });

  await prisma.banCase.create({
    data: {
      player: "Griefer123",
      reason: "Griefing na spawn",
      duration: "7 dias",
      staff: staffUser.username,
      status: "ativo",
    },
  });

  await prisma.voteSite.createMany({
    data: [
      { name: "Minecraft-MP", reward: "500 Coins", href: "https://minecraft-mp.com", order: 1 },
      { name: "Topg", reward: "1 Chave Rara", href: "https://topg.org", order: 2 },
    ],
  });

  console.log("Seed concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
