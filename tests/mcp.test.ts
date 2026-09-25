import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createApp } from "../server/http";
import { WorkspaceStore } from "../server/store";
import { newNode } from "../shared/model";

test("real MCP stdio client can read, edit, focus and undo the same HTTP workspace", async () => {
  const store = new WorkspaceStore();
  const http = createApp(store).listen(0, "127.0.0.1");
  await once(http, "listening");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("node_modules/tsx/dist/cli.mjs"), resolve("server/mcp.ts")],
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (e): e is [string, string] => e[1] !== undefined,
        ),
      ),
      CONTRACT_SERVER_URL: `http://127.0.0.1:${(http.address() as AddressInfo).port}`,
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "contract-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const names = (await client.listTools()).tools.map(tool => tool.name);
    assert.ok(names.includes("register_live_source_excerpts"));
    assert.ok(!names.includes("import_source_document"));
    assert.ok(!names.includes("export_model"));
    const imported = await client.callTool({
      name: "register_live_source_excerpts",
      arguments: {
        title: "Agreement",
        application: "libreoffice-writer",
        externalDocumentId: "writer-doc-1",
        excerpts: [{
          locator: "bookmark:delivery",
          heading: "1. Delivery",
          quote: "The supplier delivers by June 30.",
        }],
      },
    });
    assert.ok(!imported.isError);
    const excerpts = await client.callTool({ name: "read_source_fragments", arguments: { documentId: "D1", offset: 0, limit: 1 } });
    assert.ok(!excerpts.isError);
    assert.match(JSON.stringify(excerpts), /D1-F1/);
    const initial = await client.callTool({
      name: "get_workspace",
      arguments: {},
    });
    assert.ok(!initial.isError);
    const added = await client.callTool({
      name: "apply_changes",
      arguments: {
        expectedRevision: 0,
        summary: "Lisätty MCP:llä",
        operations: [
          { type: "add_node", node: newNode("N1", { x: 100, y: 80 }) },
        ],
      },
    });
    assert.ok(!added.isError);
    assert.equal(store.snapshot().model.nodes[0].id, "N1");
    await client.callTool({ name: "focus_node", arguments: { id: "N1" } });
    assert.equal(store.snapshot().selection, "N1");
    const stale = await client.callTool({
      name: "apply_changes",
      arguments: {
        expectedRevision: 0,
        summary: "Vanha",
        operations: [{ type: "set_title", title: "Ei saa tallentua" }],
      },
    });
    assert.equal(stale.isError, true);
    await client.callTool({
      name: "undo_change",
      arguments: { expectedRevision: 1 },
    });
    assert.equal(store.snapshot().model.nodes.length, 0);
    assert.equal(
      (await client.readResource({ uri: "contract://workspace" })).contents
        .length,
      1,
    );
  } finally {
    await client.close();
    http.closeAllConnections();
    await new Promise<void>((r) => http.close(() => r()));
  }
});
