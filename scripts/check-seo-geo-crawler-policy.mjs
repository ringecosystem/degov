import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policyPath = path.join(rootDir, "docs/spec/seo-geo-crawler-access-policy.json");
const policy = JSON.parse(readFileSync(policyPath, "utf8"));

const requiredPurposeClasses = new Set([
  "search-index",
  "ai-search-reference",
  "user-triggered-fetch",
  "model-training",
  "social-preview",
]);
const requiredPublicSurfaces = new Set(["home", "docs", "square", "dao-sites", "atlas"]);
const requiredSurfaceIds = new Set([
  ...requiredPublicSurfaces,
  "private-transactional-preview-staging",
]);
const requiredControlLayers = new Set([
  "application-robots",
  "cdn-waf",
  "gitops-infrastructure",
  "authentication",
]);
const requiredAgentIds = new Set([
  "googlebot",
  "bingbot",
  "oai-searchbot",
  "chatgpt-user",
  "gptbot",
  "claude-searchbot",
  "claude-user",
  "claudebot",
  "perplexitybot",
  "perplexity-user",
  "google-extended",
  "facebookexternalhit",
  "linkedinbot",
  "twitterbot",
  "slackbot",
  "discordbot",
  "telegrambot",
]);
const requiredOwners = new Set(["product", "legal", "security", "infrastructure"]);
const policyValues = new Set([
  "allow",
  "block",
  "conditional",
  "undecided",
  "block-by-default",
  "block-or-auth-required",
]);
const evidenceStates = new Set([
  "observed",
  "not-observed",
  "access-gap",
  "known-fail",
]);
const robotsStates = new Set(["observed", "known-gap", "known-fail", "mixed"]);
const robotsOutcomes = new Set(["allowed", "blocked", "mixed", "gap", "not-observed"]);
const edgeOutcomes = new Set(["allowed", "blocked", "challenged", "failed", "not-observed", "access-gap"]);
const sourceTypes = new Set([
  "provider-crawler-documentation",
  "provider-published-token-list",
  "provider-generic-reference",
]);
const verificationMethods = new Set([
  "provider-ip-rdns-or-verified-bot-signal",
  "robots-policy-audit",
  "unavailable",
]);
const maxIdentityStates = new Set([
  "verified",
  "unverified",
  "policy-token-only",
]);
const tokenTypes = new Set(["http-user-agent", "robots-product-token"]);
const expectedAgents = {
  googlebot: {
    token: "Googlebot",
    tokenType: "http-user-agent",
    purposeClass: "search-index",
    desiredPolicy: "allow",
  },
  bingbot: {
    token: "Bingbot",
    tokenType: "http-user-agent",
    purposeClass: "search-index",
    desiredPolicy: "allow",
  },
  "oai-searchbot": {
    token: "OAI-SearchBot",
    tokenType: "http-user-agent",
    purposeClass: "ai-search-reference",
    desiredPolicy: "allow",
  },
  "chatgpt-user": {
    token: "ChatGPT-User",
    tokenType: "http-user-agent",
    purposeClass: "user-triggered-fetch",
    desiredPolicy: "allow",
  },
  gptbot: {
    token: "GPTBot",
    tokenType: "http-user-agent",
    purposeClass: "model-training",
    desiredPolicy: "block-by-default",
  },
  "claude-searchbot": {
    token: "Claude-SearchBot",
    tokenType: "http-user-agent",
    purposeClass: "ai-search-reference",
    desiredPolicy: "allow",
  },
  "claude-user": {
    token: "Claude-User",
    tokenType: "http-user-agent",
    purposeClass: "user-triggered-fetch",
    desiredPolicy: "allow",
  },
  claudebot: {
    token: "ClaudeBot",
    tokenType: "http-user-agent",
    purposeClass: "model-training",
    desiredPolicy: "block-by-default",
  },
  perplexitybot: {
    token: "PerplexityBot",
    tokenType: "http-user-agent",
    purposeClass: "ai-search-reference",
    desiredPolicy: "allow",
  },
  "perplexity-user": {
    token: "Perplexity-User",
    tokenType: "http-user-agent",
    purposeClass: "user-triggered-fetch",
    desiredPolicy: "allow",
  },
  "google-extended": {
    token: "Google-Extended",
    tokenType: "robots-product-token",
    purposeClass: "model-training",
    desiredPolicy: "block-by-default",
  },
  facebookexternalhit: {
    token: "facebookexternalhit",
    tokenType: "http-user-agent",
    purposeClass: "social-preview",
    desiredPolicy: "allow",
  },
  linkedinbot: {
    token: "LinkedInBot",
    tokenType: "http-user-agent",
    purposeClass: "social-preview",
    desiredPolicy: "allow",
  },
  twitterbot: {
    token: "Twitterbot",
    tokenType: "http-user-agent",
    purposeClass: "social-preview",
    desiredPolicy: "allow",
  },
  slackbot: {
    token: "Slackbot-LinkExpanding",
    tokenType: "http-user-agent",
    purposeClass: "social-preview",
    desiredPolicy: "allow",
  },
  discordbot: {
    token: "Discordbot",
    tokenType: "http-user-agent",
    purposeClass: "social-preview",
    desiredPolicy: "allow",
  },
  telegrambot: {
    token: "TelegramBot",
    tokenType: "http-user-agent",
    purposeClass: "social-preview",
    desiredPolicy: "allow",
  },
};
const requiredLogFields = new Set([
  "timestamp",
  "host",
  "pathGroup",
  "statusGroup",
  "userAgent",
  "crawlerPurpose",
  "identityVerification",
  "wafAction",
  "cacheResult",
  "count",
  "window",
]);
const requiredIdentityStates = new Set([
  "verified",
  "unverified",
  "policy-token-only",
  "not-observed",
]);
const requiredAccessOutcomeStates = new Set([
  "allowed",
  "blocked",
  "challenged",
  "failed",
  "not-observed",
]);

