import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { patchSchema, nodeIdSchema } from "../shared/model";
import { SYSTEM_PROMPT } from "../shared/prompts";
import { liveSourceApplicationSchema, sourceDocumentIdSchema } from "../shared/sources";

const base = process.env.CONTRACT_SERVER_URL || "http://127.0.0.1:4317";
const server = new McpServer(
  { name: "semantic-logic-mapper", version: "2.0.0" },
  {
    instructions:
      SYSTEM_PROMPT.replaceAll("submit_graph_changes", "apply_changes") +
      "\nWhen asked to visualize an external document, first tell the user to open that document in Microsoft Word or LibreOffice Writer. Do not model it until an open live document is available through the corresponding document connector. Read the live document there; never upload or copy the complete source into this workspace. After analysis, call register_live_source_excerpts with only the exact passages actually cited by graph nodes and stable locators such as bookmarks, headings or section identifiers. Then use the returned documentId and fragment IDs in sourceRefs. Identify definitions, exceptions and cross-references before modeling. Preserve all supported sourceRefs and report unmodeled or uncertain parts; a valid reference alone does not prove the interpretation. Use save_draft to display requested drafts in the workspace. These tools do not call another AI provider." +
      "\nRead get_workspace before editing. Use apply_changes with its revision as expectedRevision. The browser updates live. Never replace existing nodes merely to regenerate a graph. The workspace is local and shared with the person using the editor.",
  },
);
async function request(path: string, body?: unknown) {
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-contract-client": "mcp" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}
async function result(path: string, body?: unknown) {
  try {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(await request(path, body)),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}
server.registerTool(
  "get_workspace",
  {
    description:
      "Read the current contract model, stable N identifiers, nextNodeNumber, revision, selected node, conversation and recent changes. Read before every mutation.",
    annotations: { readOnlyHint: true },
    inputSchema: {},
  },
  () => result("/api/state"),
);
server.registerTool("create_map", {
  description: "Create and activate a new map in the current cart file. Use when the user wants a separate visualization rather than replacing the active map.",
  inputSchema: { title: z.string().trim().min(1).max(160).optional(), expectedRevision: z.number().int().nonnegative() },
}, args => result("/api/maps", args));
server.registerTool("select_map", {
  description: "Activate one map already listed by get_workspace. Switching maps clears active-map undo history and increments the active revision.",
  inputSchema: { id: z.string().regex(/^M[1-9]\d{0,5}$/), expectedRevision: z.number().int().nonnegative() },
}, args => result("/api/maps/select", args));
server.registerTool("delete_map", {
  description: "Permanently delete one map from the cart file. Use only when explicitly requested. Deleting the last map creates a new empty replacement.",
  inputSchema: { id: z.string().regex(/^M[1-9]\d{0,5}$/), expectedRevision: z.number().int().nonnegative() },
}, args => result("/api/maps/delete", args));
server.registerTool(
  "apply_changes",
  {
    description:
      "Atomically apply targeted contract changes. expectedRevision prevents overwriting human edits. New node IDs must be unused N numbers at or above nextNodeNumber. Describe the change in summary. Deleting a node also deletes its connections. Existing node positions and IDs should be preserved.",
    inputSchema: patchSchema.shape,
  },
  (args) => result("/api/changes", args),
);
server.registerTool(
  "focus_node",
  {
    description:
      "Select a named node in the shared browser view. Pass null to clear.",
    inputSchema: { id: nodeIdSchema.nullable() },
  },
  (args) => result("/api/selection", args),
);
server.registerTool(
  "validate_model",
  {
    description:
      "Find unreachable steps, incomplete branches and unresolved questions. These structural checks do not establish legal correctness.",
    annotations: { readOnlyHint: true },
    inputSchema: {},
  },
  () => result("/api/validate"),
);
server.registerTool(
  "undo_change",
  {
    description:
      "Undo the most recent shared model change (including a human edit). Use only when asked to undo; first inspect the latest history.",
    inputSchema: { expectedRevision: z.number().int().nonnegative() },
  },
  (args) => result("/api/undo", args),
);
server.registerResource(
  "workspace",
  "contract://workspace",
  {
    mimeType: "application/json",
    description: "The live shared contract model and conversation",
  },
  async (uri) => ({
    contents: [
      { uri: uri.href, text: JSON.stringify(await request("/api/state")) },
    ],
  }),
);
server.registerTool("register_live_source_excerpts", {
  description: "Register only exact passages cited from an already open Word/Writer document, together with stable locators. Never send the complete source document. Returns IDs for node sourceRefs.",
  inputSchema: {
    title: z.string().trim().min(1).max(200),
    application: liveSourceApplicationSchema,
    externalDocumentId: z.string().trim().min(1).max(500),
    excerpts: z.array(z.object({
      locator: z.string().trim().min(1).max(500),
      heading: z.string().trim().max(200).optional(),
      quote: z.string().min(1).max(2400).refine(value => value.trim().length > 0),
    }).strict()).min(1).max(500).refine(
      excerpts => excerpts.reduce((total, excerpt) => total + excerpt.quote.length, 0) + 2 * (excerpts.length - 1) <= 60_000,
      "Combined source excerpts must be at most 60,000 characters.",
    ),
  },
}, args => result("/api/live-sources", args));
server.registerTool("list_source_documents", {
  description: "List registered source excerpt sets and fragment counts.",
  annotations: { readOnlyHint: true }, inputSchema: {},
}, () => result("/api/sources"));
server.registerTool("read_source_fragments", {
  description: "Read the exact cited excerpts retained for sourceRefs. This is not the complete source document; read that from the open Word/Writer session.",
  annotations: { readOnlyHint: true },
  inputSchema: { documentId: sourceDocumentIdSchema, offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(30).default(10) },
}, args => result(`/api/sources/${args.documentId}/fragments?offset=${args.offset}&limit=${args.limit}`));
server.registerTool("save_draft", {
  description: "Save a requested contract draft based on the current model revision for display and download in the browser. Keep unresolved terms explicit.",
  inputSchema: { text: z.string().min(1).max(120000), expectedRevision: z.number().int().nonnegative() },
}, args => result("/api/draft", args));
await server.connect(new StdioServerTransport());
