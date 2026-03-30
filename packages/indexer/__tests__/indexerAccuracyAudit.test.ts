const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  auditTarget,
  buildMarkdownReport,
  compactAmount,
  fetchNegativeRows,
  fetchTopContributors,
  loadTargets,
  parseArgs,
  summarizeAudit,
} = require("../scripts/indexer-accuracy-audit");
const {
  buildIssueBody,
  uploadMarkdownReport,
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
      "--audit-config-file",
      "workflow-targets.yml",
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

    expect(options.auditConfigFile).toMatch(/workflow-targets\.yml$/);
    expect(options.limit).toBe(50);
    expect(options.negativeLimit).toBe(25);
    expect(options.concurrency).toBe(4);
    expect(options.jsonFile).toBe("report.json");
    expect(options.markdownFile).toBe("report.md");
    expect(options.targetsFile).toMatch(/custom-targets\.json$/);
    expect(options.failOnAnomalies).toBe(true);
  });

  it("preserves compact negative zero display when formatting tiny negatives", () => {
    expect(compactAmount("-1", 18)).toBe("-0");
  });

  it("queries contributors with the requested cap", async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            contributors: [
              { id: "0x1", power: "100" },
              { id: "0x2", power: "90" },
              { id: "0x3", power: "80" },
            ],
          },
        }),
      });
    global.fetch = fetchMock;

    await expect(
      fetchTopContributors(
        {
          indexerEndpoint: "https://indexer.example/graphql",
        },
        3
      )
    ).resolves.toEqual([
      { id: "0x1", power: "100" },
      { id: "0x2", power: "90" },
      { id: "0x3", power: "80" },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).variables).toEqual({
      limit: 3,
      offset: 0,
    });

    global.fetch = originalFetch;
  });

  it("queries negative rows with the requested cap", async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            contributors: [
              { id: "0xdead", power: "-1" },
              { id: "0xbeef", power: "-2" },
              { id: "0xcafe", power: "-6" },
            ],
            delegates: [
              {
                id: "0x1_0x2",
                fromDelegate: "0x1",
                toDelegate: "0x2",
                power: "-3",
              },
              {
                id: "0x3_0x4",
                fromDelegate: "0x3",
                toDelegate: "0x4",
                power: "-4",
              },
              {
                id: "0x5_0x6",
                fromDelegate: "0x5",
                toDelegate: "0x6",
                power: "-5",
              },
            ],
          },
        }),
      });
    global.fetch = fetchMock;

    await expect(
      fetchNegativeRows(
        {
          indexerEndpoint: "https://indexer.example/graphql",
        },
        3
      )
    ).resolves.toEqual({
      contributors: [
        { id: "0xdead", power: "-1" },
        { id: "0xbeef", power: "-2" },
        { id: "0xcafe", power: "-6" },
      ],
      delegates: [
        {
          id: "0x1_0x2",
          fromDelegate: "0x1",
          toDelegate: "0x2",
          power: "-3",
        },
        {
          id: "0x3_0x4",
          fromDelegate: "0x3",
          toDelegate: "0x4",
          power: "-4",
        },
        {
          id: "0x5_0x6",
          fromDelegate: "0x5",
          toDelegate: "0x6",
          power: "-5",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).variables).toEqual({
      limit: 3,
      offset: 0,
    });

    global.fetch = originalFetch;
  });

  it("loads workflow-configured targets with per-indexer caps", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "indexer-accuracy-audit-")
    );
    const targetsFile = path.join(tempDir, "targets.json");
    const auditConfigFile = path.join(tempDir, "audit-targets.yml");

    fs.writeFileSync(
      targetsFile,
      JSON.stringify([
        {
          code: "ring-dao",
          name: "RingDAO",
          indexerEndpoint: "https://indexer.degov.ai/ring-dao/graphql",
          rpcUrl: "https://rpc.darwinia.network",
          governorToken: "0xdafa555e2785DC8834F4Ea9D1ED88B6049142999",
          governor: "0x52cDD25f7C83c335236Ce209fA1ec8e197E96533",
        },
      ])
    );
    fs.writeFileSync(
      auditConfigFile,
      [
        "- name: ring-dao",
        "  indexer: https://indexer.degov.ai/ring-dao.graphql",
        "  limit: 50",
      ].join("\n")
    );

    await expect(loadTargets(targetsFile, auditConfigFile)).resolves.toEqual([
      {
        code: "ring-dao",
        name: "RingDAO",
        indexerEndpoint: "https://indexer.degov.ai/ring-dao.graphql",
        rpcUrl: "https://rpc.darwinia.network",
        governorToken: "0xdafa555e2785DC8834F4Ea9D1ED88B6049142999",
        governor: "0x52cDD25f7C83c335236Ce209fA1ec8e197E96533",
        tokenDecimals: 18,
        limit: 50,
        negativeLimit: 50,
      },
    ]);
  });

  it("builds a concise GitHub issue body with external report links", () => {
    const report = {
      generatedAt: "2026-03-30T06:00:00.000Z",
      summary: {
        checkedAccounts: 2,
        matches: 1,
        mismatches: 1,
        voteReadErrors: 0,
        negativeContributors: 0,
        negativeDelegates: 1,
        queryErrors: 0,
        totalAnomalies: 2,
      },
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
    };

    const issueBody = buildIssueBody({
      report,
      reportUrl: "https://paste.rs/abc123",
      runUrl: "https://github.com/ringecosystem/degov/actions/runs/23730563489",
    });

    expect(issueBody).toContain("## Indexer accuracy audit detected anomalies");
    expect(issueBody).toContain(
      "ENS (`ens-dao`): 2 anomalies; mismatches 1; read errors 0; negative contributors 0; negative delegates 1; query errors 0"
    );
    expect(issueBody).toContain(
      "- Full markdown report: [rendered report](https://paste.rs/abc123.md)"
    );
    expect(issueBody).toContain("- Raw markdown: https://paste.rs/abc123");
    expect(issueBody).not.toContain(
      "0xb8c2c29ee19d8307cb7255e1cd9cbde883a267d5"
    );
  });

  it("keeps the GitHub issue body compact when many DAOs have anomalies", () => {
    const targets = Array.from({ length: 12 }, (_value, index) => ({
      code: `dao-${index + 1}`,
      name: `DAO ${index + 1}`,
      checkedAccounts: 1,
      limit: 1,
      matches: 0,
      mismatches: [{}],
      voteReadErrors: [],
      negativeContributors: [],
      negativeDelegates: [],
      queryErrors: [],
      anomalyCount: 1,
    }));
    const report = {
      generatedAt: "2026-03-30T06:00:00.000Z",
      summary: {
        checkedAccounts: 12,
        matches: 0,
        mismatches: 12,
        voteReadErrors: 0,
        negativeContributors: 0,
        negativeDelegates: 0,
        queryErrors: 0,
        totalAnomalies: 12,
      },
      targets,
    };

    const issueBody = buildIssueBody({
      report,
      reportUrl: "https://paste.rs/abc123",
      runUrl: "https://github.com/ringecosystem/degov/actions/runs/23730563489",
      maxSummaryTargets: 3,
    });

    expect(issueBody).toContain("DAO 1 (`dao-1`): 1 anomalies");
    expect(issueBody).toContain("DAO 3 (`dao-3`): 1 anomalies");
    expect(issueBody).not.toContain("DAO 4 (`dao-4`): 1 anomalies");
    expect(issueBody).toContain(
      "9 more DAOs omitted from this summary. See the full report for complete details."
    );
  });

  it("uploads markdown reports to the configured paste host", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 201,
      statusText: "Created",
      text: async () => "https://paste.rs/abc123\n",
    });

    await expect(
      uploadMarkdownReport("# Hello", {
        fetchImpl,
        pasteBaseUrl: "https://paste.rs/",
      })
    ).resolves.toBe("https://paste.rs/abc123");

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://paste.rs/",
      expect.objectContaining({
        method: "POST",
        body: "# Hello",
      })
    );
  });

  it("falls back to workflow artifacts when report upload fails", () => {
    const report = {
      generatedAt: "2026-03-30T06:00:00.000Z",
      summary: {
        checkedAccounts: 1,
        matches: 0,
        mismatches: 1,
        voteReadErrors: 0,
        negativeContributors: 0,
        negativeDelegates: 0,
        queryErrors: 0,
        totalAnomalies: 1,
      },
      targets: [
        {
          code: "ens-dao",
          name: "ENS",
          checkedAccounts: 1,
          limit: 1,
          matches: 0,
          mismatches: [{}],
          voteReadErrors: [],
          negativeContributors: [],
          negativeDelegates: [],
          queryErrors: [],
          anomalyCount: 1,
        },
      ],
    };

    const issueBody = buildIssueBody({
      report,
      runUrl: "https://github.com/ringecosystem/degov/actions/runs/23730563489",
      uploadError: "Paste upload failed with HTTP 503 Service Unavailable",
    });

    expect(issueBody).toContain(
      "Full markdown report upload was unavailable. Use the workflow run artifacts for the complete report."
    );
    expect(issueBody).toContain(
      "Upload error: Paste upload failed with HTTP 503 Service Unavailable"
    );
    expect(issueBody).not.toContain("rendered report");
  });
});