assert.equal(policy.version, 1);
assert.equal(policy.ownerIssue, "https://github.com/ringecosystem/degov/issues/1026");
assert.equal(policy.parentIssue, "https://github.com/ringecosystem/degov/issues/714");
assert.equal(policy.maintenance.contractPath, "docs/spec/seo-geo-crawler-access-policy.json");
assert.equal(policy.maintenance.localCheck, "pnpm run test:seo-geo-crawler-policy");
assert.match(policy.maintenance.changeRule, /owner/);
assert.match(policy.maintenance.changeRule, /official source/);
assert.match(policy.maintenance.changeRule, /rollback/);

assert.equal(policy.policyDefaults.publicSearchIndex, "allow");
assert.equal(policy.policyDefaults.publicAiSearchReference, "allow");
assert.equal(policy.policyDefaults.publicUserTriggeredFetch, "allow");
assert.equal(policy.policyDefaults.publicModelTraining, "block-by-default");
assert.equal(policy.policyDefaults.publicSocialPreview, "allow");
assert.equal(
  policy.policyDefaults.privateTransactionalPreviewStaging,
  "block-or-auth-required"
);
assert.match(policy.policyDefaults.trainingAccessRule, /legal/);
assert.match(policy.policyDefaults.trainingAccessRule, /security/);
assert.match(policy.policyDefaults.identityRule, /User-Agent alone is never verified identity/);

assert.equal(
  policy.purposeClasses.length,
  new Set(policy.purposeClasses.map((purpose) => purpose.id)).size,
  "purpose class IDs must be unique"
);
const purposeIds = new Set(policy.purposeClasses.map((purpose) => purpose.id));
for (const purposeId of requiredPurposeClasses) {
  assert.ok(purposeIds.has(purposeId), `missing purpose class ${purposeId}`);
}
for (const purpose of policy.purposeClasses) {
  assert.ok(requiredPurposeClasses.has(purpose.id), `unexpected purpose class ${purpose.id}`);
  assert.ok(policyValues.has(purpose.defaultPolicy), `${purpose.id} defaultPolicy`);
  assert.ok(purpose.description.length > 20, `${purpose.id} description`);
  assert.ok(purpose.expectedPublicOutcome.length > 20, `${purpose.id} expectedPublicOutcome`);
  assert.match(
    purpose.notObservedMeaning,
    /No verified|absence/,
    `${purpose.id} must preserve not-observed semantics`
  );
}

