import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("published tarball installs and its executable completes a real stdio MCP exchange", { timeout: 60000 }, async () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const temp = mkdtempSync(resolve(tmpdir(), "linkdevi-npm-test-"));
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli, "Run with npm test so the npm executable is known");
  const npm = (args, cwd = root) => execFileSync(process.execPath, [npmCli, ...args], {
    cwd, encoding: "utf8", timeout: 45000, stdio: ["ignore", "pipe", "pipe"],
  });
  const requests = [];
  const api = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ fixture: true, action: requests.at(-1).body.action }));
  });
  let client;
  try {
    const [pack] = JSON.parse(npm(["pack", "--json", "--pack-destination", temp]));
    assert.deepEqual(pack.files.map(f => f.path).sort(), ["LICENSE", "README.md", "cli.mjs", "package.json", "server.mjs"].sort());
    assert.equal(pack.files.find(f => f.path === "cli.mjs").mode & 0o111, 0o111);
    const install = resolve(temp, "installed");
    npm(["install", "--prefix", install, "--offline", "--ignore-scripts", "--no-audit", "--no-fund", resolve(temp, pack.filename)], temp);
    const bin = resolve(install, "node_modules/.bin/linkdevi-mcp");
    const metadata = JSON.parse(readFileSync(resolve(install, "node_modules/@kgma/linkdevi-mcp/package.json"), "utf8"));
    assert.equal(execFileSync(bin, ["--version"], { encoding: "utf8" }).trim(), metadata.version);
    api.listen(0, "127.0.0.1");
    await once(api, "listening");
    client = new Client({ name: "packaged-release-test", version: "1.0.0" });
    await client.connect(new StdioClientTransport({
      command: bin,
      env: { ...process.env, LINKDEVI_API_KEY: "su_fixture", LINKDEVI_BASE_URL: `http://127.0.0.1:${api.address().port}` },
      stderr: "pipe",
    }));
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(t => t.name).sort(), ["capabilities", "preview_campaign", "create_campaign", "list_campaigns", "link_qr", "campaign_stats"].sort());
    const result = await client.callTool({ name: "capabilities", arguments: {} });
    assert.equal(result.structuredContent.fixture, true);
    assert.equal(result.structuredContent.status, 200);
    assert.deepEqual(requests, [{ path: "/api/v1/agent", auth: "Bearer su_fixture", body: { action: "capabilities" } }]);
  } finally {
    await client?.close();
    if (api.listening) await new Promise(resolve => api.close(resolve));
    rmSync(temp, { recursive: true, force: true });
  }
});
