module.exports = class Data1756445816050 {
    name = 'Data1756445816050'

    async up(db) {
        await db.query(`ALTER TABLE "proposal" ADD "title" text`)
        await db.query(`ALTER TABLE "proposal" ADD "vote_start_timestamp" numeric`)
        await db.query(`ALTER TABLE "proposal" ADD "vote_end_timestamp" numeric`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "proposal" DROP COLUMN "title"`)
        await db.query(`ALTER TABLE "proposal" DROP COLUMN "vote_start_timestamp"`)
        await db.query(`ALTER TABLE "proposal" DROP COLUMN "vote_end_timestamp"`)
    }
}
