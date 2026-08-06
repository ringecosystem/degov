import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";

const portProbe = createServer();
portProbe.listen(0, "127.0.0.1");
await once(portProbe, "listening");
const address = portProbe.address();
assert.ok(address && typeof address === "object");
const appPort = address.port;
await new Promise((resolve, reject) =>
  portProbe.close((error) => (error ? reject(error) : resolve()))
);

const app = spawn(
  "pnpm",
  ["exec", "next", "start", "-p", String(appPort)],
  {
    cwd: new URL("..", import.meta.url),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let appLogs = "";
app.stdout.on("data", (chunk) => {
  appLogs += chunk;
});
app.stderr.on("data", (chunk) => {
  appLogs += chunk;
});

async function fetchRenderedHome() {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${appPort}/`);
      if (response.ok) return response.text();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`DAO homepage test server did not become ready: ${lastError}\n${appLogs}`);
}

try {
  const html = await fetchRenderedHome();
  const configName = html.match(/<meta name="configName" content="([^"]+)"/)?.[1];
  assert.ok(configName, "the rendered homepage must expose its DAO identity");
  const homeHeading = html.slice(html.indexOf("<h1"), html.indexOf("</h1>") + 5);
  assert.ok(homeHeading.includes(configName), "the established heading must render the DAO name");
  assert.match(html, />Overview</);
  assert.match(html, />Proposals</);
  assert.match(html, /"@type":"Organization"/);
  assert.doesNotMatch(
    html,
    /Canonical DAO site|Registry source|Governor contract|Indexer start block/
  );

  console.log("Verified rendered DAO homepage uses the established product UI.");
} finally {
  app.kill("SIGTERM");
  await Promise.race([
    once(app, "exit"),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
}
