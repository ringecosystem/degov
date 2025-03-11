-- CreateTable
CREATE TABLE "d_user" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "name" TEXT,
    "avatar" TEXT,
    "email" TEXT,
    "twitter" TEXT,
    "github" TEXT,
    "discord" TEXT,
    "telegram" TEXT,
    "medium" TEXT,
    "delegate_statement" TEXT,
    "additional" TEXT,
    "last_login_time" TIMESTAMP(3) NOT NULL,
    "ctime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utime" TIMESTAMP(3),

    CONSTRAINT "d_user_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "d_user_address_key" ON "d_user"("address");
