import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyPatch,
  emptyModel,
  freePosition,
  modelWarnings,
  newNode,
  validateModel,
  type Operation,
} from "../shared/model";
import { exampleModel } from "../shared/example";
import { WorkspaceStore } from "../server/store";

const apply = (store: WorkspaceStore, operations: Operation[]) =>
  store.apply(
    {
      expectedRevision: store.snapshot().model.revision,
      summary: "Testimuutos",
      operations,
    },
    "test",
  );
test("a transaction is atomic when a later operation is invalid", () => {
  const store = new WorkspaceStore();
  assert.throws(() =>
    apply(store, [
      { type: "add_node", node: newNode("N1", { x: 0, y: 0 }) },
      {
        type: "add_edge",
        edge: { id: "E1", source: "N1", target: "N9", label: "" },
      },
    ]),
  );
  assert.deepEqual(store.snapshot().model, emptyModel());
});
test("stale AI changes cannot overwrite human edits", () => {
  const store = new WorkspaceStore();
  apply(store, [{ type: "add_node", node: newNode("N1", { x: 0, y: 0 }) }]);
  assert.throws(
    () =>
      store.apply(
        {
          expectedRevision: 0,
          summary: "AI",
          operations: [{ type: "set_title", title: "Wrong" }],
        },
        "ai",
      ),
    /muuttui/,
  );
  assert.equal(store.snapshot().model.title, "Uusi sopimusrakenne");
});
test("targeted edits preserve identity and human layout", () => {
  const model = exampleModel();
  const next = applyPatch(model, {
    expectedRevision: 0,
    summary: "Täsmennys",
    operations: [
      {
        type: "update_node",
        id: "N4",
        changes: { text: "Toimittajalla on 14 päivää ilmoituksen vastaanottamisesta." },
      },
    ],
  });
  assert.deepEqual(
    next.nodes.map((n) => [n.id, n.position]),
    model.nodes.map((n) => [n.id, n.position]),
  );
  assert.deepEqual(next.edges, model.edges);
});
test("deletion cleans up edges and undo restores them without reusing IDs", () => {
  const store = new WorkspaceStore();
  store.restore(exampleModel(), 0, "test");
  apply(store, [{ type: "delete_node", id: "N3" }]);
  assert.ok(
    !store
      .snapshot()
      .model.edges.some((e) => e.source === "N3" || e.target === "N3"),
  );
  store.undo(2);
  assert.ok(store.snapshot().model.nodes.some((n) => n.id === "N3"));
  assert.equal(store.snapshot().model.edges.length, 6);
  apply(store, [{ type: "add_node", node: newNode("N7", { x: 0, y: 0 }) }]);
  store.undo(4);
  assert.equal(store.snapshot().model.nextNodeNumber, 8);
  assert.throws(
    () =>
      apply(store, [{ type: "add_node", node: newNode("N7", { x: 0, y: 0 }) }]),
    /käytetty/,
  );
});
test("duplicates, self loops, missing entry and malformed data are rejected", () => {
  const model = exampleModel();
  assert.throws(() =>
    validateModel({ ...model, nodes: [...model.nodes, model.nodes[0]] }),
  );
  assert.throws(() =>
    validateModel({ ...model, edges: [...model.edges, model.edges[0]] }),
  );
  assert.throws(() =>
    validateModel({
      ...model,
      edges: [{ id: "E0", source: "N1", target: "N1", label: "" }],
    }),
  );
  assert.throws(() => validateModel({ ...model, entry: "N99" }));
  assert.throws(() =>
    validateModel({
      ...model,
      nodes: [{ ...model.nodes[0], position: { x: NaN, y: 0 } }],
    }),
  );
});
test("new siblings use free space instead of stacking", () => {
  const first = newNode("N1", { x: 0, y: 300 });
  const position = freePosition([first], first.position);
  assert.ok(position.x >= first.position.x + 440);
});

test("unpositioned AI additions follow their parent without moving existing nodes", () => {
  const before = exampleModel();
  const { position: _position, ...node } = newNode("N7", { x: 0, y: 0 });
  const after = applyPatch(before, {
    expectedRevision: 0,
    summary: "Uusi jatko",
    operations: [
      { type: "add_node", node },
      {
        type: "add_edge",
        edge: { id: "E7", source: "N6", target: "N7", label: "Sovittu jatko" },
      },
    ],
  });
  assert.ok(after.nodes[6].position.y > before.nodes[5].position.y);
  assert.deepEqual(after.nodes.slice(0, 6), before.nodes);
});
test("structural warnings retain unresolved and disconnected content", () => {
  const model = exampleModel();
  model.nodes.push(newNode("N7", { x: 0, y: 0 }));
  model.nextNodeNumber = 8;
  assert.ok(
    modelWarnings(model).some(
      (w) => w.nodeId === "N7" && w.text.includes("aloituskohdasta"),
    ),
  );
  model.edges.filter((e) => e.source === "N1").forEach((e) => { e.label = ""; });
  assert.ok(
    modelWarnings(model).some(
      (w) => w.nodeId === "N1" && w.text.includes("vaihtoehtojen"),
    ),
  );
});
test("workspace survives restart with selection, conversation and undo history", () => {
  const dir = mkdtempSync(join(tmpdir(), "contract-test-"));
  try {
    const file = join(dir, "workspace.json");
    const store = new WorkspaceStore(file);
    store.restore(exampleModel(), 0, "test");
    store.message("user", "Täsmennetään korjausaikaa.");
    store.select("N4");
    store.setDraft("Luonnos", 1);
    const reopened = new WorkspaceStore(file);
    assert.deepEqual(reopened.snapshot(), store.snapshot());
    reopened.undo(1);
    assert.equal(reopened.snapshot().model.nodes.length, 0);
    assert.equal(reopened.snapshot().selection, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("legacy node fields are combined and branches are inferred from edges", () => {
  const current = exampleModel();
  const legacy = {
    ...current,
    nodes: current.nodes.map(({ title, text, open, ...node }) => ({
      ...node,
      kind: "decision",
      name: title,
      status: open ? "open" : "proposed",
      actor: "Toimittaja",
      summary: text,
      details: "Tarkka ehto",
      source: "Vanha lähdekenttä",
      question: open ? "Mikä on vielä avoinna?" : "",
    })),
  };
  const migrated = validateModel(legacy);
  assert.ok(migrated.nodes.every(node => !("kind" in node) && !("name" in node)));
  assert.match(migrated.nodes[0].text, /Vastuullinen osapuoli: Toimittaja/);
  assert.equal(migrated.nodes[0].open, true);
  const terminal = { ...migrated, edges: [] };
  assert.ok(!modelWarnings(terminal).some(w => w.text.includes("vaihtoehdot") || w.text.includes("lopputulos")));
  assert.throws(() => applyPatch(migrated, {
    expectedRevision: migrated.revision, summary: "Invalid obsolete type",
    operations: [{ type: "update_node", id: migrated.nodes[0].id, changes: { kind: "action" } }]
  }));
});
