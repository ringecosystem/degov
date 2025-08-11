-- DropIndex
DROP INDEX "d_user_address_key";

-- AlterTable
ALTER TABLE "d_user" ADD COLUMN     "dao_code" TEXT;
