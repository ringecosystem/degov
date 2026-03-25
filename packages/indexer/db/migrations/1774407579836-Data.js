module.exports = class Data1774407579836 {
    name = 'Data1774407579836'

    async up(db) {
        await db.query(`CREATE TABLE "vote_power_checkpoint" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "token_address" text, "contract_address" text, "log_index" integer, "transaction_index" integer, "account" text NOT NULL, "clock_mode" text NOT NULL, "timepoint" numeric NOT NULL, "previous_power" numeric NOT NULL, "new_power" numeric NOT NULL, "delta" numeric NOT NULL, "cause" text NOT NULL, "delegator" text, "from_delegate" text, "to_delegate" text, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_a7046c290a7a7d881283853f3f7" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_08c8f53fdccf02212a8da0ee1e" ON "vote_power_checkpoint" ("chain_id", "governor_address", "token_address", "account", "clock_mode", "timepoint") `)
    }

    async down(db) {
        await db.query(`DROP TABLE "vote_power_checkpoint"`)
        await db.query(`DROP INDEX "public"."IDX_08c8f53fdccf02212a8da0ee1e"`)
    }
}
