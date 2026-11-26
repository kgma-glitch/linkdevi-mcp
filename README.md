# LinkDevi MCP

MIT-licensed local MCP server for creating and managing LinkDevi campaign short links from an MCP-compatible AI client. Preview UTM destinations, create a saved campaign, generate a QR image and read clearly defined redirect counters.

Requires **Node.js 22+**, a [LinkDevi account](https://linkdevi.com/register) and a scoped API key. The connector source is free; the hosted LinkDevi service uses your account's plan, quota and request limits. This package does not include a self-hosted shortening service or a model subscription. It runs locally over stdio; remote OAuth connections are not provided.

## Quick setup

1. Sign in to [LinkDevi](https://linkdevi.com) and open **Connect AI** (`/ai`) to create a scoped key.
2. Add the configuration below to an MCP client that supports local stdio servers. Set the environment value in the client's protected settings and restart the connection.
3. Ask the AI to check `capabilities`, preview a campaign and create it after you review the destinations.

```sh
npx --yes @kgma/linkdevi-mcp@0.1.1 --help
```

Example client configuration (the exact settings location depends on your client):

```json
{
  "mcpServers": {
    "linkdevi": {
      "command": "npx",
      "args": ["--yes", "@kgma/linkdevi-mcp@0.1.1"],
      "env": {
        "LINKDEVI_API_KEY": "YOUR_SCOPED_KEY",
        "LINKDEVI_BASE_URL": "https://linkdevi.com"
      }
    }
  }
}
```

On Windows, clients that cannot launch `npx` directly may require `command: "cmd"` with `args: ["/c", "npx", "--yes", "@kgma/linkdevi-mcp@0.1.1"]`. Ensure Node/npm are available to the desktop client's environment. Pin the version as shown so updates are deliberate.

For a local installation, run `npm install @kgma/linkdevi-mcp@0.1.1` and launch `node /absolute/path/to/node_modules/@kgma/linkdevi-mcp/cli.mjs` from your MCP client. `linkdevi-mcp --version` and `--help` work without an API key. Do not pass a key as a command-line argument.

Create a key in the dashboard with `links:read` and `links:write`; give read-only consumers only `links:read`. Keep the real key in the client's protected settings, never in a repository or prompt. New keys require explicit nonempty scopes. Existing empty-scope keys retain legacy full access; replace these with scoped keys for AI. Key management is not an MCP tool.

Example prompt: “Preview a campaign for https://example.com/sale named December launch, with Facebook, LINE and print channels. Show me the destinations before creating the links.”

For local verification set the base to `http://127.0.0.1:PORT`. HTTPS is required for other hosts. The connector rejects redirects to avoid forwarding credentials. It does not automatically retry requests.

## Tools

- `capabilities`: workspace plan, limits, stored-link usage, scopes and counter definition.
- `preview_campaign`: exact channel destinations and slot cost; no resources or quota reservation.
- `create_campaign`: create a saved kit through the same service as the website. Supply a UUID `requestId`. Reuse the UUID and identical payload after a lost response. Changed payload with the same UUID returns 409. Replays consume no additional stored-link slots but still count as API requests.
- `list_campaigns`: paginated workspace kits, twenty per page.
- `link_qr`: render a PNG for an existing link using its saved short domain; does not persist a QR record.
- `campaign_stats`: lifetime recorded redirect counters, plus explicit metric semantics and unavailable channels.

Example campaign arguments:

```json
{
  "requestId": "a43c37c0-350a-44ef-9d40-a5900c246891",
  "name": "December launch",
  "url": "https://example.com/sale",
  "utmCampaign": "december-launch",
  "domain": "linkdevi.com",
  "channels": ["facebook", "line", "print"]
}
```

Preview then create with these same arguments. Three channels consume three stored-link slots. Supported channels: facebook, instagram, tiktok, line, email, print, youtube, x. Domain choices follow the existing campaign builder's public-system-domain allowlist; customer-owned domains are not added by this release.

## Reporting and limits

Counters include bots and link previews, are best effort and are not unique people, dated activity, conversions, or revenue. Missing channel records are unavailable, not zero. `observedAt` is the time the counter was read, not a tracking-completeness watermark. Reopening a result on the website uses `/campaigns` on the configured origin.

The plan RPM allowance is shared across keys for the workspace; a key can have a lower ceiling. 429 includes `Retry-After`; wait before manually retrying with the original identity. 503 can mean admission storage is unavailable. Capability output is a snapshot, not guaranteed admission for subsequent mutations. The caller's model cost is separate; this connector does not invoke an LLM.

## Verification

In a source checkout, `npm ci` then `npm test` exercises MCP initialization, tool discovery, schema validation, stable retry identity, HTTP error propagation, network ambiguity, credential transport restrictions and CLI startup with the official SDK. Tests and application infrastructure are excluded from the published package. The original source release is also available as a [ZIP](https://linkdevi.com/linkdevi-mcp-0.1.0.zip); its path-based setup remains supported.

See the [AI connection guide](https://linkdevi.com/features/ai) and [API help](https://linkdevi.com/help/api) for service setup. This connector sends tool inputs and the scoped credential only to the configured LinkDevi origin. Your chosen AI client has its own data handling policy.

## Source and contributions

Source, tests and issue tracking: [kgma-glitch/linkdevi-mcp](https://github.com/kgma-glitch/linkdevi-mcp). Run `npm ci` and `npm test` before proposing a change. Never include real account keys, customer destinations or private logs in an issue.
