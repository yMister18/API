-- Staff: hierarquia nova (OWNER/DEVELOPER/MANAGER/ADMIN/BUILDER/MOD/HELPER)
-- substitui a antiga (Fundador/Administrador/Moderador/Builder/Suporte).
-- Faz o downcast para TEXT primeiro para poder remapear os valores existentes
-- antes de recriar o enum, em vez de os perder.
ALTER TABLE "users" ALTER COLUMN "staffRole" TYPE TEXT USING ("staffRole"::TEXT);
ALTER TABLE "team_members" ALTER COLUMN "role" TYPE TEXT USING ("role"::TEXT);

UPDATE "users" SET "staffRole" = CASE "staffRole"
  WHEN 'Fundador' THEN 'OWNER'
  WHEN 'Administrador' THEN 'ADMIN'
  WHEN 'Moderador' THEN 'MOD'
  WHEN 'Builder' THEN 'BUILDER'
  WHEN 'Suporte' THEN 'HELPER'
  ELSE "staffRole"
END
WHERE "staffRole" IS NOT NULL;

UPDATE "team_members" SET "role" = CASE "role"
  WHEN 'Fundador' THEN 'OWNER'
  WHEN 'Administrador' THEN 'ADMIN'
  WHEN 'Moderador' THEN 'MOD'
  WHEN 'Builder' THEN 'BUILDER'
  WHEN 'Suporte' THEN 'HELPER'
  ELSE "role"
END;

DROP TYPE "StaffRole";
CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'DEVELOPER', 'MANAGER', 'ADMIN', 'BUILDER', 'MOD', 'HELPER');

ALTER TABLE "users" ALTER COLUMN "staffRole" TYPE "StaffRole" USING ("staffRole"::"StaffRole");
ALTER TABLE "team_members" ALTER COLUMN "role" TYPE "StaffRole" USING ("role"::"StaffRole");

-- Novos eixos independentes do staff: Invest / Media / VIP.
-- Membro (base) não tem valor próprio — é o estado quando nenhum destes está definido.
CREATE TYPE "InvestTier" AS ENUM ('THEEND', 'NETHER', 'WORLD');
CREATE TYPE "MediaRole" AS ENUM ('FAMOUS', 'MEDIA');
CREATE TYPE "VipTier" AS ENUM ('WARPION', 'TITAN', 'MASTER', 'LEGEND', 'HERO');

ALTER TABLE "users" ADD COLUMN "investTier" "InvestTier";
ALTER TABLE "users" ADD COLUMN "mediaRole" "MediaRole";
ALTER TABLE "users" ADD COLUMN "vipTier" "VipTier";
