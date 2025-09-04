module.exports = class Data1756613663322 {
    name = 'Data1756613663322'

    async up(db) {
        await db.query(`CREATE TABLE "delegate_changed" ("id" character varying NOT NULL, "delegator" text NOT NULL, "from_delegate" text NOT NULL, "to_delegate" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_82fcd22b1159cec837a6062982f" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "delegate_votes_changed" ("id" character varying NOT NULL, "delegate" text NOT NULL, "previous_votes" numeric NOT NULL, "new_votes" numeric NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_a38fef07a3e775591ad1d4de0ad" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "token_transfer" ("id" character varying NOT NULL, "from" text NOT NULL, "to" text NOT NULL, "value" numeric NOT NULL, "standard" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_77384b7f5874553f012eba9da41" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "proposal_canceled" ("id" character varying NOT NULL, "proposal_id" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_22622253f3a27d143c7fea33d7c" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "proposal_created" ("id" character varying NOT NULL, "proposal_id" text NOT NULL, "proposer" text NOT NULL, "targets" text array NOT NULL, "values" text array NOT NULL, "signatures" text array NOT NULL, "calldatas" text array NOT NULL, "vote_start" numeric NOT NULL, "vote_end" numeric NOT NULL, "description" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_a7f756da7b761d1eda0c80d7de3" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "proposal_executed" ("id" character varying NOT NULL, "proposal_id" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_0b159cbdd0cf4c05709dc7b8955" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "proposal_queued" ("id" character varying NOT NULL, "proposal_id" text NOT NULL, "eta_seconds" numeric NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_49df9d6b2bd83692cde2dc4fbb1" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "vote_cast" ("id" character varying NOT NULL, "voter" text NOT NULL, "proposal_id" text NOT NULL, "support" integer NOT NULL, "weight" numeric NOT NULL, "reason" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_4ac5f0845939b5be9a3528c868e" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "vote_cast_with_params" ("id" character varying NOT NULL, "voter" text NOT NULL, "proposal_id" text NOT NULL, "support" integer NOT NULL, "weight" numeric NOT NULL, "reason" text NOT NULL, "params" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_9569ed7f1b6e52cd9ff923e47e7" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "proposal" ("id" character varying NOT NULL, "proposal_id" text NOT NULL, "proposer" text NOT NULL, "targets" text array NOT NULL, "values" text array NOT NULL, "signatures" text array NOT NULL, "calldatas" text array NOT NULL, "vote_start" numeric NOT NULL, "vote_end" numeric NOT NULL, "description" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, "metrics_votes_count" integer, "metrics_votes_with_params_count" integer, "metrics_votes_without_params_count" integer, "metrics_votes_weight_for_sum" numeric, "metrics_votes_weight_against_sum" numeric, "metrics_votes_weight_abstain_sum" numeric, "title" text NOT NULL, "vote_start_timestamp" numeric NOT NULL, "vote_end_timestamp" numeric NOT NULL, "block_interval" text, "clock_mode" text NOT NULL, "quorum" numeric NOT NULL, "decimals" numeric NOT NULL, CONSTRAINT "PK_ca872ecfe4fef5720d2d39e4275" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "vote_cast_group" ("id" character varying NOT NULL, "type" text NOT NULL, "voter" text NOT NULL, "ref_proposal_id" text NOT NULL, "support" integer NOT NULL, "weight" numeric NOT NULL, "reason" text NOT NULL, "params" text, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, "proposal_id" character varying, CONSTRAINT "PK_b64558b70e64cb753bf9007352c" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_46ec520941027c99068c7ed24b" ON "vote_cast_group" ("proposal_id") `)
        await db.query(`CREATE TABLE "data_metric" ("id" character varying NOT NULL, "proposals_count" integer, "votes_count" integer, "votes_with_params_count" integer, "votes_without_params_count" integer, "votes_weight_for_sum" numeric, "votes_weight_against_sum" numeric, "votes_weight_abstain_sum" numeric, "power_sum" numeric, "member_count" integer, CONSTRAINT "PK_25f5e39e9c7755e2233bcbdc255" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "delegate_rolling" ("id" character varying NOT NULL, "delegator" text NOT NULL, "from_delegate" text NOT NULL, "to_delegate" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, "from_previous_votes" numeric, "from_new_votes" numeric, "to_previous_votes" numeric, "to_new_votes" numeric, CONSTRAINT "PK_976ac6dd5a215cf1276bbf56adf" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "delegate" ("id" character varying NOT NULL, "from_delegate" text NOT NULL, "to_delegate" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, "power" numeric NOT NULL, CONSTRAINT "PK_810516365b3daa9f6d6d2d4f2b7" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "contributor" ("id" character varying NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, "power" numeric NOT NULL, CONSTRAINT "PK_816afef005b8100becacdeb6e58" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "delegate_mapping" ("id" character varying NOT NULL, "from" text NOT NULL, "to" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_5b8f4a7ecb81f46845fa636443c" PRIMARY KEY ("id"))`)
        await db.query(`ALTER TABLE "vote_cast_group" ADD CONSTRAINT "FK_46ec520941027c99068c7ed24b8" FOREIGN KEY ("proposal_id") REFERENCES "proposal"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)
    }

    async down(db) {
        await db.query(`DROP TABLE "delegate_changed"`)
        await db.query(`DROP TABLE "delegate_votes_changed"`)
        await db.query(`DROP TABLE "token_transfer"`)
        await db.query(`DROP TABLE "proposal_canceled"`)
        await db.query(`DROP TABLE "proposal_created"`)
        await db.query(`DROP TABLE "proposal_executed"`)
        await db.query(`DROP TABLE "proposal_queued"`)
        await db.query(`DROP TABLE "vote_cast"`)
        await db.query(`DROP TABLE "vote_cast_with_params"`)
        await db.query(`DROP TABLE "proposal"`)
        await db.query(`DROP TABLE "vote_cast_group"`)
        await db.query(`DROP INDEX "public"."IDX_46ec520941027c99068c7ed24b"`)
        await db.query(`DROP TABLE "data_metric"`)
        await db.query(`DROP TABLE "delegate_rolling"`)
        await db.query(`DROP TABLE "delegate"`)
        await db.query(`DROP TABLE "contributor"`)
        await db.query(`DROP TABLE "delegate_mapping"`)
        await db.query(`ALTER TABLE "vote_cast_group" DROP CONSTRAINT "FK_46ec520941027c99068c7ed24b8"`)
    }
}
