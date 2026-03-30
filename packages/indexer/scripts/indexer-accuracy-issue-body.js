const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_MAX_SUMMARY_TARGETS = 10;
const DEFAULT_PASTE_BASE_URL = "https://paste.rs/";
const ISSUE_MARKER = "<!-- indexer-accuracy-audit -->";

function parseArgs(argv) {
  const options = {
    issueBodyFile: "",
    maxSummaryTargets: DEFAULT_MAX_SUMMARY_TARGETS,
    pasteBaseUrl: DEFAULT_PASTE_BASE_URL,
    reportJsonFile: "",
    reportMarkdownFile: "",
    reportUrlFile: "",
    runUrl: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const [flag, inlineValue] = token.split("=", 2);
    const value = inlineValue ?? argv[index + 1];

    switch (flag) {
      case "--report-json":
        options.reportJsonFile = value;
        break;
      case "--report-markdown":
        options.reportMarkdownFile = value;
        break;
      case "--issue-body-file":
        options.issueBodyFile = value;
        break;
      case "--report-url-file":
        options.reportUrlFile = value;
        break;
      case "--run-url":
        options.runUrl = value;
        break;
      case "--paste-base-url":
        options.pasteBaseUrl = value.endsWith("/") ? value : `${value}/`;
        break;
      case "--max-summary-targets":
        options.maxSummaryTargets = Number.parseInt(value, 10);
        break;
      default:
        throw new Error(`Unknown option: ${flag}`);
    }

    if (inlineValue === undefined) {
      index += 1;
    }
  }

  if (!options.reportJsonFile) {
    throw new Error("--report-json is required");
  }
  if (!options.reportMarkdownFile) {
    throw new Error("--report-markdown is required");
  }
  if (!options.issueBodyFile) {
    throw new Error("--issue-body-file is required");
  }
  if (!options.runUrl) {
    throw new Error("--run-url is required");
  }
  if (
    !Number.isInteger(options.maxSummaryTargets) ||
    options.maxSummaryTargets <= 0
  ) {
    throw new Error("--max-summary-targets must be a positive integer");
  }

  return options;
}

function formatTargetSummary(target) {
  return `- ${target.name} (\`${target.code}\`): ${target.anomalyCount} anomalies; mismatches ${target.mismatches.length}; read errors ${target.voteReadErrors.length}; negative contributors ${target.negativeContributors.length}; negative delegates ${target.negativeDelegates.length}; query errors ${target.queryErrors.length}`;
}

function sanitizeUploadError(uploadError) {
  if (!uploadError) {
    return "";
  }

  return uploadError.replace(/\s+/g, " ").trim();
}

function buildIssueBody({
  report,
  reportUrl = "",
  runUrl,
  uploadError = "",
  maxSummaryTargets = DEFAULT_MAX_SUMMARY_TARGETS,
}) {
  const anomalousTargets = (report.targets ?? []).filter(
    (target) => target.anomalyCount > 0
  );
  const displayedTargets = anomalousTargets.slice(0, maxSummaryTargets);
  const omittedTargetCount = anomalousTargets.length - displayedTargets.length;
  const safeUploadError = sanitizeUploadError(uploadError);
  const lines = [];

  lines.push(ISSUE_MARKER);
  lines.push("");
  lines.push("## Indexer accuracy audit detected anomalies");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("### Summary");
  lines.push("");
  lines.push(`- Checked accounts: ${report.summary.checkedAccounts}`);
  lines.push(`- Matches: ${report.summary.matches}`);
  lines.push(`- Vote mismatches: ${report.summary.mismatches}`);
  lines.push(`- Vote read errors: ${report.summary.voteReadErrors}`);
  lines.push(
    `- Negative contributor rows: ${report.summary.negativeContributors}`
  );
  lines.push(`- Negative delegate rows: ${report.summary.negativeDelegates}`);
  lines.push(`- Query errors: ${report.summary.queryErrors}`);
  lines.push(`- Total anomalies: ${report.summary.totalAnomalies}`);

  if (displayedTargets.length > 0) {
    lines.push("");
    lines.push("### Affected DAOs");
    lines.push("");

    for (const target of displayedTargets) {
      lines.push(formatTargetSummary(target));
    }

    if (omittedTargetCount > 0) {
      lines.push(
        `- ${omittedTargetCount} more DAOs omitted from this summary. See the full report for complete details.`
      );
    }
  }

  lines.push("");
  lines.push("### Details");
  lines.push("");

  if (reportUrl) {
    lines.push(`- Full markdown report: [rendered report](${reportUrl}.md)`);
    lines.push(`- Raw markdown: ${reportUrl}`);
  } else {
    lines.push(
      "- Full markdown report upload was unavailable. Use the workflow run artifacts for the complete report."
    );

    if (safeUploadError) {
      lines.push(`- Upload error: ${safeUploadError}`);
    }
  }

  lines.push("- Artifact bundle: available on the workflow run page");
  lines.push(`- Workflow run: ${runUrl}`);

  return `${lines.join("\n")}\n`;
}

