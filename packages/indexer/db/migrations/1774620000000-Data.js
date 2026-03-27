module.exports = class Data1774620000000 {
    name = 'Data1774620000000'

    async up(db) {
        await db.query(`ALTER TABLE "delegate" ADD "is_current" boolean NOT NULL DEFAULT true`)
    }

    async down(db) {
        await db.query(`ALTER TABLE "delegate" DROP COLUMN "is_current"`)
    }
}
