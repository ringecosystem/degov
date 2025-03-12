module.exports = class Data1741770831642 {
    name = 'Data1741770831642'

    async up(db) {
        await db.query(`ALTER TABLE "delegate_votes_changed" ADD "s" text`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "delegate_votes_changed" DROP COLUMN "s"`)
    }
}
