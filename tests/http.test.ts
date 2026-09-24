import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { createApp } from "../server/http";
import { WorkspaceStore } from "../server/store";
import { newNode } from "../shared/model";

test("HTTP source import, model export and live editing work without AI credentials", async () => {
  const store = new WorkspaceStore();
  const server = createApp(store).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function post(path: string, body: unknown, headers = {}) {
    return fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }
  try {
    const denied = await post(
      "/api/changes",
      {},
      { origin: "https://evil.example" },
    );
    assert.equal(denied.status, 403);
    const response = await post("/api/changes", {
      expectedRevision: 0,
      summary: "Ensimmäinen vaihe",
      operations: [{ type: "add_node", node: newNode("N1", { x: 0, y: 0 }) }],
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).model.revision, 1);
    const conflict = await post("/api/changes", {
      expectedRevision: 0,
      summary: "Vanha",
      operations: [{ type: "set_title", title: "Vanha" }],
    });
    assert.equal(conflict.status, 409);
    const source = await post("/api/sources", { title: "Agreement", content: "  1. Delivery\nDeliver within 14 days.  " });
    assert.equal(source.status, 200);
    assert.equal(store.snapshot().sourceDocuments[0].content, "  1. Delivery\nDeliver within 14 days.  ");
    const pkg = await (await fetch(base + "/api/package")).json();
    assert.equal(pkg.format, "contract-map");
    assert.equal(pkg.sourceDocuments.length, 1);
    const ai = await post("/api/chat", { apiKey: "test-secret-never-saved" });
    assert.equal(ai.status, 404);
    assert.ok(!JSON.stringify(store.snapshot()).includes("test-secret-never-saved"));
    const abort = new AbortController();
    const stream = await fetch(base + "/api/events", { signal: abort.signal });
    const reader = stream.body!.getReader();
    const first = await reader.read();
    assert.match(new TextDecoder().decode(first.value), /Uusi sopimusrakenne/);
    store.select("N1");
    const second = await reader.read();
    assert.match(new TextDecoder().decode(second.value), /"selection":"N1"/);
    abort.abort();
    await reader.cancel().catch(() => {});
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
