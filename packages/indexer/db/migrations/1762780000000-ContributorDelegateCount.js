module.exports = class ContributorDelegateCount1762780000000 {
    name = 'ContributorDelegateCount1762780000000'

    async up(db) {
        await db.query(`ALTER TABLE "contributor" ADD COLUMN "delegate_count" integer NOT NULL DEFAULT 0`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "contributor" DROP COLUMN "delegate_count"`)
    }
}
