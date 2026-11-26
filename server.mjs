import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export function createServer({
  baseUrl = "https://linkdevi.com",
  apiKey,
  fetchImpl = fetch,
} = {}) {
  const base = new URL(baseUrl);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/" ||
    !(
      base.protocol === "https:" ||
      (base.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
    )
  )
    throw new Error("Use an HTTPS origin, or localhost HTTP for development");
  if (!apiKey || !/^su_[a-zA-Z0-9]+$/.test(apiKey))
    throw new Error("Set LINKDEVI_API_KEY to your scoped key");
  const server = new McpServer({ name: "linkdevi", version });
  const campaign = {
    requestId: z
      .string()
      .uuid()
      .describe(
        "Stable UUID for this intent. Reuse the same UUID and identical payload after a timeout; never invent a new UUID for a retry.",
      ),
    name: z.string().min(1).max(100),
    url: z.string().max(2048),
    utmCampaign: z.string().min(1).max(100),
    domain: z.string().default("linkdevi.com"),
    channels: z
      .array(
        z.enum([
          "facebook",
          "instagram",
          "tiktok",
          "line",
          "email",
          "print",
          "youtube",
          "x",
        ]),
      )
      .min(1)
      .max(8),
  };
  async function call(action, args) {
    try {
      const response = await fetchImpl(new URL("/api/v1/agent", base), {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(25000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, ...args }),
      });
      const value = await response.json();
      const { qrDataUrl, ...metadata } = value;
      const data = { status: response.status, ...metadata };
      if (
        response.ok &&
        typeof qrDataUrl === "string" &&
        qrDataUrl.startsWith("data:image/png;base64,")
      )
        return {
          content: [
            {
              type: "image",
              mimeType: "image/png",
              data: qrDataUrl.slice("data:image/png;base64,".length),
            },
            { type: "text", text: JSON.stringify(data) },
          ],
          structuredContent: data,
        };
      return {
        ...(response.ok ? {} : { isError: true }),
        content: [{ type: "text", text: JSON.stringify(data) }],
        structuredContent: data,
      };
    } catch {
      // Never include raw network errors/headers; they can contain credentials.
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "LinkDevi request unavailable. A creation may have committed: retry only with the original requestId and identical payload. No automatic retry was performed.",
          },
        ],
      };
    }
  }
  function tool(
    name,
    description,
    inputSchema,
    readOnlyHint,
    adapt = (args) => args,
  ) {
    server.registerTool(
      name,
      {
        description,
        inputSchema,
        annotations: {
          readOnlyHint,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      (args) => call(name, adapt(args)),
    );
  }
  tool(
    "capabilities",
    "Read workspace plan, stored-link usage, required scopes, limits and metric definitions. This does not grant additional permissions.",
    {},
    true,
  );
  tool(
    "preview_campaign",
    "Preview exact UTM destinations and number of links to create. Creates no resources; this is not a quota reservation.",
    campaign,
    true,
    (campaign) => ({ campaign }),
  );
  tool(
    "create_campaign",
    "Create a saved campaign with one short link per channel. Consumes one stored-link slot per channel. Reuse requestId and payload on retry; changed payload conflicts. Use preview_campaign to inspect destinations first.",
    campaign,
    false,
    (campaign) => ({ campaign }),
  );
  tool(
    "list_campaigns",
    "List saved campaigns in this workspace. Counter values include automated redirects; not unique people or revenue.",
    { page: z.number().int().min(1).max(10000).default(1) },
    true,
  );
  tool(
    "link_qr",
    "Render a PNG QR for an existing workspace link using its saved short domain. Does not create a stored QR resource.",
    {
      linkId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
      size: z.number().int().min(100).max(512).default(300),
    },
    true,
  );
  tool(
    "campaign_stats",
    "Read lifetime recorded redirect counters for a saved campaign. Includes bots/previews, may miss failed updates. No date series, unique people, sales or attribution are available from these counters. A missing channel is unavailable, not zero.",
    { campaignId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) },
    true,
  );
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await createServer({
      baseUrl: process.env.LINKDEVI_BASE_URL,
      apiKey: process.env.LINKDEVI_API_KEY,
    }).connect(new StdioServerTransport());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
