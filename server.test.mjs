import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./server.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

test("CLI help/version do not require credentials, and startup errors do not expose inputs", () => {
  const cli = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  const run = (args, env = {}) => spawnSync(process.execPath, [cli, ...args], {
    env: { ...process.env, LINKDEVI_API_KEY: "", ...env }, encoding: "utf8", timeout: 10000,
  });
  const help = run(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /LINKDEVI_API_KEY/);
  const version = run(["--version"]);
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version);
  const missing = run([]);
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, "");
  assert.match(missing.stderr, /scoped key/);
  const unsafe = run([], { LINKDEVI_API_KEY: "su_fixture", LINKDEVI_BASE_URL: "https://private-secret:password@example.com" });
  assert.equal(unsafe.status, 1);
  assert.doesNotMatch(unsafe.stderr, /private-secret|password|su_fixture/);
  const unknown = run(["--key=private-secret"]);
  assert.equal(unknown.status, 1);
  assert.doesNotMatch(unknown.stderr, /private-secret/);
});

test("MCP tools validate inputs, preserve retry identity, and retain HTTP errors without leaking secrets", async () => {
  const requests = [];
  const server = createServer({
    apiKey: "su_fixture",
    fetchImpl: async (url, options) => {
      requests.push({
        url: String(url),
        options,
        body: JSON.parse(options.body),
      });
      return new Response(
        JSON.stringify({ error: "RATE_LIMIT_REACHED", retryAfter: 10 }),
        { status: 429 },
      );
    },
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "fixture", version: "1.0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  try {
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 6);
    const campaign = {
      requestId: "a43c37c0-350a-44ef-9d40-a5900c246891",
      name: "launch",
      url: "https://example.com",
      utmCampaign: "launch",
      domain: "linkdevi.com",
      channels: ["line"],
    };
    const first = await client.callTool({
      name: "create_campaign",
      arguments: campaign,
    });
    const second = await client.callTool({
      name: "create_campaign",
      arguments: campaign,
    });
    assert.equal(first.isError, true);
    assert.equal(first.structuredContent.retryAfter, 10);
    assert.deepEqual(requests[0].body, requests[1].body);
    assert.equal(requests[0].body.campaign.requestId, campaign.requestId);
    assert.equal(requests[0].options.redirect, "error");
    assert.equal(JSON.stringify(first).includes("su_fixture"), false);
    await client.callTool({
      name: "create_campaign",
      arguments: { ...campaign, requestId: "bad" },
    });
    assert.equal(requests.length, 2);
  } finally {
    await client.close();
    await server.close();
  }
});
test("does not retry ambiguous network errors or expose credentials", async () => {
  let count = 0;
  const server = createServer({
    apiKey: "su_secret",
    fetchImpl: async () => {
      count++;
      throw Error("su_secret");
    },
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "fixture", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  try {
    const result = await client.callTool({
      name: "capabilities",
      arguments: {},
    });
    assert.equal(count, 1);
    assert.equal(result.isError, true);
    assert.equal(JSON.stringify(result).includes("su_secret"), false);
  } finally {
    await client.close();
    await server.close();
  }
});
test("rejects credential-bearing origins and non-local plaintext transports", () => {
  for (const baseUrl of [
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com/path",
    "https://example.com/?key=x",
  ])
    assert.throws(() => createServer({ baseUrl, apiKey: "su_fixture" }));
});
