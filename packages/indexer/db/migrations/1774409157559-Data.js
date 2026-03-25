module.exports = class Data1774409157559 {
    name = 'Data1774409157559'

    async up(db) {
        await db.query(`CREATE TABLE "timelock_call" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "timelock_address" text NOT NULL, "contract_address" text, "log_index" integer, "transaction_index" integer, "operation_id" character varying NOT NULL, "proposal_id" character varying, "proposal_action_id" text, "proposal_action_index" integer, "action_index" integer NOT NULL, "target" text NOT NULL, "value" text NOT NULL, "data" text NOT NULL, "predecessor" text, "delay_seconds" numeric, "state" text NOT NULL, "scheduled_block_number" numeric, "scheduled_block_timestamp" numeric, "scheduled_transaction_hash" text, "executed_block_number" numeric, "executed_block_timestamp" numeric, "executed_transaction_hash" text, CONSTRAINT "PK_dae843ead23b71257e61fae484e" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_5a89e85fcddd1c5120a66ddff3" ON "timelock_call" ("operation_id") `)
        await db.query(`CREATE INDEX "IDX_02e9680cc4905d667deaec230b" ON "timelock_call" ("proposal_id") `)
        await db.query(`CREATE INDEX "IDX_d2c4c75619b38113cc07d29be2" ON "timelock_call" ("chain_id", "governor_address", "timelock_address", "operation_id", "action_index") `)
        await db.query(`CREATE TABLE "timelock_operation" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "timelock_address" text NOT NULL, "contract_address" text, "log_index" integer, "transaction_index" integer, "proposal_id" character varying, "operation_id" text NOT NULL, "timelock_type" text NOT NULL, "predecessor" text, "salt" text, "state" text NOT NULL, "call_count" integer, "executed_call_count" integer, "delay_seconds" numeric, "ready_at" numeric, "expires_at" numeric, "queued_block_number" numeric, "queued_block_timestamp" numeric, "queued_transaction_hash" text, "cancelled_block_number" numeric, "cancelled_block_timestamp" numeric, "cancelled_transaction_hash" text, "executed_block_number" numeric, "executed_block_timestamp" numeric, "executed_transaction_hash" text, CONSTRAINT "PK_80f1a4c38f9180ca2af3328a2b8" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_4f85eaf0fa034e10124101ad01" ON "timelock_operation" ("proposal_id") `)
        await db.query(`CREATE INDEX "IDX_1d57ae87a833af26036523041b" ON "timelock_operation" ("chain_id", "governor_address", "timelock_address", "proposal_id", "operation_id") `)
        await db.query(`CREATE TABLE "timelock_role_event" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "timelock_address" text NOT NULL, "contract_address" text, "log_index" integer, "transaction_index" integer, "event_name" text NOT NULL, "role" text NOT NULL, "role_label" text, "account" text, "sender" text, "previous_admin_role" text, "previous_admin_role_label" text, "new_admin_role" text, "new_admin_role_label" text, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_9ca37fd5648a81b8799cd7307d4" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_5ff9c27463cdecb92a4b7ccff9" ON "timelock_role_event" ("chain_id", "governor_address", "timelock_address", "role", "event_name") `)
        await db.query(`CREATE TABLE "timelock_min_delay_change" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "timelock_address" text NOT NULL, "contract_address" text, "log_index" integer, "transaction_index" integer, "old_duration" numeric NOT NULL, "new_duration" numeric NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_116a972c9389a86114c0f676c84" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_b98caad15a83928f8b5fa657b2" ON "timelock_min_delay_change" ("chain_id", "governor_address", "timelock_address", "block_number") `)
        await db.query(`ALTER TABLE "proposal" ADD "queue_ready_at" numeric`)
        await db.query(`ALTER TABLE "proposal" ADD "queue_expires_at" numeric`)
        await db.query(`ALTER TABLE "proposal" ADD "timelock_grace_period" numeric`)
        await db.query(`ALTER TABLE "timelock_call" ADD CONSTRAINT "FK_5a89e85fcddd1c5120a66ddff3e" FOREIGN KEY ("operation_id") REFERENCES "timelock_operation"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)
        await db.query(`ALTER TABLE "timelock_call" ADD CONSTRAINT "FK_02e9680cc4905d667deaec230b5" FOREIGN KEY ("proposal_id") REFERENCES "proposal"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)
        await db.query(`ALTER TABLE "timelock_operation" ADD CONSTRAINT "FK_4f85eaf0fa034e10124101ad013" FOREIGN KEY ("proposal_id") REFERENCES "proposal"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)
    }

    async down(db) {
        await db.query(`DROP TABLE "timelock_call"`)
        await db.query(`DROP INDEX "public"."IDX_5a89e85fcddd1c5120a66ddff3"`)
        await db.query(`DROP INDEX "public"."IDX_02e9680cc4905d667deaec230b"`)
        await db.query(`DROP INDEX "public"."IDX_d2c4c75619b38113cc07d29be2"`)
        await db.query(`DROP TABLE "timelock_operation"`)
        await db.query(`DROP INDEX "public"."IDX_4f85eaf0fa034e10124101ad01"`)
        await db.query(`DROP INDEX "public"."IDX_1d57ae87a833af26036523041b"`)
        await db.query(`DROP TABLE "timelock_role_event"`)
        await db.query(`DROP INDEX "public"."IDX_5ff9c27463cdecb92a4b7ccff9"`)
        await db.query(`DROP TABLE "timelock_min_delay_change"`)
        await db.query(`DROP INDEX "public"."IDX_b98caad15a83928f8b5fa657b2"`)
        await db.query(`ALTER TABLE "proposal" DROP COLUMN "queue_ready_at"`)
        await db.query(`ALTER TABLE "proposal" DROP COLUMN "queue_expires_at"`)
        await db.query(`ALTER TABLE "proposal" DROP COLUMN "timelock_grace_period"`)
        await db.query(`ALTER TABLE "timelock_call" DROP CONSTRAINT "FK_5a89e85fcddd1c5120a66ddff3e"`)
        await db.query(`ALTER TABLE "timelock_call" DROP CONSTRAINT "FK_02e9680cc4905d667deaec230b5"`)
        await db.query(`ALTER TABLE "timelock_operation" DROP CONSTRAINT "FK_4f85eaf0fa034e10124101ad013"`)
    }
}
