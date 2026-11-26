#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.mjs";

const args = process.argv.slice(2);
if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
  console.log(`LinkDevi MCP — local stdio connector

Usage: linkdevi-mcp
       linkdevi-mcp --version

Required environment: LINKDEVI_API_KEY (scoped key from your LinkDevi account)
Optional environment: LINKDEVI_BASE_URL (default https://linkdevi.com)

Setup and account: https://linkdevi.com/features/ai
Keep API keys in protected client settings, never in prompts or repositories.
The MCP client must launch this command with stdin/stdout connected.`);
} else if (args.length === 1 && ["--version", "-v"].includes(args[0])) {
  const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  console.log(version);
} else if (args.length) {
  console.error("Unsupported arguments. Use --help. Supply credentials through environment variables.");
  process.exitCode = 1;
} else {
  try {
    await createServer({
      baseUrl: process.env.LINKDEVI_BASE_URL,
      apiKey: process.env.LINKDEVI_API_KEY,
    }).connect(new StdioServerTransport());
  } catch {
    console.error("Unable to start LinkDevi MCP. Set LINKDEVI_API_KEY to a valid scoped key and use an HTTPS origin (or localhost HTTP for development).");
    process.exitCode = 1;
  }
}
