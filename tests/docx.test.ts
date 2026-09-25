import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { WorkspaceStore } from "../server/store";
import { newNode } from "../shared/model";

test("DOCX carries the editable model, source quotes and draft as one file", async () => {
  const original = new WorkspaceStore();
  const source = original.addSourceDocument("1. Delivery\nDelivery within 14 days.", "", "Agreement");
  const node = {
    ...newNode("N1", { x: 120, y: 80 }),
    sourceRefs: [{ documentId: source.id, fragmentId: source.fragments[0].id, quote: "Delivery within 14 days." }],
  };
  original.apply({ expectedRevision: 0, summary: "Map", operations: [{ type: "add_node", node }] }, "test");
  original.setDraft("Contract draft", 1);

  const { buffer, fileName } = await original.saveDocument();
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
  assert.equal(fileName, "semantic-logic-map.docx");
  assert.equal(original.snapshot().document.dirty, false);

  const target = new WorkspaceStore();
  await target.openDocumentBuffer(buffer, "agreement.docx", 0);
  const state = target.snapshot();
  assert.equal(state.document.fileName, "agreement.docx");
  assert.equal(state.document.dirty, false);
  assert.equal(state.model.nodes[0].position.x, 120);
  assert.equal(state.model.nodes[0].sourceRefs[0].quote, "Delivery within 14 days.");
  assert.equal(state.sourceDocuments[0].content, source.content);
  assert.equal(state.draft?.text, "Contract draft");
});

test("DOCX carries multiple independent maps and the active map", async () => {
  const original = new WorkspaceStore();
  original.apply({
    expectedRevision: 0,
    summary: "First map",
    operations: [{ type: "add_node", node: { ...newNode("N1", { x: 10, y: 20 }), title: "Ensimmäinen" } }],
  }, "test");
  original.createMap("Toinen mappi", 1);
  original.apply({
    expectedRevision: 2,
    summary: "Second map",
    operations: [{ type: "add_node", node: { ...newNode("N1", { x: 30, y: 40 }), title: "Toinen" } }],
  }, "test");

  const { buffer } = await original.saveDocument();
  const target = new WorkspaceStore();
  await target.openDocumentBuffer(buffer, "maps.docx", 0);
  let state = target.snapshot();
  assert.equal(state.maps.length, 2);
  assert.equal(state.activeMapId, "M2");
  assert.equal(state.model.nodes[0].title, "Toinen");

  target.activateMap("M1", state.model.revision);
  state = target.snapshot();
  assert.equal(state.model.nodes[0].title, "Ensimmäinen");
  target.deleteMap("M2", state.model.revision);
  assert.deepEqual(target.snapshot().maps.map(map => map.id), ["M1"]);
});

test("text edited outside the app is preserved and flagged for review", async () => {
  const source = new WorkspaceStore();
  source.replaceModel({
    revision: 0,
    nextNodeNumber: 1,
    title: "Agreement",
    entry: null,
    nodes: [],
    edges: [],
  }, 0, "test");
  const first = await source.saveDocument();
  const zip = await JSZip.loadAsync(first.buffer);
  const documentXml = await zip.file("word/document.xml")!.async("string");
  zip.file("word/document.xml", documentXml.replace("Agreement", "Agreement changed in Word"));
  const edited = await zip.generateAsync({ type: "nodebuffer" });

  const target = new WorkspaceStore();
  await target.openDocumentBuffer(edited, "changed.docx", 0);
  assert.equal(target.snapshot().document.textChanged, true);
  const saved = await target.saveDocument();
  const savedZip = await JSZip.loadAsync(saved.buffer);
  assert.match(await savedZip.file("word/document.xml")!.async("string"), /Agreement changed in Word/);
  assert.equal(target.snapshot().document.textChanged, false);
});

test("invalid embedded data cannot replace the current workspace", async () => {
  const source = new WorkspaceStore();
  source.apply({ expectedRevision: 0, summary: "Keep", operations: [{ type: "add_node", node: newNode("N1", { x: 0, y: 0 }) }] }, "test");
  const valid = await source.saveDocument();
  const zip = await JSZip.loadAsync(valid.buffer);
  zip.file("customXml/item1.xml", '<contract-map xmlns="urn:sopimuskartta:document:1"><data encoding="base64">broken</data></contract-map>');
  const invalid = await zip.generateAsync({ type: "nodebuffer" });

  const target = new WorkspaceStore();
  target.apply({ expectedRevision: 0, summary: "Existing", operations: [{ type: "add_node", node: newNode("N1", { x: 0, y: 0 }) }] }, "test");
  const before = target.snapshot();
  await assert.rejects(() => target.openDocumentBuffer(invalid, "bad.docx", 1), /Semantic Logic Mapper data/);
  assert.deepEqual(target.snapshot(), before);
});
