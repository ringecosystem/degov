const {
  auditTarget,
  buildMarkdownReport,
  parseArgs,
  summarizeAudit,
} = require("../scripts/indexer-accuracy-audit");
const {
  buildIssueBody,
  GITHUB_ISSUE_BODY_MAX_LENGTH,
  ISSUE_BODY_MARKER,
  ISSUE_BODY_TRUNCATION_NOTICE,
} = require("../scripts/indexer-accuracy-issue-body");

describe("indexer accuracy audit", () => {
  const target = {
    code: "ens-dao",
    name: "ENS",
    indexerEndpoint: "https://indexer.example/graphql",
    rpcUrl: "https://rpc.example",
    governorToken: "0x0000000000000000000000000000000000000001",
    governor: "0x0000000000000000000000000000000000000002",
    tokenDecimals: 18,
  };

  it("collects mismatches, read errors, and negative rows without failing fast", async () => {
    const result = await auditTarget(
      target,
      {
        limit: 3,
        negativeLimit: 5,
        concurrency: 2,
      },
      {
        fetchTopContributors: async () => [
          { id: "0x1", power: "100" },
          { id: "0x2", power: "200" },
          { id: "0x3", power: "300" },
        ],
        fetchNegativeRows: async () => ({
          contributors: [{ id: "0xdead", power: "-1" }],
          delegates: [
            {
              id: "0xaaa_0xbbb",
              fromDelegate: "0xaaa",
              toDelegate: "0xbbb",
              power: "-2",
            },
          ],
        }),
        readCurrentVotes: async (_configuredTarget: any, address: string) => {
          if (address === "0x1") {
            return { source: "token.getVotes", value: "100" };
          }
          if (address === "0x2") {
            return { source: "token.getVotes", value: "20" };
          }
          throw new Error("rpc timeout");
        },
      }
    );

    expect(result.checkedAccounts).toBe(3);
    expect(result.matches).toBe(1);
    expect(result.mismatches).toEqual([
      {
        address: "0x2",
        contributorPower: "200",
        detailPower: "20",
        detailSource: "token.getVotes",
        delta: "180",
        hint: "index-higher-with-negative-delegates",
      },
    ]);
    expect(result.voteReadErrors).toEqual([
      {
        address: "0x3",
        hint: "detail-read-failed",
        message: "rpc timeout",
      },
    ]);
    expect(result.negativeContributors).toEqual([
      {
        address: "0xdead",
        power: "-1",
        hint: "negative-contributor-power",
      },
    ]);
    expect(result.negativeDelegates).toEqual([
      {
        id: "0xaaa_0xbbb",
        fromDelegate: "0xaaa",
        toDelegate: "0xbbb",
        power: "-2",
        hint: "negative-delegate-power",
      },
    ]);
    expect(result.anomalyCount).toBe(4);
  });

  it("renders a markdown report with summary and detail sections", () => {
    const report = {
      generatedAt: "2026-03-30T06:00:00.000Z",
      targets: [
        {
          code: "ens-dao",
          name: "ENS",
          checkedAccounts: 2,
          limit: 2,
          matches: 1,
          mismatches: [
            {
              address: "0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5",
              contributorPower: "963786580523623804032252",
              detailPower: "149622029144045802445500",
              detailSource: "token.getVotes",
              delta: "814164551379578001586752",
              hint: "index-higher-with-negative-delegates",
            },
          ],
          voteReadErrors: [],
          negativeContributors: [],
          negativeDelegates: [
            {
              id: "0xaaa_0xbbb",
              fromDelegate: "0xaaa",
              toDelegate: "0xbbb",
              power: "-2",
              hint: "negative-delegate-power",
            },
          ],
          queryErrors: [],
          anomalyCount: 2,
        },
      ],
      summary: summarizeAudit([
        {
          checkedAccounts: 2,
          matches: 1,
          mismatches: [{}],
          voteReadErrors: [],
          negativeContributors: [],
          negativeDelegates: [{}],
          queryErrors: [],
          anomalyCount: 2,
        },
      ]),
    };

    const markdown = buildMarkdownReport(report, [target]);

    expect(markdown).toContain("## Indexer Accuracy Audit");
    expect(markdown).toContain("Vote mismatches: 1");
    expect(markdown).toContain("### ENS (`ens-dao`)");
    expect(markdown).toContain("index-higher-with-negative-delegates");
    expect(markdown).toContain("negative-delegate-power");
  });

  it("parses CLI flags for report output and strict mode", () => {
    const options = parseArgs([
      "--limit",
      "50",
      "--negative-limit=25",
      "--concurrency",
      "4",
      "--json-file",
      "report.json",
      "--markdown-file",
      "report.md",
      "--targets-file",
      "custom-targets.json",
      "--fail-on-anomalies",
    ]);

    expect(options.limit).toBe(50);
    expect(options.negativeLimit).toBe(25);
    expect(options.concurrency).toBe(4);
    expect(options.jsonFile).toBe("report.json");
    expect(options.markdownFile).toBe("report.md");
    expect(options.targetsFile).toMatch(/custom-targets\.json$/);
    expect(options.failOnAnomalies).toBe(true);
  });

  it("keeps short GitHub issue bodies unchanged", () => {
    const reportMarkdown = "## Indexer Accuracy Audit\n\n- Total anomalies: 1\n";
    const runUrl = "https://github.com/ringecosystem/degov/actions/runs/123";

    const body = buildIssueBody(reportMarkdown, runUrl);

    expect(body).toBe(
      `${ISSUE_BODY_MARKER}\n${reportMarkdown.trimEnd()}\n_Run: ${runUrl}_\n`
    );
  });

  it("truncates oversized GitHub issue bodies to the API limit", () => {
    const reportMarkdown = [
      "## Indexer Accuracy Audit",
      "",
      "### Summary",
      "",
      `- Total anomalies: ${2000}`,
      "",
      `${"mismatch detail\n".repeat(8000)}`,
    ].join("\n");
    const runUrl = "https://github.com/ringecosystem/degov/actions/runs/123";

    const body = buildIssueBody(reportMarkdown, runUrl);

    expect(body.length).toBeLessThanOrEqual(GITHUB_ISSUE_BODY_MAX_LENGTH);
    expect(body).toContain("## Indexer Accuracy Audit");
    expect(body).toContain(ISSUE_BODY_TRUNCATION_NOTICE);
    expect(body).toContain(`_Run: ${runUrl}_`);
    expect(body.startsWith(`${ISSUE_BODY_MARKER}\n`)).toBe(true);
  });
});
