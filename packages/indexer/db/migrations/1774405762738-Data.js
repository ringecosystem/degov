module.exports = class Data1774405762738 {
    name = 'Data1774405762738'

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

        await db.query(`CREATE TABLE "proposal_extended" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "contract_address" text, "log_index" integer, "transaction_index" integer, "proposal_id" text NOT NULL, "extended_deadline" numeric NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_6045f56e0b59c31883e6c922518" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_6497bb4d1d1da3179a4776f4e7" ON "proposal_extended" ("chain_id", "governor_address", "proposal_id") `)
        await db.query(`CREATE TABLE "voting_delay_set" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "contract_address" text, "log_index" integer, "transaction_index" integer, "old_voting_delay" numeric NOT NULL, "new_voting_delay" numeric NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_8983d8dda9ac173d838f0ee816f" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_1d0559b433db64cb1e046de623" ON "voting_delay_set" ("chain_id", "governor_address", "block_number") `)
        await db.query(`CREATE TABLE "voting_period_set" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "contract_address" text, "log_index" integer, "transaction_index" integer, "old_voting_period" numeric NOT NULL, "new_voting_period" numeric NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_c1af519d2daa15edb846387251d" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_97bcfcbb15905bb0a91f92d683" ON "voting_period_set" ("chain_id", "governor_address", "block_number") `)
        await db.query(`CREATE TABLE "proposal_threshold_set" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "contract_address" text, "log_index" integer, "transaction_index" integer, "old_proposal_threshold" numeric NOT NULL, "new_proposal_threshold" numeric NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_0cfd9709a913d0120b57bf053e1" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_91a300b1dee04cacc8e7b6f7a8" ON "proposal_threshold_set" ("chain_id", "governor_address", "block_number") `)
        await db.query(`CREATE TABLE "quorum_numerator_updated" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "contract_address" text, "log_index" integer, "transaction_index" integer, "old_quorum_numerator" numeric NOT NULL, "new_quorum_numerator" numeric NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_da8046638ae69bb6e6792cfcaf8" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_7976d16bd699ca225a24f662e8" ON "quorum_numerator_updated" ("chain_id", "governor_address", "block_number") `)
        await db.query(`CREATE TABLE "late_quorum_vote_extension_set" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "contract_address" text, "log_index" integer, "transaction_index" integer, "old_late_quorum_vote_extension" numeric NOT NULL, "new_late_quorum_vote_extension" numeric NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_41c7ff87ec4deb20d4512b03c4b" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_575153f59f35050a99a0ab62f9" ON "late_quorum_vote_extension_set" ("chain_id", "governor_address", "block_number") `)
        await db.query(`CREATE TABLE "timelock_change" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "contract_address" text, "log_index" integer, "transaction_index" integer, "old_timelock" text NOT NULL, "new_timelock" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_029a7fd2e1fb70da29695ecc658" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_1aab88f67a4f19b479684940ec" ON "timelock_change" ("chain_id", "governor_address", "block_number") `)
        await db.query(`CREATE TABLE "proposal_action" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "contract_address" text, "log_index" integer, "transaction_index" integer, "proposal_id" character varying NOT NULL, "action_index" integer NOT NULL, "target" text NOT NULL, "value" text NOT NULL, "signature" text NOT NULL, "calldata" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_c44bd6250cf241ddd15782e8b55" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_ac8a482f4b80a3f4254739d334" ON "proposal_action" ("proposal_id") `)
        await db.query(`CREATE INDEX "IDX_0081b098486e1dff1a5a520154" ON "proposal_action" ("chain_id", "governor_address", "proposal_id") `)
        await db.query(`CREATE TABLE "proposal_state_epoch" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "contract_address" text, "log_index" integer, "transaction_index" integer, "proposal_id" character varying NOT NULL, "state" text NOT NULL, "start_timepoint" numeric, "end_timepoint" numeric, "start_block_number" numeric, "start_block_timestamp" numeric, "end_block_number" numeric, "end_block_timestamp" numeric, "transaction_hash" text NOT NULL, CONSTRAINT "PK_86628fadab571d1088cfdc3b0b9" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_f964649484ed88d3d8a9551fbf" ON "proposal_state_epoch" ("proposal_id") `)
        await db.query(`CREATE INDEX "IDX_5900ad3243dbf121ad225f980e" ON "proposal_state_epoch" ("chain_id", "governor_address", "proposal_id", "state") `)
        await db.query(`CREATE TABLE "proposal_deadline_extension" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "contract_address" text, "log_index" integer, "transaction_index" integer, "proposal_id" character varying NOT NULL, "previous_deadline" numeric, "new_deadline" numeric NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_51f84b19ac7d6e3972e711ece46" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_772d21a997bce2920ef6b8edf9" ON "proposal_deadline_extension" ("proposal_id") `)
        await db.query(`CREATE INDEX "IDX_394553e0ed1896ef6d97e0a1b0" ON "proposal_deadline_extension" ("chain_id", "governor_address", "proposal_id") `)
        await db.query(`CREATE TABLE "governance_parameter_checkpoint" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "contract_address" text, "log_index" integer, "transaction_index" integer, "event_name" text NOT NULL, "parameter_name" text NOT NULL, "value_type" text NOT NULL, "old_value" text, "new_value" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_c69f0d3c9b2b7f3125abca6297a" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_64d60087312e6ae04581a81da5" ON "governance_parameter_checkpoint" ("chain_id", "governor_address", "parameter_name") `)
        await db.query(`ALTER TABLE "proposal" ADD "description_hash" text`)
        await db.query(`ALTER TABLE "proposal" ADD "proposal_snapshot" numeric`)
        await db.query(`ALTER TABLE "proposal" ADD "proposal_deadline" numeric`)
        await db.query(`ALTER TABLE "proposal" ADD "proposal_eta" numeric`)
        await db.query(`ALTER TABLE "proposal" ADD "counting_mode" text`)
        await db.query(`ALTER TABLE "proposal" ADD "timelock_address" text`)
        await db.query(`ALTER TABLE "proposal_action" ADD CONSTRAINT "FK_ac8a482f4b80a3f4254739d334b" FOREIGN KEY ("proposal_id") REFERENCES "proposal"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)
        await db.query(`ALTER TABLE "proposal_state_epoch" ADD CONSTRAINT "FK_f964649484ed88d3d8a9551fbf3" FOREIGN KEY ("proposal_id") REFERENCES "proposal"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)
        await db.query(`ALTER TABLE "proposal_deadline_extension" ADD CONSTRAINT "FK_772d21a997bce2920ef6b8edf9d" FOREIGN KEY ("proposal_id") REFERENCES "proposal"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)

        await db.query(`CREATE TABLE "vote_power_checkpoint" ("id" character varying NOT NULL, "chain_id" integer, "dao_code" text, "governor_address" text, "token_address" text, "contract_address" text, "log_index" integer, "transaction_index" integer, "account" text NOT NULL, "clock_mode" text NOT NULL, "timepoint" numeric NOT NULL, "previous_power" numeric NOT NULL, "new_power" numeric NOT NULL, "delta" numeric NOT NULL, "cause" text NOT NULL, "delegator" text, "from_delegate" text, "to_delegate" text, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_a7046c290a7a7d881283853f3f7" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_08c8f53fdccf02212a8da0ee1e" ON "vote_power_checkpoint" ("chain_id", "governor_address", "token_address", "account", "clock_mode", "timepoint") `)

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
        await db.query(`ALTER TABLE "timelock_call" DROP CONSTRAINT "FK_5a89e85fcddd1c5120a66ddff3e"`)
        await db.query(`ALTER TABLE "timelock_call" DROP CONSTRAINT "FK_02e9680cc4905d667deaec230b5"`)
        await db.query(`ALTER TABLE "timelock_operation" DROP CONSTRAINT "FK_4f85eaf0fa034e10124101ad013"`)
        await db.query(`DROP INDEX "public"."IDX_d2c4c75619b38113cc07d29be2"`)
        await db.query(`DROP INDEX "public"."IDX_02e9680cc4905d667deaec230b"`)
        await db.query(`DROP INDEX "public"."IDX_5a89e85fcddd1c5120a66ddff3"`)
        await db.query(`DROP TABLE "timelock_call"`)
        await db.query(`DROP INDEX "public"."IDX_1d57ae87a833af26036523041b"`)
        await db.query(`DROP INDEX "public"."IDX_4f85eaf0fa034e10124101ad01"`)
        await db.query(`DROP TABLE "timelock_operation"`)
        await db.query(`DROP INDEX "public"."IDX_5ff9c27463cdecb92a4b7ccff9"`)
        await db.query(`DROP TABLE "timelock_role_event"`)
        await db.query(`DROP INDEX "public"."IDX_b98caad15a83928f8b5fa657b2"`)
        await db.query(`DROP TABLE "timelock_min_delay_change"`)
        await db.query(`ALTER TABLE "proposal" DROP COLUMN "timelock_grace_period"`)
        await db.query(`ALTER TABLE "proposal" DROP COLUMN "queue_expires_at"`)
        await db.query(`ALTER TABLE "proposal" DROP COLUMN "queue_ready_at"`)

        await db.query(`DROP INDEX "public"."IDX_08c8f53fdccf02212a8da0ee1e"`)
        await db.query(`DROP TABLE "vote_power_checkpoint"`)

        await db.query(`ALTER TABLE "proposal_deadline_extension" DROP CONSTRAINT "FK_772d21a997bce2920ef6b8edf9d"`)
        await db.query(`ALTER TABLE "proposal_state_epoch" DROP CONSTRAINT "FK_f964649484ed88d3d8a9551fbf3"`)
        await db.query(`ALTER TABLE "proposal_action" DROP CONSTRAINT "FK_ac8a482f4b80a3f4254739d334b"`)
        await db.query(`DROP INDEX "public"."IDX_6497bb4d1d1da3179a4776f4e7"`)
        await db.query(`DROP TABLE "proposal_extended"`)
        await db.query(`DROP INDEX "public"."IDX_1d0559b433db64cb1e046de623"`)
        await db.query(`DROP TABLE "voting_delay_set"`)
        await db.query(`DROP INDEX "public"."IDX_97bcfcbb15905bb0a91f92d683"`)
        await db.query(`DROP TABLE "voting_period_set"`)
        await db.query(`DROP INDEX "public"."IDX_91a300b1dee04cacc8e7b6f7a8"`)
        await db.query(`DROP TABLE "proposal_threshold_set"`)
        await db.query(`DROP INDEX "public"."IDX_7976d16bd699ca225a24f662e8"`)
        await db.query(`DROP TABLE "quorum_numerator_updated"`)
        await db.query(`DROP INDEX "public"."IDX_575153f59f35050a99a0ab62f9"`)
        await db.query(`DROP TABLE "late_quorum_vote_extension_set"`)
        await db.query(`DROP INDEX "public"."IDX_1aab88f67a4f19b479684940ec"`)
        await db.query(`DROP TABLE "timelock_change"`)
        await db.query(`DROP INDEX "public"."IDX_0081b098486e1dff1a5a520154"`)
        await db.query(`DROP INDEX "public"."IDX_ac8a482f4b80a3f4254739d334"`)
        await db.query(`DROP TABLE "proposal_action"`)
        await db.query(`DROP INDEX "public"."IDX_5900ad3243dbf121ad225f980e"`)
        await db.query(`DROP INDEX "public"."IDX_f964649484ed88d3d8a9551fbf"`)
        await db.query(`DROP TABLE "proposal_state_epoch"`)
        await db.query(`DROP INDEX "public"."IDX_394553e0ed1896ef6d97e0a1b0"`)
        await db.query(`DROP INDEX "public"."IDX_772d21a997bce2920ef6b8edf9"`)
        await db.query(`DROP TABLE "proposal_deadline_extension"`)
        await db.query(`DROP INDEX "public"."IDX_64d60087312e6ae04581a81da5"`)
        await db.query(`DROP TABLE "governance_parameter_checkpoint"`)
        await db.query(`ALTER TABLE "proposal" DROP COLUMN "timelock_address"`)
        await db.query(`ALTER TABLE "proposal" DROP COLUMN "counting_mode"`)
        await db.query(`ALTER TABLE "proposal" DROP COLUMN "proposal_eta"`)
        await db.query(`ALTER TABLE "proposal" DROP COLUMN "proposal_deadline"`)
        await db.query(`ALTER TABLE "proposal" DROP COLUMN "proposal_snapshot"`)
        await db.query(`ALTER TABLE "proposal" DROP COLUMN "description_hash"`)

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
