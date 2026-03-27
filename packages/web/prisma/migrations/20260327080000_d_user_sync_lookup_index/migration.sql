-- Restore an indexed lookup for sync/auth queries after the multi-dao migration
CREATE INDEX "d_user_dao_code_address_idx" ON "d_user"("dao_code", "address");
