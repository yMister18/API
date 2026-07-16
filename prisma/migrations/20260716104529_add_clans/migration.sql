-- CreateEnum
CREATE TYPE "ClanRole" AS ENUM ('LEADER', 'OFFICER', 'MEMBER');

-- CreateEnum
CREATE TYPE "ClanInviteStatus" AS ENUM ('pendente', 'aceite', 'recusado', 'cancelado');

-- CreateTable
CREATE TABLE "clans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "bannerAccent" TEXT NOT NULL DEFAULT 'from-purple-600 to-blue-600',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_members" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ClanRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_invites" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "status" "ClanInviteStatus" NOT NULL DEFAULT 'pendente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clans_tag_key" ON "clans"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "clan_members_userId_key" ON "clan_members"("userId");

-- CreateIndex
CREATE INDEX "clan_members_clanId_idx" ON "clan_members"("clanId");

-- CreateIndex
CREATE INDEX "clan_invites_clanId_idx" ON "clan_invites"("clanId");

-- CreateIndex
CREATE INDEX "clan_invites_invitedUserId_idx" ON "clan_invites"("invitedUserId");

-- AddForeignKey
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_invites" ADD CONSTRAINT "clan_invites_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "clans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_invites" ADD CONSTRAINT "clan_invites_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_invites" ADD CONSTRAINT "clan_invites_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
