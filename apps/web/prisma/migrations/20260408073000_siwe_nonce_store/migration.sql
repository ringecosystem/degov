-- CreateTable
CREATE TABLE "d_siwe_nonce" (
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ctime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "d_siwe_nonce_pkey" PRIMARY KEY ("nonce")
);
