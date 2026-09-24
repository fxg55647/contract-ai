import { test } from "node:test";
import assert from "node:assert/strict";
import { WorkspaceStore } from "../server/store";
import { newNode } from "../shared/model";

test("portable package preserves source quotes, remaps collisions and supports graph undo", () => {
  const original = new WorkspaceStore();
  const source = original.addSourceDocument("1. Delivery\nDelivery within 14 days.", "", "Agreement");
  const node = { ...newNode("N1", { x: 0, y: 0 }), sourceRefs: [{ documentId: source.id, fragmentId: source.fragments[0].id }] };
  original.apply({ expectedRevision: 0, summary: "Map", operations: [{ type: "add_node", node }] }, "test");
  const target = new WorkspaceStore();
  target.addSourceDocument("Unrelated original source", "");
  target.importPackage(original.exportPackage(), 0);
  const state = target.snapshot();
  assert.equal(state.model.nodes[0].sourceRefs[0].documentId, "D2");
  assert.equal(state.sourceDocuments[1].content, source.content);
  assert.equal(state.sourceDocuments[0].content, "Unrelated original source");
  target.undo(1);
  assert.equal(target.snapshot().model.nodes.length, 0);
  target.undo(2, true);
  assert.equal(target.snapshot().model.nodes[0].sourceRefs[0].fragmentId, "D2-F1");
  const invalid = original.exportPackage();
  invalid.sourceDocuments[0].fragments[0].text = "invented quote";
  const before = target.snapshot();
  assert.throws(() => target.importPackage(invalid, 3), /katkelma/);
  assert.deepEqual(target.snapshot(), before);
});
