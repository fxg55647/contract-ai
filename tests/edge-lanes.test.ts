import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateEdgeLanes } from "../shared/edge-lanes";

test("parallel overlapping tracks get at least 18 pixels of clearance", () => {
  const tracks = Array.from({ length: 8 }, (_, i) => ({
    id: `e${i}`, horizontal: true, center: 100 + i, from: 0, to: 200,
  }));
  const lanes = allocateEdgeLanes(tracks);
  const coordinates = tracks.map(t => t.center + lanes.get(t.id)!);
  coordinates.forEach((coordinate, i) => coordinates.slice(i + 1).forEach(other =>
    assert.ok(Math.abs(coordinate - other) >= 18)));
  assert.deepEqual(allocateEdgeLanes([...tracks].reverse()), lanes);
});

test("opposite directions on the same span use separate bend tracks", () => {
  const lanes = allocateEdgeLanes([
    { id: "request", horizontal: false, center: 100, from: 0, to: 200 },
    { id: "response", horizontal: false, center: 100, from: 200, to: 0 },
  ]);
  assert.ok(Math.abs(lanes.get("request")! - lanes.get("response")!) >= 18);
});

test("distant spans and perpendicular tracks do not consume parallel lanes", () => {
  const lanes = allocateEdgeLanes([
    { id: "a", horizontal: true, center: 100, from: 0, to: 100 },
    { id: "b", horizontal: true, center: 100, from: 200, to: 300 },
    { id: "c", horizontal: false, center: 100, from: 0, to: 100 },
  ]);
  assert.deepEqual([...lanes.values()], [0, 0, 0]);
});
