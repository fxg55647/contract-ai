import { test } from "node:test";
import assert from "node:assert/strict";
import { createSourceDocument, splitSourceText } from "../shared/sources";
import { newNode } from "../shared/model";
import { WorkspaceStore } from "../server/store";

test("source text is split into exact, addressable excerpts", () => {
  const content = "7.2 Toimitus\nToimittajan on toimitettava tuote 14 päivässä.\n\n7.3 Viivästys\nViivästyksestä on ilmoitettava kirjallisesti.";
  const document = createSourceDocument(content, 3, "message-1", "2026-09-20T10:00:00.000Z");
  assert.equal(document.id, "D3");
  assert.equal(document.fragments.length, 2);
  assert.equal(document.fragments[0].id, "D3-F1");
  assert.equal(document.fragments[0].heading, "7.2 Toimitus");
  for (const fragment of document.fragments) {
    assert.equal(content.slice(fragment.start, fragment.end), fragment.text);
  }
});

test("long paragraphs are split without losing source characters", () => {
  const content = Array.from({ length: 90 }, (_, index) => `Lause ${index + 1} sisältää sopimusehdon.`).join(" ");
  const fragments = splitSourceText(content, 400);
  assert.ok(fragments.length > 1);
  assert.ok(fragments.every((fragment) => fragment.text.length <= 400));
  assert.equal(fragments.map((fragment) => fragment.text).join("").replace(/\s+/g, ""), content.replace(/\s+/g, ""));
});

test("numbered clauses become separate excerpts even without blank lines", () => {
  const content = "7.2 Toimitus\nTuote toimitetaan ajoissa.\n7.3 Viivästys\nViivästyksestä ilmoitetaan.";
  const fragments = splitSourceText(content);
  assert.deepEqual(fragments.map((fragment) => fragment.heading), ["7.2 Toimitus", "7.3 Viivästys"]);
});

test("workspace keeps immutable sources and rejects invented references", async () => {
  const store = new WorkspaceStore();
  const message = store.message("user", "7.2 Toimitus\nToimitus tehdään 14 päivässä.");
  const document = store.addSourceDocument(message.content, message.id);
  assert.equal(store.addSourceDocument(message.content, message.id).id, document.id);
  assert.equal(store.snapshot().sourceDocuments.length, 1);

  const node = newNode("N1", { x: 0, y: 0 });
  node.sourceRefs = [{ documentId: document.id, fragmentId: document.fragments[0].id }];
  store.apply({ expectedRevision: 0, summary: "Lähteistetty vaihe", operations: [{ type: "add_node", node }] }, "test");
  assert.equal(store.snapshot().model.nodes[0].sourceRefs[0].fragmentId, "D1-F1");
  assert.throws(() => store.apply({ expectedRevision: 1, summary: "Keksitty lainaus", operations: [{ type: "update_node", id: "N1", changes: { sourceRefs: [{ documentId: "D1", fragmentId: "D1-F1", quote: "Toimitus tehdään 30 päivässä." }] } }] }, "test"), /sanatarkka/);
  store.apply({ expectedRevision: 1, summary: "Tarkka lainaus", operations: [{ type: "update_node", id: "N1", changes: { sourceRefs: [{ documentId: "D1", fragmentId: "D1-F1", quote: "Toimitus tehdään 14 päivässä." }] } }] }, "test");
  store.apply({ expectedRevision: 2, summary: "Siirto", operations: [{ type: "update_node", id: "N1", changes: { position: { x: 20, y: 30 } } }] }, "test");
  assert.equal(store.snapshot().model.nodes[0].sourceRefs[0].quote, "Toimitus tehdään 14 päivässä.");
  const imported = new WorkspaceStore();
  const documentFile = await store.saveDocument();
  await imported.openDocumentBuffer(documentFile.buffer, documentFile.fileName, 0);
  assert.equal(imported.snapshot().model.nodes[0].sourceRefs[0].quote, "Toimitus tehdään 14 päivässä.");

  assert.throws(() => store.apply({
    expectedRevision: 3,
    summary: "Virheellinen viite",
    operations: [{ type: "update_node", id: "N1", changes: { sourceRefs: [{ documentId: "D1", fragmentId: "D1-F99" }] } }],
  }, "test"), /puuttuvaan lähdekatkelmaan/);
});

test("a node keeps each source fragment only once", () => {
  const store = new WorkspaceStore();
  const message = store.message("user", "7.2 Toimitus\nToimitus tehdään 14 päivässä.");
  const document = store.addSourceDocument(message.content, message.id);
  const reference = { documentId: document.id, fragmentId: document.fragments[0].id };
  const node = newNode("N1", { x: 0, y: 0 });
  node.sourceRefs = [reference, { ...reference }];

  store.apply({ expectedRevision: 0, summary: "Lähteistetty vaihe", operations: [{ type: "add_node", node }] }, "test");

  assert.deepEqual(store.snapshot().model.nodes[0].sourceRefs, [reference]);
});