assert.equal(
  policy.productSurfaces.length,
  new Set(policy.productSurfaces.map((surface) => surface.id)).size,
  "product surface IDs must be unique"
);
const surfaceIds = new Set(policy.productSurfaces.map((surface) => surface.id));
for (const surfaceId of requiredSurfaceIds) {
  assert.ok(surfaceIds.has(surfaceId), `missing surface ${surfaceId}`);
}
for (const surface of policy.productSurfaces) {
  assert.ok(requiredSurfaceIds.has(surface.id), `unexpected surface ${surface.id}`);
  assert.ok(Array.isArray(surface.hostScope));
  assert.ok(surface.hostScope.length > 0, `${surface.id} hostScope`);
  assert.match(surface.repository, /^ringecosystem\/|^owning application/);
  assert.ok(surface.ownerRole.length > 3, `${surface.id} ownerRole`);
  assert.ok(surface.routeScope.length > 20, `${surface.id} routeScope`);
  for (const purposeId of requiredPurposeClasses) {
    assert.ok(
      Object.hasOwn(surface.desiredPolicyByPurpose, purposeId),
      `${surface.id} missing policy for ${purposeId}`
    );
    assert.ok(
      policyValues.has(surface.desiredPolicyByPurpose[purposeId]),
      `${surface.id}/${purposeId} policy`
    );
  }
  if (requiredPublicSurfaces.has(surface.id)) {
    assert.equal(surface.desiredPolicyByPurpose["search-index"], "allow");
    assert.equal(surface.desiredPolicyByPurpose["ai-search-reference"], "allow");
    assert.equal(surface.desiredPolicyByPurpose["user-triggered-fetch"], "allow");
    assert.equal(surface.desiredPolicyByPurpose["model-training"], "block-by-default");
    assert.equal(surface.desiredPolicyByPurpose["social-preview"], "allow");
  }
  if (surface.id === "private-transactional-preview-staging") {
    for (const purposeId of requiredPurposeClasses) {
      assert.equal(surface.desiredPolicyByPurpose[purposeId], "block-or-auth-required");
    }
  }
}

assert.equal(
  policy.controlLayers.length,
  new Set(policy.controlLayers.map((layer) => layer.id)).size,
  "control layer IDs must be unique"
);
const controlLayerIds = new Set(policy.controlLayers.map((layer) => layer.id));
for (const layerId of requiredControlLayers) {
  assert.ok(controlLayerIds.has(layerId), `missing control layer ${layerId}`);
}
for (const layer of policy.controlLayers) {
  assert.ok(requiredControlLayers.has(layer.id), `unexpected control layer ${layer.id}`);
  assert.ok(layer.ownerRole.length > 3, `${layer.id} ownerRole`);
  assert.ok(layer.scope.length > 20, `${layer.id} scope`);
  assert.ok(layer.publicEvidence.length > 20, `${layer.id} publicEvidence`);
  assert.ok(layer.confidentiality.length > 3, `${layer.id} confidentiality`);
}

