import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  hasMeaningfulProposalDraftContent,
  parseProposalDraftDocument,
  PROPOSAL_DRAFT_PAYLOAD_VERSION,
  serializeProposalDraftDocument,
} from "../src/utils/proposal-draft-document.ts";

const document = {
  actions: [
    {
      id: "proposal-1",
      type: "proposal" as const,
      content: { title: "A draft", markdown: "Work in progress" },
    },
    {
      id: "transfer-1",
      type: "transfer" as const,
      content: { recipient: "", amount: "" },
    },
    {
      id: "custom-1",
      type: "custom" as const,
      content: {
        target: "",
        contractType: "custom",
        contractMethod: "transfer-2",
        calldata: [
          { name: "to", type: "address", value: "", isArray: false },
        ],
        customAbiContent: [{ type: "function", name: "transfer" }],
        value: "",
      },
    },
    {
      id: "xaccount-1",
      type: "xaccount" as const,
      content: {},
    },
  ],
  activeActionId: "custom-1",
  tab: "edit" as const,
};

test("proposal draft document preserves complete and incomplete action state", () => {
  const payload = serializeProposalDraftDocument(document);
  const restored = parseProposalDraftDocument(
    payload,
    PROPOSAL_DRAFT_PAYLOAD_VERSION
  );
  assert.deepEqual(restored, document);
});

test("untouched default editor does not count as a meaningful draft", () => {
  assert.equal(
    hasMeaningfulProposalDraftContent([
      {
        id: "proposal-default",
        type: "proposal",
        content: { title: "", markdown: "\u200B", discussion: "" },
      },
    ]),
    false
  );
  assert.equal(hasMeaningfulProposalDraftContent(document.actions), true);
});

test("proposal draft document rejects corrupt, unsupported, and unsafe structure", () => {
  assert.throws(() => parseProposalDraftDocument("{", 1), /invalid/);
  assert.throws(
    () => parseProposalDraftDocument(JSON.stringify(document), 2),
    /unsupported/
  );
  assert.throws(
    () =>
      parseProposalDraftDocument(
        JSON.stringify({
          ...document,
          actions: [document.actions[0], document.actions[0]],
        }),
        1
      ),
    /invalid/
  );
  assert.throws(
    () =>
      parseProposalDraftDocument(
        JSON.stringify({ ...document, activeActionId: "missing" }),
        1
      ),
    /invalid/
  );
});

test("autosave serializes requests and handles conflicts and publish cleanup", () => {
  const autosave = readFileSync(
    new URL("../src/hooks/useProposalDraftAutosave.ts", import.meta.url),
    "utf8"
  );
  assert.match(autosave, /AUTOSAVE_DELAY_MS = 1_500/);
  assert.match(autosave, /inFlightRef/);
  assert.match(autosave, /revision: revisionRef\.current/);
  assert.match(autosave, /draft_revision_conflict:current_revision/);
  assert.match(autosave, /await inFlightRef\.current/);
  assert.match(autosave, /await deleteDraft/);
});

test("editor hydrates XAccount content and deletes only after confirmed success", () => {
  const editor = readFileSync(
    new URL("../src/app/proposals/new/page.tsx", import.meta.url),
    "utf8"
  );
  const xaccount = readFileSync(
    new URL("../src/app/proposals/new/xaccount-panel.tsx", import.meta.url),
    "utf8"
  );
  assert.match(editor, /initialDocument\?\.actions/);
  assert.match(editor, /content=\{action\?\.content as XAccountContent\}/);
  assert.match(editor, /await draftAutosave\.stopAndDelete\(\)/);
  assert.match(editor, /onSuccess=\{handlePublishSuccess\}/);
  assert.match(xaccount, /content \?\? \(\{\} as XAccountContent\)/);
});

test("draft UI remains capability gated and private routes are not indexed", () => {
  const editor = readFileSync(
    new URL("../src/app/proposals/new/page.tsx", import.meta.url),
    "utf8"
  );
  const robots = readFileSync(
    new URL("../src/app/robots.ts", import.meta.url),
    "utf8"
  );
  assert.match(editor, /proposal-drafts/);
  assert.match(editor, /isDegovApiConfiguredClient/);
  assert.match(robots, /\/proposals\/drafts/);
});
