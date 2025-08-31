import { TextPlus } from "../src/internal/textplus";

require("dotenv").config();

interface DescriptionResult {
  proposalId: string;
  description: string;
}

async function queryDescriptions(): Promise<DescriptionResult[]> {
  const response = await fetch("https://indexer.degov.ai/unlock-dao/graphql", {
    headers: {
      accept: "application/json, multipart/mixed",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: `query QueryProposals {
        proposals(limit: 10, offset: 5) {
          description
          proposalId
        }
      }`,
      operationName: "QueryProposals",
    }),
    method: "POST",
  });
  const ret = await response.json();
  return ret.data.proposals;
}

describe("Chain Tool Test", () => {
  const textPlus = new TextPlus();

  it(
    "check extractInfo",
    async () => {
      const drs = await queryDescriptions();

      const resultsPromises = drs.map(async (dr) => {
        const r = await textPlus.extractInfo(dr.description);
        return `- ${r.title} -> ${dr.proposalId}`; // -> ${dr.proposalId}
      });

      const allResults = await Promise.all(resultsPromises);

      console.log(allResults.join("\n"));
    },
    1000 * 60
  );
});