assert.equal(
  policy.crawlerAgents.length,
  new Set(policy.crawlerAgents.map((agent) => agent.id)).size,
  "crawler agent IDs must be unique"
);
const agentIds = new Set(policy.crawlerAgents.map((agent) => agent.id));
for (const agentId of requiredAgentIds) {
  assert.ok(agentIds.has(agentId), `missing crawler agent ${agentId}`);
}
const agentPurposeCoverage = new Set(policy.crawlerAgents.map((agent) => agent.purposeClass));
for (const purposeId of requiredPurposeClasses) {
  assert.ok(agentPurposeCoverage.has(purposeId), `missing agent coverage for ${purposeId}`);
}
for (const agent of policy.crawlerAgents) {
  assert.ok(requiredAgentIds.has(agent.id), `unexpected crawler agent ${agent.id}`);
  assert.ok(expectedAgents[agent.id], `${agent.id} must have fixed expectations`);
  assert.equal(agent.token, expectedAgents[agent.id].token, `${agent.id} token`);
  assert.equal(agent.tokenType, expectedAgents[agent.id].tokenType, `${agent.id} tokenType`);
  assert.equal(
    agent.purposeClass,
    expectedAgents[agent.id].purposeClass,
    `${agent.id} purposeClass is fixed by provider purpose`
  );
  assert.equal(
    agent.desiredPolicy,
    expectedAgents[agent.id].desiredPolicy,
    `${agent.id} desiredPolicy is fixed by policy`
  );
  assert.ok(agent.provider.length > 1, `${agent.id} provider`);
  assert.ok(tokenTypes.has(agent.tokenType), `${agent.id} tokenType`);
  assert.ok(requiredPurposeClasses.has(agent.purposeClass), `${agent.id} purposeClass`);
  assert.match(agent.officialSource, /^https:\/\//, `${agent.id} officialSource`);
  assert.ok(sourceTypes.has(agent.officialSourceType), `${agent.id} officialSourceType`);
  assert.ok(
    verificationMethods.has(agent.identityVerificationMethod),
    `${agent.id} identityVerificationMethod`
  );
  assert.ok(maxIdentityStates.has(agent.maxIdentityState), `${agent.id} maxIdentityState`);
  assert.ok(agent.robotsBehavior.length > 20, `${agent.id} robotsBehavior`);
  assert.ok(agent.identityVerification.length > 20, `${agent.id} identityVerification`);
  assert.ok(Array.isArray(agent.productScope));
  for (const surfaceId of agent.productScope) {
    assert.ok(requiredPublicSurfaces.has(surfaceId), `${agent.id} productScope ${surfaceId}`);
  }
  assert.ok(Array.isArray(agent.enforcementLayers));
  assert.ok(agent.enforcementLayers.length > 0, `${agent.id} enforcementLayers`);
  for (const layerId of agent.enforcementLayers) {
    assert.ok(controlLayerIds.has(layerId), `${agent.id} enforcement layer ${layerId}`);
  }
  assert.ok(evidenceStates.has(agent.evidenceState), `${agent.id} evidenceState`);
  assert.ok(Array.isArray(agent.ownerApprovers));
  assert.ok(agent.ownerApprovers.length > 0, `${agent.id} ownerApprovers`);
  for (const owner of agent.ownerApprovers) {
    assert.ok(requiredOwners.has(owner), `${agent.id} ownerApprover ${owner}`);
  }
  assert.ok(agent.rollback.length > 20, `${agent.id} rollback`);
  if (agent.purposeClass === "model-training") {
    assert.equal(agent.desiredPolicy, "block-by-default", `${agent.id} training policy`);
    assert.ok(agent.ownerApprovers.includes("legal"), `${agent.id} legal owner`);
    assert.ok(agent.ownerApprovers.includes("security"), `${agent.id} security owner`);
  }
  if (agent.identityVerificationMethod === "unavailable") {
    assert.equal(agent.maxIdentityState, "unverified", `${agent.id} unavailable verification`);
    assert.match(agent.identityVerification, /unverified/);
  }
  if (agent.id === "google-extended") {
    assert.equal(agent.purposeClass, "model-training");
    assert.equal(agent.desiredPolicy, "block-by-default");
    assert.equal(agent.maxIdentityState, "policy-token-only");
    assert.match(agent.robotsBehavior, /not a distinct HTTP User-Agent/);
    assert.match(agent.identityVerification, /Do not expect Google-Extended in request logs/);
    assert.deepEqual(agent.enforcementLayers, ["application-robots"]);
  }
}

assert.equal(
  policy.currentProductionBehavior.length,
  requiredPublicSurfaces.size,
  "current behavior must cover every public surface"
);
const behaviorSurfaces = new Set(
  policy.currentProductionBehavior.map((behavior) => behavior.surface)
);
for (const surfaceId of requiredPublicSurfaces) {
  assert.ok(behaviorSurfaces.has(surfaceId), `missing current behavior for ${surfaceId}`);
}
for (const behavior of policy.currentProductionBehavior) {
  assert.ok(requiredPublicSurfaces.has(behavior.surface));
  assert.ok(Array.isArray(behavior.hosts));
  assert.ok(behavior.hosts.length > 0, `${behavior.surface} hosts`);
  assert.ok(
    Number.isFinite(Date.parse(behavior.observedAt)),
    `${behavior.surface} observedAt`
  );
  assert.match(behavior.observationWindow, /^public-http-readback-\d{4}-\d{2}-\d{2}$/);
  assert.ok(behavior.source.length > 5, `${behavior.surface} source`);
  assert.ok(behavior.publicRobots, `${behavior.surface} publicRobots`);
  assert.ok(robotsStates.has(behavior.publicRobots.state), `${behavior.surface} robots state`);
  assert.ok(Number.isInteger(behavior.publicRobots.statusCode), `${behavior.surface} statusCode`);
  assert.ok(behavior.publicRobots.contentType.length > 3, `${behavior.surface} contentType`);
  assert.ok(behavior.publicRobots.summary.length > 30, `${behavior.surface} robots summary`);
  assert.ok(behavior.cdnWaf, `${behavior.surface} cdnWaf`);
  assert.equal(behavior.cdnWaf.state, "access-gap", `${behavior.surface} cdnWaf state`);
  assert.ok(behavior.cdnWaf.ownerRole.length > 3, `${behavior.surface} cdnWaf ownerRole`);
  assert.match(behavior.cdnWaf.requiredAction, /aggregate verified-bot outcomes/);
  assert.ok(behavior.authState.length > 5, `${behavior.surface} authState`);
  assert.ok(Array.isArray(behavior.purposeOutcomes), `${behavior.surface} purposeOutcomes`);
  assert.equal(
    behavior.purposeOutcomes.length,
    requiredPurposeClasses.size,
    `${behavior.surface} purpose outcome count`
  );
  const purposeOutcomeIds = new Set(
    behavior.purposeOutcomes.map((outcome) => outcome.purposeClass)
  );
  for (const purposeId of requiredPurposeClasses) {
    assert.ok(
      purposeOutcomeIds.has(purposeId),
      `${behavior.surface} missing purpose outcome ${purposeId}`
    );
  }
  for (const outcome of behavior.purposeOutcomes) {
    assert.ok(requiredPurposeClasses.has(outcome.purposeClass));
    assert.ok(robotsOutcomes.has(outcome.publicRobotsOutcome));
    assert.ok(edgeOutcomes.has(outcome.edgeOutcome));
    assert.ok(outcome.evidenceBasis.length > 5, `${behavior.surface}/${outcome.purposeClass} evidenceBasis`);
  }
  assert.ok(behavior.gapOwner.length > 3, `${behavior.surface} gapOwner`);
  assert.match(behavior.evidenceLink, /^https:\/\/github\.com\/ringecosystem\//);
}

assert.ok(Array.isArray(policy.authoritativeRuleMap));
assert.equal(
  policy.authoritativeRuleMap.length,
  requiredPublicSurfaces.size * requiredPurposeClasses.size,
  "authoritative map must cover every public surface x purpose"
);
const authoritativeKeys = new Set();
for (const rule of policy.authoritativeRuleMap) {
  assert.ok(requiredPublicSurfaces.has(rule.surface), `rule surface ${rule.surface}`);
  assert.ok(requiredPurposeClasses.has(rule.purposeClass), `rule purpose ${rule.purposeClass}`);
  const key = `${rule.surface}/${rule.purposeClass}`;
  assert.ok(!authoritativeKeys.has(key), `duplicate authoritative rule ${key}`);
  authoritativeKeys.add(key);
  assert.ok(policyValues.has(rule.desiredPolicy), `${key} desiredPolicy`);
  assert.ok(Array.isArray(rule.authoritativeLayers), `${key} authoritativeLayers`);
  assert.ok(rule.authoritativeLayers.length > 0, `${key} authoritativeLayers`);
  for (const layerId of rule.authoritativeLayers) {
    assert.ok(controlLayerIds.has(layerId), `${key} layer ${layerId}`);
  }
  if (rule.purposeClass === "model-training") {
    assert.ok(rule.authoritativeLayers.includes("gitops-infrastructure"), `${key} gitops layer`);
    assert.match(rule.ownerRole, /legal\/security\/infrastructure/);
  }
  assert.ok(rule.ownerRepository.length > 3, `${key} ownerRepository`);
  assert.ok(rule.ownerRole.length > 3, `${key} ownerRole`);
  assert.match(rule.conflictRule, /most restrictive approved layer wins/);
  assert.ok(rule.rollbackOwner.length > 3, `${key} rollbackOwner`);
  assert.ok(rule.followupTarget.length > 3, `${key} followupTarget`);
}

const verificationLogFields = new Set(policy.verificationRequirements.requiredLogFields);
for (const field of requiredLogFields) {
  assert.ok(verificationLogFields.has(field), `missing verification log field ${field}`);
}
const identityStates = new Set(policy.verificationRequirements.identityStates);
for (const state of requiredIdentityStates) {
  assert.ok(identityStates.has(state), `missing identity state ${state}`);
}
const accessOutcomeStates = new Set(policy.verificationRequirements.accessOutcomeStates);
for (const state of requiredAccessOutcomeStates) {
  assert.ok(accessOutcomeStates.has(state), `missing access outcome state ${state}`);
}
assert.match(policy.verificationRequirements.rule, /User-Agent string alone/);
assert.match(policy.verificationRequirements.rule, /not report a policy as implemented/);

assert.ok(Array.isArray(policy.implementationFollowups));
assert.ok(policy.implementationFollowups.length >= 6);
assert.ok(
  policy.implementationFollowups.some(
    (followup) => followup.ownerRepository === "infrastructure policy repository"
  ),
  "missing infrastructure follow-up boundary"
);
for (const followup of policy.implementationFollowups) {
  assert.match(followup.ownerRepository, /^ringecosystem\/|^infrastructure policy repository$/);
  assert.match(followup.when, /Open only/);
  assert.ok(followup.allowedScope.length > 20);
}

for (const owner of requiredOwners) {
  assert.ok(policy.rollout.reviewRequired.includes(owner), `missing rollout owner ${owner}`);
}
assert.ok(policy.rollout.preflight.includes("confirm intended policy"));
assert.ok(policy.rollout.preflight.includes("confirm owning repository"));
assert.ok(policy.rollout.monitoringWindowHours >= 24);
assert.ok(policy.rollout.rollbackTriggers.includes("training access widened without approval"));
assert.match(policy.rollout.rollbackProcedure, /Revert/);
assert.match(policy.rollout.incidentRule, /security incident/);

assert.equal(policy.approvalState.status, "approved-policy-contract");
assert.equal(
  policy.approvalState.linkedUmbrellaIssue,
  "https://github.com/ringecosystem/degov/issues/714"
);
assert.ok(Array.isArray(policy.approvalState.approvalRecords));
const approvalRoles = new Set(
  policy.approvalState.approvalRecords.map((record) => record.role)
);
for (const owner of requiredOwners) {
  assert.ok(approvalRoles.has(owner), `missing approval record ${owner}`);
}
for (const record of policy.approvalState.approvalRecords) {
  assert.ok(requiredOwners.has(record.role), `approval role ${record.role}`);
  assert.ok(record.decision.length > 30, `${record.role} decision`);
  assert.match(record.evidenceLink, /^https:\/\/github\.com\/ringecosystem\/degov\/issues\/1026/);
  if (record.role === "legal") {
    assert.match(record.decision, /preserving model-training restrictions/);
    assert.match(record.decision, /future explicit legal approval/);
  }
}
assert.ok(policy.approvalState.limitations.includes("training access remains blocked by default"));

console.log(
  `SEO/GEO crawler policy ok: ${policy.crawlerAgents.length} agents, ${policy.productSurfaces.length} surfaces, ${policy.controlLayers.length} control layers`
);
