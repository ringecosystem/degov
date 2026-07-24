import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { getPlaygroundFaucetAddress } from "../src/utils/playground-faucet.ts";

const FAUCET = "0x1234567890AbcdEF1234567890aBcdef12345678";

test("resolves the Faucet from Registry faucetAddress params", () => {
  assert.equal(
    getPlaygroundFaucetAddress({
      code: "playground-dao",
      apps: [
        {
          name: "Faucet",
          description: "Claim GTK",
          icon: "/faucet.svg",
          link: "/faucet",
          params: { faucetAddress: FAUCET },
        },
      ],
    }),
    FAUCET
  );
});

test("supports the generic Registry contract param", () => {
  assert.equal(
    getPlaygroundFaucetAddress({
      code: "playground-dao",
      apps: [
        {
          name: "Faucet",
          description: "Claim GTK",
          icon: "/faucet.svg",
          link: "/faucet",
          params: { contract: FAUCET },
        },
      ],
    }),
    FAUCET
  );
});

test("does not expose the Faucet to other DAOs or malformed addresses", () => {
  const app = {
    name: "Faucet",
    description: "Claim GTK",
    icon: "/faucet.svg",
    link: "/faucet",
    params: { faucetAddress: FAUCET },
  };

  assert.equal(
    getPlaygroundFaucetAddress({ code: "another-dao", apps: [app] }),
    undefined
  );
  assert.equal(
    getPlaygroundFaucetAddress({
      code: "playground-dao",
      apps: [{ ...app, params: { faucetAddress: "not-an-address" } }],
    }),
    undefined
  );
});

test("does not treat another app contract as the Faucet", () => {
  assert.equal(
    getPlaygroundFaucetAddress({
      code: "playground-dao",
      apps: [
        {
          name: "Another app",
          description: "Not a Faucet",
          icon: "/app.svg",
          link: "/another-app",
          params: { contract: FAUCET },
        },
      ],
    }),
    undefined
  );
});

test("Faucet page reads its address from Registry config", () => {
  const source = readFileSync(
    path.join(import.meta.dirname, "../src/app/faucet/page.tsx"),
    "utf8"
  );

  assert.match(source, /getPlaygroundFaucetAddress\(daoConfig\)/);
  assert.doesNotMatch(source, /0x[0-9a-fA-F]{40}/);
});
