module.exports = class OnchainRefreshTask1778660000000 {
    name = 'OnchainRefreshTask1778660000000'

    async up(db) {
        await db.query(`CREATE TABLE "onchain_refresh_task" ("id" character varying NOT NULL, "chain_id" integer NOT NULL, "dao_code" text, "governor_address" text NOT NULL, "token_address" text NOT NULL, "account" text NOT NULL, "refresh_balance" boolean NOT NULL, "refresh_power" boolean NOT NULL, "reason" text NOT NULL, "first_seen_block_number" numeric NOT NULL, "last_seen_block_number" numeric NOT NULL, "last_seen_block_timestamp" numeric NOT NULL, "last_seen_transaction_hash" text NOT NULL, "status" text NOT NULL, "attempts" integer NOT NULL, "next_run_at" numeric NOT NULL, "locked_at" numeric, "locked_by" text, "processed_at" numeric, "error" text, "pending_after_lock" boolean NOT NULL DEFAULT false, "pending_after_lock_block_number" numeric, "pending_after_lock_block_timestamp" numeric, "pending_after_lock_transaction_hash" text, "created_at" numeric NOT NULL, "updated_at" numeric NOT NULL, CONSTRAINT "PK_onchain_refresh_task" PRIMARY KEY ("id"))`)
        await db.query(`CREATE UNIQUE INDEX "IDX_onchain_refresh_task_scope_account" ON "onchain_refresh_task" ("chain_id", "governor_address", "token_address", "account") `)
        await db.query(`CREATE INDEX "IDX_onchain_refresh_task_status_next_run" ON "onchain_refresh_task" ("status", "next_run_at") `)
        await db.query(`CREATE INDEX "IDX_onchain_refresh_task_locked" ON "onchain_refresh_task" ("status", "locked_at") `)
    }

    async down(db) {
        await db.query(`DROP INDEX "public"."IDX_onchain_refresh_task_locked"`)
        await db.query(`DROP INDEX "public"."IDX_onchain_refresh_task_status_next_run"`)
        await db.query(`DROP INDEX "public"."IDX_onchain_refresh_task_scope_account"`)
        await db.query(`DROP TABLE "onchain_refresh_task"`)
    }
}
