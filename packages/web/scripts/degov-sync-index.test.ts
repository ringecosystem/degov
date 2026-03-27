import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemaSource = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8"
);
const syncRouteSource = readFileSync(
  new URL("../src/app/api/degov/sync/route.ts", import.meta.url),
  "utf8"
);
const migrationSource = readFileSync(
  new URL(
    "../prisma/migrations/20260327080000_d_user_sync_lookup_index/migration.sql",
    import.meta.url
  ),
  "utf8"
);

test("sync route keeps the dao-scoped lookup backed by an index", () => {
  assert.match(
    syncRouteSource,
    /update d_user set power = \$\{hexPower\} where address = \$\{address\} and dao_code = \$\{inputDaocode\}/
  );
  assert.match(
    schemaSource,
    /@@index\(\[dao_code, address\], map: "d_user_dao_code_address_idx"\)/
  );
  assert.match(
    migrationSource,
    /CREATE INDEX "d_user_dao_code_address_idx" ON "d_user"\("dao_code", "address"\);/
  );
});
