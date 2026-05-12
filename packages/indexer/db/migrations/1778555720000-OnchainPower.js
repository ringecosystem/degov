module.exports = class OnchainPower1778555720000 {
    name = 'OnchainPower1778555720000'

    async up(db) {
        await db.query(`ALTER TABLE "vote_power_checkpoint" ADD "source" text`)
        await db.query(`CREATE TABLE "token_balance_checkpoint" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "token_address" text, "contract_address" text, "log_index" integer, "transaction_index" integer, "account" text NOT NULL, "previous_balance" numeric NOT NULL, "new_balance" numeric NOT NULL, "delta" numeric NOT NULL, "source" text NOT NULL, "cause" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_7e70dd0e4156db89ccdeaf7f946" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_token_balance_checkpoint_scope" ON "token_balance_checkpoint" ("chain_id", "governor_address", "token_address", "account", "block_number") `)
        await db.query(`ALTER TABLE "contributor" ADD "balance" numeric`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "contributor" DROP COLUMN "balance"`)
        await db.query(`DROP INDEX "public"."IDX_token_balance_checkpoint_scope"`)
        await db.query(`DROP TABLE "token_balance_checkpoint"`)
        await db.query(`ALTER TABLE "vote_power_checkpoint" DROP COLUMN "source"`)
    }
}