async function uploadMarkdownReport(
  markdown,
  {
    fetchImpl = global.fetch,
    pasteBaseUrl = DEFAULT_PASTE_BASE_URL,
  } = {}
) {
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required to upload the report");
  }

  const response = await fetchImpl(pasteBaseUrl, {
    method: "POST",
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "user-agent": "ringecosystem-degov-indexer-accuracy-audit",
    },
    body: markdown,
  });
  const responseBody = (await response.text()).trim();

  if (response.status === 201) {
    if (!responseBody) {
      throw new Error("Paste upload succeeded without returning a report URL");
    }

    return responseBody;
  }

  if (response.status === 206) {
    throw new Error("Paste upload was truncated by the host (HTTP 206)");
  }

  const suffix = responseBody ? `: ${responseBody}` : "";
  throw new Error(
    `Paste upload failed with HTTP ${response.status} ${response.statusText}${suffix}`.trim()
  );
}

async function writeFileIfNeeded(filePath, content) {
  if (!filePath) {
    return;
  }

  const absolutePath = path.resolve(process.cwd(), filePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
}

async function main(
  argv = process.argv.slice(2),
  { fetchImpl = global.fetch } = {}
) {
  const options = parseArgs(argv);
  const reportJsonPath = path.resolve(process.cwd(), options.reportJsonFile);
  const reportMarkdownPath = path.resolve(
    process.cwd(),
    options.reportMarkdownFile
  );
  const report = JSON.parse(await fs.readFile(reportJsonPath, "utf8"));
  const markdown = await fs.readFile(reportMarkdownPath, "utf8");
  let reportUrl = "";
  let uploadError = "";

  try {
    reportUrl = await uploadMarkdownReport(markdown, {
      fetchImpl,
      pasteBaseUrl: options.pasteBaseUrl,
    });
  } catch (error) {
    uploadError = error?.message ?? String(error);
  }

  const issueBody = buildIssueBody({
    report,
    reportUrl,
    runUrl: options.runUrl,
    uploadError,
    maxSummaryTargets: options.maxSummaryTargets,
  });

  await writeFileIfNeeded(options.issueBodyFile, issueBody);
  await writeFileIfNeeded(
    options.reportUrlFile,
    reportUrl ? `${reportUrl}\n` : ""
  );

  console.log(
    JSON.stringify(
      {
        hasAnomalies: report.summary.totalAnomalies > 0,
        issueBodyLength: issueBody.length,
        reportUrl: reportUrl || null,
        uploadError: uploadError || null,
      },
      null,
      2
    )
  );
}

module.exports = {
  buildIssueBody,
  formatTargetSummary,
  main,
  parseArgs,
  uploadMarkdownReport,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
