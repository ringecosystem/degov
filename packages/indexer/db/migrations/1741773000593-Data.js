module.exports = class Data1741773000593 {
    name = 'Data1741773000593'

    async up(db) {
        await db.query(`CREATE TABLE "delegate_changed" ("id" character varying NOT NULL, "delegator" text NOT NULL, "from_delegate" text NOT NULL, "to_delegate" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_82fcd22b1159cec837a6062982f" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "delegate_votes_changed" ("id" character varying NOT NULL, "delegate" text NOT NULL, "previous_votes" numeric NOT NULL, "new_votes" numeric NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_a38fef07a3e775591ad1d4de0ad" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "proposal_canceled" ("id" character varying NOT NULL, "proposal_id" numeric NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_22622253f3a27d143c7fea33d7c" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "proposal_created" ("id" character varying NOT NULL, "proposal_id" numeric NOT NULL, "proposer" text NOT NULL, "targets" text array NOT NULL, "values" text array NOT NULL, "signatures" text array NOT NULL, "calldatas" text array NOT NULL, "vote_start" numeric NOT NULL, "vote_end" numeric NOT NULL, "description" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_a7f756da7b761d1eda0c80d7de3" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "proposal_executed" ("id" character varying NOT NULL, "proposal_id" numeric NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_0b159cbdd0cf4c05709dc7b8955" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "proposal_queued" ("id" character varying NOT NULL, "proposal_id" numeric NOT NULL, "eta_seconds" numeric NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_49df9d6b2bd83692cde2dc4fbb1" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "vote_cast" ("id" character varying NOT NULL, "voter" text NOT NULL, "proposal_id" numeric NOT NULL, "support" integer NOT NULL, "weight" numeric NOT NULL, "reason" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_4ac5f0845939b5be9a3528c868e" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "vote_cast_with_params" ("id" character varying NOT NULL, "voter" text NOT NULL, "proposal_id" numeric NOT NULL, "support" integer NOT NULL, "weight" numeric NOT NULL, "reason" text NOT NULL, "params" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_9569ed7f1b6e52cd9ff923e47e7" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "proposal" ("id" character varying NOT NULL, "proposal_id" numeric NOT NULL, "proposer" text NOT NULL, "targets" text array NOT NULL, "values" text array NOT NULL, "signatures" text array NOT NULL, "calldatas" text array NOT NULL, "vote_start" numeric NOT NULL, "vote_end" numeric NOT NULL, "description" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, CONSTRAINT "PK_ca872ecfe4fef5720d2d39e4275" PRIMARY KEY ("id"))`)
        await db.query(`CREATE TABLE "vote_cast_group" ("id" character varying NOT NULL, "type" text NOT NULL, "voter" text NOT NULL, "support" integer NOT NULL, "weight" numeric NOT NULL, "reason" text NOT NULL, "params" text, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, "proposal_id" character varying, CONSTRAINT "PK_b64558b70e64cb753bf9007352c" PRIMARY KEY ("id"))`)
        await db.query(`CREATE INDEX "IDX_46ec520941027c99068c7ed24b" ON "vote_cast_group" ("proposal_id") `)
        await db.query(`CREATE TABLE "delegate" ("id" character varying NOT NULL, "delegator" text NOT NULL, "from_delegate" text NOT NULL, "to_delegate" text NOT NULL, "block_number" numeric NOT NULL, "block_timestamp" numeric NOT NULL, "transaction_hash" text NOT NULL, "from_previous_votes" numeric, "from_new_votes" numeric, "to_previous_votes" numeric, "to_new_votes" numeric, CONSTRAINT "PK_810516365b3daa9f6d6d2d4f2b7" PRIMARY KEY ("id"))`)
        await db.query(`ALTER TABLE "vote_cast_group" ADD CONSTRAINT "FK_46ec520941027c99068c7ed24b8" FOREIGN KEY ("proposal_id") REFERENCES "proposal"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`)
    }

    async down(db) {
        await db.query(`DROP TABLE "delegate_changed"`)
        await db.query(`DROP TABLE "delegate_votes_changed"`)
        await db.query(`DROP TABLE "proposal_canceled"`)
        await db.query(`DROP TABLE "proposal_created"`)
        await db.query(`DROP TABLE "proposal_executed"`)
        await db.query(`DROP TABLE "proposal_queued"`)
        await db.query(`DROP TABLE "vote_cast"`)
        await db.query(`DROP TABLE "vote_cast_with_params"`)
        await db.query(`DROP TABLE "proposal"`)
        await db.query(`DROP TABLE "vote_cast_group"`)
        await db.query(`DROP INDEX "public"."IDX_46ec520941027c99068c7ed24b"`)
        await db.query(`DROP TABLE "delegate"`)
        await db.query(`ALTER TABLE "vote_cast_group" DROP CONSTRAINT "FK_46ec520941027c99068c7ed24b8"`)
    }
}
