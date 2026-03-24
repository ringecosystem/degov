module.exports = class AddScopeFields1774369502838 {
    name = 'AddScopeFields1774369502838'

    async up(db) {
        await db.query(`ALTER TABLE "delegate_changed"
            ADD COLUMN IF NOT EXISTS "chain_id" integer,
            ADD COLUMN IF NOT EXISTS "dao_code" text,
            ADD COLUMN IF NOT EXISTS "governor_address" text,
            ADD COLUMN IF NOT EXISTS "token_address" text,
            ADD COLUMN IF NOT EXISTS "contract_address" text,
            ADD COLUMN IF NOT EXISTS "log_index" integer,
            ADD COLUMN IF NOT EXISTS "transaction_index" integer`)
        await db.query(`CREATE INDEX IF NOT EXISTS "IDX_0fed007c6b7b9a0d5db284a1ad" ON "delegate_changed" ("chain_id", "governor_address", "delegator") `)

        await db.query(`ALTER TABLE "delegate_votes_changed"
            ADD COLUMN IF NOT EXISTS "chain_id" integer,
            ADD COLUMN IF NOT EXISTS "dao_code" text,
            ADD COLUMN IF NOT EXISTS "governor_address" text,
            ADD COLUMN IF NOT EXISTS "token_address" text,
            ADD COLUMN IF NOT EXISTS "contract_address" text,
            ADD COLUMN IF NOT EXISTS "log_index" integer,
            ADD COLUMN IF NOT EXISTS "transaction_index" integer`)
        await db.query(`CREATE INDEX IF NOT EXISTS "IDX_8b36c6f37c8e64f25dd9e5264d" ON "delegate_votes_changed" ("chain_id", "governor_address", "delegate") `)

        await db.query(`ALTER TABLE "token_transfer"
            ADD COLUMN IF NOT EXISTS "chain_id" integer,
            ADD COLUMN IF NOT EXISTS "dao_code" text,
            ADD COLUMN IF NOT EXISTS "governor_address" text,
            ADD COLUMN IF NOT EXISTS "token_address" text,
            ADD COLUMN IF NOT EXISTS "contract_address" text,
            ADD COLUMN IF NOT EXISTS "log_index" integer,
            ADD COLUMN IF NOT EXISTS "transaction_index" integer`)
        await db.query(`CREATE INDEX IF NOT EXISTS "IDX_e3fe323128cc8da72b2d7b5d6a" ON "token_transfer" ("chain_id", "governor_address", "token_address") `)

        await db.query(`ALTER TABLE "proposal_canceled"
            ADD COLUMN IF NOT EXISTS "chain_id" integer,
            ADD COLUMN IF NOT EXISTS "dao_code" text,
            ADD COLUMN IF NOT EXISTS "governor_address" text,
            ADD COLUMN IF NOT EXISTS "contract_address" text,
            ADD COLUMN IF NOT EXISTS "log_index" integer,
            ADD COLUMN IF NOT EXISTS "transaction_index" integer`)
        await db.query(`CREATE INDEX IF NOT EXISTS "IDX_ce8974da5dced94a5a3fb7849f" ON "proposal_canceled" ("chain_id", "governor_address", "proposal_id") `)

        await db.query(`ALTER TABLE "proposal_created"
            ADD COLUMN IF NOT EXISTS "chain_id" integer,
            ADD COLUMN IF NOT EXISTS "dao_code" text,
            ADD COLUMN IF NOT EXISTS "governor_address" text,
            ADD COLUMN IF NOT EXISTS "contract_address" text,
            ADD COLUMN IF NOT EXISTS "log_index" integer,
            ADD COLUMN IF NOT EXISTS "transaction_index" integer`)
        await db.query(`CREATE INDEX IF NOT EXISTS "IDX_0baf06a475c01030f465b563e6" ON "proposal_created" ("chain_id", "governor_address", "proposal_id") `)

        await db.query(`ALTER TABLE "proposal_executed"
            ADD COLUMN IF NOT EXISTS "chain_id" integer,
            ADD COLUMN IF NOT EXISTS "dao_code" text,
            ADD COLUMN IF NOT EXISTS "governor_address" text,
            ADD COLUMN IF NOT EXISTS "contract_address" text,
            ADD COLUMN IF NOT EXISTS "log_index" integer,
            ADD COLUMN IF NOT EXISTS "transaction_index" integer`)
        await db.query(`CREATE INDEX IF NOT EXISTS "IDX_236183a9fbc8bab05c572325b0" ON "proposal_executed" ("chain_id", "governor_address", "proposal_id") `)

        await db.query(`ALTER TABLE "proposal_queued"
            ADD COLUMN IF NOT EXISTS "chain_id" integer,
            ADD COLUMN IF NOT EXISTS "dao_code" text,
            ADD COLUMN IF NOT EXISTS "governor_address" text,
            ADD COLUMN IF NOT EXISTS "contract_address" text,
            ADD COLUMN IF NOT EXISTS "log_index" integer,
            ADD COLUMN IF NOT EXISTS "transaction_index" integer`)
        await db.query(`CREATE INDEX IF NOT EXISTS "IDX_58acbeb4d04c455acbc8b18617" ON "proposal_queued" ("chain_id", "governor_address", "proposal_id") `)

        await db.query(`ALTER TABLE "vote_cast"
            ADD COLUMN IF NOT EXISTS "chain_id" integer,
            ADD COLUMN IF NOT EXISTS "dao_code" text,
            ADD COLUMN IF NOT EXISTS "governor_address" text,
            ADD COLUMN IF NOT EXISTS "contract_address" text,
            ADD COLUMN IF NOT EXISTS "log_index" integer,
            ADD COLUMN IF NOT EXISTS "transaction_index" integer`)
        await db.query(`CREATE INDEX IF NOT EXISTS "IDX_51a29cfd1e5f71932317a66133" ON "vote_cast" ("chain_id", "governor_address", "proposal_id") `)

        await db.query(`ALTER TABLE "vote_cast_with_params"
            ADD COLUMN IF NOT EXISTS "chain_id" integer,
            ADD COLUMN IF NOT EXISTS "dao_code" text,
            ADD COLUMN IF NOT EXISTS "governor_address" text,
            ADD COLUMN IF NOT EXISTS "contract_address" text,
            ADD COLUMN IF NOT EXISTS "log_index" integer,
            ADD COLUMN IF NOT EXISTS "transaction_index" integer`)
        await db.query(`CREATE INDEX IF NOT EXISTS "IDX_74f9e8ec92107a0e3e0e9011e8" ON "vote_cast_with_params" ("chain_id", "governor_address", "proposal_id") `)

        await db.query(`ALTER TABLE "proposal"
            ADD COLUMN IF NOT EXISTS "chain_id" integer,
            ADD COLUMN IF NOT EXISTS "dao_code" text,
            ADD COLUMN IF NOT EXISTS "governor_address" text,
            ADD COLUMN IF NOT EXISTS "contract_address" text,
            ADD COLUMN IF NOT EXISTS "log_index" integer,
            ADD COLUMN IF NOT EXISTS "transaction_index" integer`)
        await db.query(`CREATE INDEX IF NOT EXISTS "IDX_c2956b263206187757df55ad45" ON "proposal" ("chain_id", "governor_address", "proposal_id") `)

        await db.query(`ALTER TABLE "vote_cast_group"
            ADD COLUMN IF NOT EXISTS "chain_id" integer,
            ADD COLUMN IF NOT EXISTS "dao_code" text,
            ADD COLUMN IF NOT EXISTS "governor_address" text,
            ADD COLUMN IF NOT EXISTS "contract_address" text,
            ADD COLUMN IF NOT EXISTS "log_index" integer,
            ADD COLUMN IF NOT EXISTS "transaction_index" integer`)
        await db.query(`CREATE INDEX IF NOT EXISTS "IDX_35b8709ea26d346c86d9ee76e3" ON "vote_cast_group" ("chain_id", "governor_address", "ref_proposal_id") `)

        await db.query(`ALTER TABLE "data_metric"
            ADD COLUMN IF NOT EXISTS "chain_id" integer,
            ADD COLUMN IF NOT EXISTS "dao_code" text,
            ADD COLUMN IF NOT EXISTS "governor_address" text,
            ADD COLUMN IF NOT EXISTS "token_address" text,
            ADD COLUMN IF NOT EXISTS "contract_address" text,
            ADD COLUMN IF NOT EXISTS "log_index" integer,
            ADD COLUMN IF NOT EXISTS "transaction_index" integer`)
        await db.query(`CREATE INDEX IF NOT EXISTS "IDX_95c80384fafd3caf17631ee3a4" ON "data_metric" ("chain_id", "governor_address", "dao_code") `)

        await db.query(`ALTER TABLE "delegate_rolling"
            ADD COLUMN IF NOT EXISTS "chain_id" integer,
            ADD COLUMN IF NOT EXISTS "dao_code" text,
            ADD COLUMN IF NOT EXISTS "governor_address" text,
            ADD COLUMN IF NOT EXISTS "token_address" text,
            ADD COLUMN IF NOT EXISTS "contract_address" text,
            ADD COLUMN IF NOT EXISTS "log_index" integer,
            ADD COLUMN IF NOT EXISTS "transaction_index" integer`)
        await db.query(`CREATE INDEX IF NOT EXISTS "IDX_f68da56408b641c4ed4d4e1a96" ON "delegate_rolling" ("chain_id", "governor_address", "delegator") `)

        await db.query(`ALTER TABLE "delegate"
            ADD COLUMN IF NOT EXISTS "chain_id" integer,
            ADD COLUMN IF NOT EXISTS "dao_code" text,
            ADD COLUMN IF NOT EXISTS "governor_address" text,
            ADD COLUMN IF NOT EXISTS "token_address" text,
            ADD COLUMN IF NOT EXISTS "contract_address" text,
            ADD COLUMN IF NOT EXISTS "log_index" integer,
            ADD COLUMN IF NOT EXISTS "transaction_index" integer`)
        await db.query(`CREATE INDEX IF NOT EXISTS "IDX_3ff4b3a851b38f29afb15bafcc" ON "delegate" ("chain_id", "governor_address", "from_delegate", "to_delegate") `)

        await db.query(`ALTER TABLE "contributor"
            ADD COLUMN IF NOT EXISTS "chain_id" integer,
            ADD COLUMN IF NOT EXISTS "dao_code" text,
            ADD COLUMN IF NOT EXISTS "governor_address" text,
            ADD COLUMN IF NOT EXISTS "token_address" text,
            ADD COLUMN IF NOT EXISTS "contract_address" text,
            ADD COLUMN IF NOT EXISTS "log_index" integer,
            ADD COLUMN IF NOT EXISTS "transaction_index" integer`)
        await db.query(`CREATE INDEX IF NOT EXISTS "IDX_34d8a39d812fd6841f0cd49238" ON "contributor" ("chain_id", "governor_address", "id") `)

        await db.query(`ALTER TABLE "delegate_mapping"
            ADD COLUMN IF NOT EXISTS "chain_id" integer,
            ADD COLUMN IF NOT EXISTS "dao_code" text,
            ADD COLUMN IF NOT EXISTS "governor_address" text,
            ADD COLUMN IF NOT EXISTS "token_address" text,
            ADD COLUMN IF NOT EXISTS "contract_address" text,
            ADD COLUMN IF NOT EXISTS "log_index" integer,
            ADD COLUMN IF NOT EXISTS "transaction_index" integer`)
        await db.query(`CREATE INDEX IF NOT EXISTS "IDX_b593bc2d019039d306e64c5128" ON "delegate_mapping" ("chain_id", "governor_address", "from") `)
    }

    async down(db) {
        await db.query(`DROP INDEX IF EXISTS "public"."IDX_0fed007c6b7b9a0d5db284a1ad"`)
        await db.query(`ALTER TABLE "delegate_changed"
            DROP COLUMN IF EXISTS "chain_id",
            DROP COLUMN IF EXISTS "dao_code",
            DROP COLUMN IF EXISTS "governor_address",
            DROP COLUMN IF EXISTS "token_address",
            DROP COLUMN IF EXISTS "contract_address",
            DROP COLUMN IF EXISTS "log_index",
            DROP COLUMN IF EXISTS "transaction_index"`)

        await db.query(`DROP INDEX IF EXISTS "public"."IDX_8b36c6f37c8e64f25dd9e5264d"`)
        await db.query(`ALTER TABLE "delegate_votes_changed"
            DROP COLUMN IF EXISTS "chain_id",
            DROP COLUMN IF EXISTS "dao_code",
            DROP COLUMN IF EXISTS "governor_address",
            DROP COLUMN IF EXISTS "token_address",
            DROP COLUMN IF EXISTS "contract_address",
            DROP COLUMN IF EXISTS "log_index",
            DROP COLUMN IF EXISTS "transaction_index"`)

        await db.query(`DROP INDEX IF EXISTS "public"."IDX_e3fe323128cc8da72b2d7b5d6a"`)
        await db.query(`ALTER TABLE "token_transfer"
            DROP COLUMN IF EXISTS "chain_id",
            DROP COLUMN IF EXISTS "dao_code",
            DROP COLUMN IF EXISTS "governor_address",
            DROP COLUMN IF EXISTS "token_address",
            DROP COLUMN IF EXISTS "contract_address",
            DROP COLUMN IF EXISTS "log_index",
            DROP COLUMN IF EXISTS "transaction_index"`)

        await db.query(`DROP INDEX IF EXISTS "public"."IDX_ce8974da5dced94a5a3fb7849f"`)
        await db.query(`ALTER TABLE "proposal_canceled"
            DROP COLUMN IF EXISTS "chain_id",
            DROP COLUMN IF EXISTS "dao_code",
            DROP COLUMN IF EXISTS "governor_address",
            DROP COLUMN IF EXISTS "contract_address",
            DROP COLUMN IF EXISTS "log_index",
            DROP COLUMN IF EXISTS "transaction_index"`)

        await db.query(`DROP INDEX IF EXISTS "public"."IDX_0baf06a475c01030f465b563e6"`)
        await db.query(`ALTER TABLE "proposal_created"
            DROP COLUMN IF EXISTS "chain_id",
            DROP COLUMN IF EXISTS "dao_code",
            DROP COLUMN IF EXISTS "governor_address",
            DROP COLUMN IF EXISTS "contract_address",
            DROP COLUMN IF EXISTS "log_index",
            DROP COLUMN IF EXISTS "transaction_index"`)

        await db.query(`DROP INDEX IF EXISTS "public"."IDX_236183a9fbc8bab05c572325b0"`)
        await db.query(`ALTER TABLE "proposal_executed"
            DROP COLUMN IF EXISTS "chain_id",
            DROP COLUMN IF EXISTS "dao_code",
            DROP COLUMN IF EXISTS "governor_address",
            DROP COLUMN IF EXISTS "contract_address",
            DROP COLUMN IF EXISTS "log_index",
            DROP COLUMN IF EXISTS "transaction_index"`)

        await db.query(`DROP INDEX IF EXISTS "public"."IDX_58acbeb4d04c455acbc8b18617"`)
        await db.query(`ALTER TABLE "proposal_queued"
            DROP COLUMN IF EXISTS "chain_id",
            DROP COLUMN IF EXISTS "dao_code",
            DROP COLUMN IF EXISTS "governor_address",
            DROP COLUMN IF EXISTS "contract_address",
            DROP COLUMN IF EXISTS "log_index",
            DROP COLUMN IF EXISTS "transaction_index"`)

        await db.query(`DROP INDEX IF EXISTS "public"."IDX_51a29cfd1e5f71932317a66133"`)
        await db.query(`ALTER TABLE "vote_cast"
            DROP COLUMN IF EXISTS "chain_id",
            DROP COLUMN IF EXISTS "dao_code",
            DROP COLUMN IF EXISTS "governor_address",
            DROP COLUMN IF EXISTS "contract_address",
            DROP COLUMN IF EXISTS "log_index",
            DROP COLUMN IF EXISTS "transaction_index"`)

        await db.query(`DROP INDEX IF EXISTS "public"."IDX_74f9e8ec92107a0e3e0e9011e8"`)
        await db.query(`ALTER TABLE "vote_cast_with_params"
            DROP COLUMN IF EXISTS "chain_id",
            DROP COLUMN IF EXISTS "dao_code",
            DROP COLUMN IF EXISTS "governor_address",
            DROP COLUMN IF EXISTS "contract_address",
            DROP COLUMN IF EXISTS "log_index",
            DROP COLUMN IF EXISTS "transaction_index"`)

        await db.query(`DROP INDEX IF EXISTS "public"."IDX_c2956b263206187757df55ad45"`)
        await db.query(`ALTER TABLE "proposal"
            DROP COLUMN IF EXISTS "chain_id",
            DROP COLUMN IF EXISTS "dao_code",
            DROP COLUMN IF EXISTS "governor_address",
            DROP COLUMN IF EXISTS "contract_address",
            DROP COLUMN IF EXISTS "log_index",
            DROP COLUMN IF EXISTS "transaction_index"`)

        await db.query(`DROP INDEX IF EXISTS "public"."IDX_35b8709ea26d346c86d9ee76e3"`)
        await db.query(`ALTER TABLE "vote_cast_group"
            DROP COLUMN IF EXISTS "chain_id",
            DROP COLUMN IF EXISTS "dao_code",
            DROP COLUMN IF EXISTS "governor_address",
            DROP COLUMN IF EXISTS "contract_address",
            DROP COLUMN IF EXISTS "log_index",
            DROP COLUMN IF EXISTS "transaction_index"`)

        await db.query(`DROP INDEX IF EXISTS "public"."IDX_95c80384fafd3caf17631ee3a4"`)
        await db.query(`ALTER TABLE "data_metric"
            DROP COLUMN IF EXISTS "chain_id",
            DROP COLUMN IF EXISTS "dao_code",
            DROP COLUMN IF EXISTS "governor_address",
            DROP COLUMN IF EXISTS "token_address",
            DROP COLUMN IF EXISTS "contract_address",
            DROP COLUMN IF EXISTS "log_index",
            DROP COLUMN IF EXISTS "transaction_index"`)

        await db.query(`DROP INDEX IF EXISTS "public"."IDX_f68da56408b641c4ed4d4e1a96"`)
        await db.query(`ALTER TABLE "delegate_rolling"
            DROP COLUMN IF EXISTS "chain_id",
            DROP COLUMN IF EXISTS "dao_code",
            DROP COLUMN IF EXISTS "governor_address",
            DROP COLUMN IF EXISTS "token_address",
            DROP COLUMN IF EXISTS "contract_address",
            DROP COLUMN IF EXISTS "log_index",
            DROP COLUMN IF EXISTS "transaction_index"`)

        await db.query(`DROP INDEX IF EXISTS "public"."IDX_3ff4b3a851b38f29afb15bafcc"`)
        await db.query(`ALTER TABLE "delegate"
            DROP COLUMN IF EXISTS "chain_id",
            DROP COLUMN IF EXISTS "dao_code",
            DROP COLUMN IF EXISTS "governor_address",
            DROP COLUMN IF EXISTS "token_address",
            DROP COLUMN IF EXISTS "contract_address",
            DROP COLUMN IF EXISTS "log_index",
            DROP COLUMN IF EXISTS "transaction_index"`)

        await db.query(`DROP INDEX IF EXISTS "public"."IDX_34d8a39d812fd6841f0cd49238"`)
        await db.query(`ALTER TABLE "contributor"
            DROP COLUMN IF EXISTS "chain_id",
            DROP COLUMN IF EXISTS "dao_code",
            DROP COLUMN IF EXISTS "governor_address",
            DROP COLUMN IF EXISTS "token_address",
            DROP COLUMN IF EXISTS "contract_address",
            DROP COLUMN IF EXISTS "log_index",
            DROP COLUMN IF EXISTS "transaction_index"`)

        await db.query(`DROP INDEX IF EXISTS "public"."IDX_b593bc2d019039d306e64c5128"`)
        await db.query(`ALTER TABLE "delegate_mapping"
            DROP COLUMN IF EXISTS "chain_id",
            DROP COLUMN IF EXISTS "dao_code",
            DROP COLUMN IF EXISTS "governor_address",
            DROP COLUMN IF EXISTS "token_address",
            DROP COLUMN IF EXISTS "contract_address",
            DROP COLUMN IF EXISTS "log_index",
            DROP COLUMN IF EXISTS "transaction_index"`)
    }
}
