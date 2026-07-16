-- DropForeignKey
ALTER TABLE "inventory_items" DROP CONSTRAINT "inventory_items_userId_fkey";

-- DropTable
DROP TABLE "inventory_items";

-- DropEnum
DROP TYPE "ItemRarity";
