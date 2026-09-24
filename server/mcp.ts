import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { patchSchema, nodeIdSchema } from "../shared/model";
import { SYSTEM_PROMPT } from "../shared/prompts";
import { sourceDocumentIdSchema } from "../shared/sources";

const base = process.env.CONTRACT_SERVER_URL || "http://127.0.0.1:4317";
const server = new McpServer(
  { name: "sopimuskartta", version: "2.0.0" },
  {
    instructions:
      SYSTEM_PROMPT.replaceAll("submit_graph_changes", "apply_changes") +
      "\nWhen asked to visualize a document: import its complete verbatim text using import_source_document, then read every page from read_source_fragments until nextOffset is null. Never assume a ChatGPT attachment is automatically available to this server. Do not summarize text during import; report incomplete extraction. Identify definitions, exceptions and cross-references before modeling. One fragment may support multiple nodes; one node may cite multiple fragments. Preserve all supported sourceRefs. Check every fragment for coverage and report unmodeled or uncertain parts; a valid reference alone does not prove the interpretation. Use save_draft to display requested drafts in the workspace. These tools do not call another AI provider." +
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
server.registerTool("import_source_document", {
  description: "Store complete verbatim source text read-only. Server splits it into stable fragments. Maximum 60000 characters; never silently truncate. Does not generate a graph.",
  inputSchema: { title: z.string().min(1).max(200), content: z.string().min(1).max(60000) },
}, args => result("/api/sources", args));
server.registerTool("list_source_documents", {
  description: "List source documents and fragment counts before reading them.",
  annotations: { readOnlyHint: true }, inputSchema: {},
}, () => result("/api/sources"));
server.registerTool("read_source_fragments", {
  description: "Read exact source excerpts. Continue with nextOffset until null before claiming full coverage.",
  annotations: { readOnlyHint: true },
  inputSchema: { documentId: sourceDocumentIdSchema, offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(30).default(10) },
}, args => result(`/api/sources/${args.documentId}/fragments?offset=${args.offset}&limit=${args.limit}`));
server.registerTool("save_draft", {
  description: "Save a requested contract draft based on the current model revision for display and download in the browser. Keep unresolved terms explicit.",
  inputSchema: { text: z.string().min(1).max(120000), expectedRevision: z.number().int().nonnegative() },
}, args => result("/api/draft", args));
await server.connect(new StdioServerTransport());
