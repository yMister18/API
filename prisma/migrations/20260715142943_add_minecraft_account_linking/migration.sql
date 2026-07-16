-- CreateEnum
CREATE TYPE "MinecraftAccountType" AS ENUM ('ORIGINAL', 'PIRATA');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "minecraftAccountType" "MinecraftAccountType",
ADD COLUMN     "minecraftUuid" TEXT;

-- CreateTable
CREATE TABLE "minecraft_link_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "minecraft_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "minecraft_link_codes_code_key" ON "minecraft_link_codes"("code");

-- CreateIndex
CREATE INDEX "minecraft_link_codes_userId_idx" ON "minecraft_link_codes"("userId");

-- AddForeignKey
ALTER TABLE "minecraft_link_codes" ADD CONSTRAINT "minecraft_link_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
