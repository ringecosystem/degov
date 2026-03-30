const GITHUB_ISSUE_BODY_MAX_LENGTH = 65536;
const ISSUE_BODY_MARKER = "<!-- indexer-accuracy-audit -->";
const ISSUE_BODY_TRUNCATION_NOTICE = [
  "> Report truncated to fit GitHub issue body limit.",
  "> See the workflow artifact and job summary for the full report.",
].join("\n");

function buildIssueBody(reportMarkdown, runUrl, options = {}) {
  const marker = options.marker ?? ISSUE_BODY_MARKER;
  const maxLength = options.maxLength ?? GITHUB_ISSUE_BODY_MAX_LENGTH;
  const normalizedReport = reportMarkdown.trimEnd();
  const runLine = `_Run: ${runUrl}_`;
  const fullBody = `${marker}\n${normalizedReport}\n${runLine}\n`;

  if (fullBody.length <= maxLength) {
    return fullBody;
  }

  const truncationSuffix = `\n...\n\n${ISSUE_BODY_TRUNCATION_NOTICE}\n\n${runLine}\n`;
  const availableLength =
    maxLength - `${marker}\n`.length - truncationSuffix.length;
  const truncatedReport = normalizedReport
    .slice(0, Math.max(0, availableLength))
    .trimEnd();

  return `${marker}\n${truncatedReport}${truncationSuffix}`;
}

module.exports = {
  buildIssueBody,
  GITHUB_ISSUE_BODY_MAX_LENGTH,
  ISSUE_BODY_MARKER,
  ISSUE_BODY_TRUNCATION_NOTICE,
};
