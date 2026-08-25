import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  filterHiddenProposals,
  findHiddenProposal,
} from "../src/utils/proposal-visibility.ts";

const hidden = {
  hiddenProposals: [{ id: "0x2a", reason: "Incorrect actions" }],
};

const readSource = (relativePath: string) =>
  readFileSync(path.join(import.meta.dirname, "..", relativePath), "utf8");

test("hidden proposals match equivalent hexadecimal and decimal IDs", () => {
  assert.equal(findHiddenProposal(hidden, "42")?.reason, "Incorrect actions");
  assert.equal(findHiddenProposal(hidden, "invalid"), undefined);
});

test("hidden proposals are removed without changing other proposals", () => {
  assert.deepEqual(
    filterHiddenProposals(hidden, [
      { proposalId: "41" },
      { proposalId: "42" },
      { proposalId: "43" },
    ]),
    [{ proposalId: "41" }, { proposalId: "43" }]
  );
});

test("proposal routes and directories enforce the shared visibility rule", () => {
  assert.match(
    readSource("src/app/proposal/[id]/page.tsx"),
    /findHiddenProposal\(config, id\)/
  );
  assert.match(
    readSource("src/app/proposal/[id]/layout.tsx"),
    /buildNoPublicPreviewMetadata\("Proposal unavailable"\)/
  );
  assert.match(
    readSource("src/app/_server/public-seo.ts"),
    /filterHiddenProposals\(config, proposals\)/
  );
  assert.match(
    readSource("src/lib/proposal-directory-query.ts"),
    /return filterHiddenProposals\(config, proposals\)\.slice/
  );
  assert.match(
    readSource("src/components/proposals-table/hooks/useProposalData.ts"),
    /filterHiddenProposals\(daoConfig, data\?\.pages\.flat\(\) \|\| \[\]\)/
  );
  assert.match(
    readSource("src/components/search-modal.tsx"),
    /filterHiddenProposals\(daoConfig, data\?\.pages\.flat\(\) \|\| \[\]\)/
  );
  assert.match(
    readSource("src/app/ai-analysis/[proposalId]/page.tsx"),
    /!hiddenProposal && !!proposalId/
  );
  assert.match(
    readSource("src/app/proposal/[id]/proposal-detail-client.tsx"),
    /return <HiddenProposalNotice config=\{daoConfig\} proposal=\{hiddenProposal\} \/>/
  );
});
